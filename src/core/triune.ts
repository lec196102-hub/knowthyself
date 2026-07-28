import { env, getMainModelConfig, getReviewModelConfig } from "../config.js";
import type OpenAI from "openai";
import { createClient, callLLM } from "./llm.js";
import { ID_BASE_PROMPT, buildIdDebatePrompt } from "../agents/id.js";
import { EGO_BASE_PROMPT, buildEgoFinalPrompt } from "../agents/ego.js";
import { SUPEREGO_BASE_PROMPT, buildSuperegoDebatePrompt } from "../agents/superego.js";
import { checkContentSafety, validateUserInput } from "./safety.js";
import type { TemperamentProfile, TemperamentStyleMod } from "./temperament.js";
import { calculateScores, determineProfile, getStyleModulation } from "./temperament.js";
import type { AnswerSheet, TemperamentScores } from "./temperament.js";
import { loadProfile } from "../storage/profile-store.js";
import { MemoryStore, buildMemoryContext, mergeMemories, extractMemories } from "./memory.js";
import { loadKnowledge, saveKnowledge } from "../storage/knowledge-store.js";
import {
  extractPersonaBrief,
  buildKnowledgeContext,
  buildAgentKnowledge,
} from "./knowledge.js";
import { buildDejaVuNote } from "../agents/humanize.js";
import { webSearch, needsWebSearch } from "./websearch.js";
import { runDebate, sanitizeDebateLine, type DebateLine } from "../engine/debate.js";
import { logger } from "../shared/logger.js";
import { assembleResponse } from "../engine/responder.js";

// ==================== 数据类型 ====================

export interface TriuneResponse {
  id: { text: string; censored: boolean };
  ego: { text: string; censored: boolean };
  superego: { text: string; censored: boolean };
  safetyFlags: {
    inputFlagged: boolean;
    idViolated: boolean;
    idViolationType?: string;
    anyCensored: boolean;
  };
  /** 本轮作答所依据的联网检索来源（透明可溯，便于用户核对真实性） */
  sources?: { title: string; url: string }[];
  /** 本我↔超我「争吵」记录（作为自我综合前的可见"思考时间"），每个元素一句 */
  debate?: { speaker: "id" | "superego"; text: string }[];
  auditTrail?: {
    egoGenerated: boolean;
    idReviewed: boolean;
    superegoAudited: boolean;
    modelUsage: {
      ego: string;
      id: string;
      superego: string;
    };
  };
}

// ==================== Triune 引擎 ====================

export class TriuneEngine {
  /** 主模型客户端 (Ego) */
  private mainClient: OpenAI | null;
  /** 审查模型客户端 (Id, Superego) */
  private reviewClient: OpenAI | null;
  /** 审计模式是否激活 */
  private auditMode: boolean;
  /** 用户气质风格缓存 */
  private styleCache: Map<string, TemperamentStyleMod> = new Map();
  /** 长期记忆库（跨会话陪伴） */
  private memoryStore = new MemoryStore();
  /** 上一轮三我回复（用于注入「去重」提示，打断模板化重复；进程重启即清空，可接受） */
  private recentResponses = new Map<string, { id: string; ego: string; superego: string }>();

  constructor() {
    const mainCfg = getMainModelConfig();
    const reviewCfg = getReviewModelConfig();

    // 懒性初始化：无 API key 时不创建客户端
    this.mainClient = createClient(mainCfg);

    this.auditMode = !!(reviewCfg.model !== mainCfg.model && reviewCfg.apiKey);

    this.reviewClient = this.auditMode ? createClient(reviewCfg) : this.mainClient;
  }

  /** 设置用户气质（由答案推算） */
  setUserTemperament(userId: string, answers: AnswerSheet): TemperamentProfile {
    const scores = calculateScores(answers);
    const profile = determineProfile(scores);
    this.styleCache.set(userId, getStyleModulation(profile));
    return profile;
  }

  setUserTemperamentFromScores(userId: string, scores: TemperamentScores): TemperamentProfile {
    const profile = determineProfile(scores);
    this.styleCache.set(userId, getStyleModulation(profile));
    return profile;
  }

  getUserStyle(userId: string): TemperamentStyleMod | undefined {
    return this.styleCache.get(userId);
  }

  /** 异步更新用户长期记忆（不阻塞主响应） */
  private async updateMemory(userId: string, diary: string, ego: string, id: string): Promise<void> {
    try {
      const extracted = await extractMemories(
        this.reviewClient!,
        getReviewModelConfig().model,
        diary,
        ego,
        id,
      );
      const existing = this.memoryStore.load(userId);
      const merged = mergeMemories(existing, extracted);
      this.memoryStore.save(userId, merged);
    } catch (e) {
      logger.error("memory", ["更新长期记忆失败:", e]);
    }
  }

  /** 异步根据用户上传的文档重建「用户画像简报」（fire-and-forget，上传/删除文档时触发） */
  async rebuildPersonaBrief(userId: string): Promise<void> {
    try {
      const client = this.reviewClient ?? this.mainClient;
      if (!client) return;
      const rec = loadKnowledge(userId);
      const brief = await extractPersonaBrief(client, getReviewModelConfig().model, rec.documents);
      rec.brief = brief;
      rec.briefUpdatedAt = new Date().toISOString();
      saveKnowledge(userId, rec);
    } catch (e) {
      logger.error("knowledge", ["重建画像简报失败:", e]);
    }
  }

  /** 主入口：审计策略编排 */
  async processDiary(diaryEntry: string, userId: string = "default"): Promise<TriuneResponse> {
    // 优先用内存缓存；若缓存未命中（如服务重启后），回退到已落盘的气质答案，
    // 保证气质调制在重启后依然生效。渐进式：即使只答了部分题，
    // 也用已答内容算一个临时画像来调制语气（答得越多越准）。
    let style = this.styleCache.get(userId);
    if (!style) {
      const rec = loadProfile(userId);
      if (rec?.answers && Object.keys(rec.answers).length > 0) {
        try {
          const provisional = rec.profile ?? determineProfile(calculateScores(rec.answers));
          style = getStyleModulation(provisional);
          this.styleCache.set(userId, style);
        } catch {
          /* 答案结构异常时忽略，走无调制兜底 */
        }
      }
    }

    // 加载长期记忆（跨会话陪伴）
    const memory = this.memoryStore.load(userId);
    const memoryContext = buildMemoryContext(memory);

    // 上一轮三我回复 → 生成本轮「去重」提示（打断模板化重复）
    const prev = this.recentResponses.get(userId);
    const dejaVu = prev
      ? buildDejaVuNote(prev.id, prev.ego, prev.superego)
      : "";

    // 加载用户知识库（主动上传的日记/笔记/经历 + 三我风格设定）
    const kb = loadKnowledge(userId);
    const kbShared = buildKnowledgeContext(kb);
    const kbId = buildAgentKnowledge(kb.personaStyle.id, kbShared);
    const kbEgo = buildAgentKnowledge(kb.personaStyle.ego, kbShared);
    const kbSuperego = buildAgentKnowledge(kb.personaStyle.superego, kbShared);

    // 联网检索（仅当问题像「问事实 / 专业」时才检索，避免情绪日记被无关资料污染）
    // 检索结果经安全过滤后，注入三我提示词作为事实锚点，并随响应返回供用户核对。
    let searchContext = "";
    let sources: { title: string; url: string }[] = [];
    const searchNeeded =
      env.WEB_SEARCH_MODE === "always" ||
      (env.WEB_SEARCH_MODE === "auto" && needsWebSearch(diaryEntry));
    if (searchNeeded) {
      try {
        const results = await webSearch(diaryEntry.slice(0, 200), {
          timeoutMs: env.WEB_SEARCH_TIMEOUT_MS,
          apiUrl: env.SEARCH_API_URL,
          apiKey: env.SEARCH_API_KEY,
        });
        const safe = results
          .filter((r) => r.url && checkContentSafety(r.snippet || r.title).passed)
          .slice(0, 5);
        sources = safe.map((r) => ({ title: r.title, url: r.url }));
        searchContext = safe
          .map((r, i) => `${i + 1}. ${r.title}\n   ${r.snippet}`)
          .join("\n\n");
        if (safe.length) logger.info("websearch", `检索到 ${safe.length} 条资料`);
      } catch (e) {
        logger.error("websearch", ["检索失败，降级为空:", e]);
      }
    }

    const safetyFlags = {
      inputFlagged: false,
      idViolated: false,
      idViolationType: undefined as string | undefined,
      anyCensored: false,
    };

    const auditTrail = {
      egoGenerated: false,
      idReviewed: false,
      superegoAudited: false,
      modelUsage: {
        ego: getMainModelConfig().model,
        id: getReviewModelConfig().model,
        superego: getReviewModelConfig().model,
      },
    };

    const mainModel = getMainModelConfig().model;
    const reviewModel = getReviewModelConfig().model;

    // 检查 API key 是否已配置
    if (!this.mainClient) {
      return {
        id: { text: "未配置 LLM API Key，请先运行 npm run setup 配置。", censored: true },
        ego: { text: "请访问 http://localhost:" + env.PORT + " 查看配置指南。", censored: true },
        superego: {
          text: "免费模型推荐：硅基流动 (cloud.siliconflow.cn) 注册即送 2000 万 tokens。",
          censored: true,
        },
        safetyFlags: { inputFlagged: false, idViolated: false, anyCensored: true },
        auditTrail: {
          egoGenerated: false,
          idReviewed: false,
          superegoAudited: false,
          modelUsage: { ego: "none", id: "none", superego: "none" },
        },
      };
    }

    // TypeScript: mainClient/reviewClient 已确认非空（上方已检查）
    const mainClient = this.mainClient!;
    const reviewClient = this.reviewClient!;

    // 第零层：用户输入检测
    const inputCheck = validateUserInput(diaryEntry);
    if (!inputCheck.safe) {
      safetyFlags.inputFlagged = true;
      return {
        id: { text: inputCheck.warning!, censored: true },
        ego: { text: "你的输入包含我无法处理的内容。请重新表达。", censored: true },
        superego: {
          text: "我感受到你可能有强烈的情绪，但这种方式我无法回应。我们换个角度聊聊？",
          censored: true,
        },
        safetyFlags,
        auditTrail,
        sources: undefined,
      };
    }

    const inputSafety = checkContentSafety(diaryEntry);
    if (!inputSafety.passed) safetyFlags.inputFlagged = true;

    // ═══════ 新编排：本我↔超我「争吵」→ 自我综合 ═══════
    // 联网检索与用户案例已在上方就绪；本我(七宗罪)与超我(七美德)当着用户面抬杠，
    // 作为自我综合前的"思考时间"；最后自我(老大)结合争吵+案例+检索拍板最终答案。
    let debate: DebateLine[] = [];
    let lastId = "";
    let lastSuperego = "";
    if (env.DEBATE_ENABLED === "on") {
      const dr = await runDebate({
        client: reviewClient,
        model: reviewModel,
        diaryEntry,
        style,
        memoryContext,
        kbId,
        kbSuperego,
        dejaVu,
        searchContext,
      });
      debate = dr.debate;
      lastId = dr.lastId;
      lastSuperego = dr.lastSuperego;
      if (dr.idViolated) {
        safetyFlags.idViolated = true;
        safetyFlags.idViolationType = dr.idViolationType;
      }
      auditTrail.idReviewed = true;
      auditTrail.superegoAudited = true;
    }

    // 把争吵记录拼成自我综合所需的上下文
    const debateTranscript = debate
      .map((d) => `${d.speaker === "id" ? "本我" : "超我"}：${d.text}`)
      .join("\n");

    // —— 自我(老大)综合拍板 ——
    const egoRaw = await callLLM(
      mainClient,
      EGO_BASE_PROMPT,
      buildEgoFinalPrompt(diaryEntry, debateTranscript, style, memoryContext, kbEgo, dejaVu, searchContext),
      mainModel,
      "ego",
    );
    auditTrail.egoGenerated = true;
    const egoSafety = checkContentSafety(egoRaw);
    const egoText = egoSafety.passed ? egoRaw : "[此内容因安全策略被替换]";

    // 异步更新长期记忆（fire-and-forget，不阻塞响应；本回合用的是历史记忆）
    void this.updateMemory(userId, diaryEntry, egoText, lastId);

    // —— L3 最终过滤 + 组装响应（抽出到 engine/responder）——
    const { response, finalId, finalEgo, finalSuperego } = assembleResponse({
      lastId,
      lastSuperego,
      egoText,
      safetyFlags,
      debate,
      sources,
      auditTrail,
    });

    // 记录本轮三我回复，供下一轮「去重」提示使用
    this.recentResponses.set(userId, {
      id: finalId,
      ego: finalEgo,
      superego: finalSuperego,
    });

    return response;
  }
}

export { calculateScores, determineProfile, getStyleModulation };
export { sanitizeDebateLine };
export type { AnswerSheet, TemperamentScores, TemperamentProfile, TemperamentStyleMod };
