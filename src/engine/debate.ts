/**
 * Triune 引擎 · 本我↔超我「争吵」阶段（Phase 1b 拆分）
 *
 * 从原 core/triune.ts 抽出：sanitizeDebateLine（程序级兜底清洗）
 * 与 runDebate（本我/超我当着用户面抬杠的循环）。
 * 纯逻辑、可被单测覆盖，编排仍由 core/triune.ts 的 TriuneEngine 负责。
 */

import { env } from "../config.js";
import type OpenAI from "openai";
import { callLLM } from "../core/llm.js";
import { ID_BASE_PROMPT, buildIdDebatePrompt } from "../agents/id.js";
import { SUPEREGO_BASE_PROMPT, buildSuperegoDebatePrompt } from "../agents/superego.js";
import { checkContentSafety, detectIdViolation } from "../core/safety.js";
import type { TemperamentStyleMod } from "../core/temperament.js";

export type DebateSpeaker = "id" | "superego";
export interface DebateLine {
  speaker: DebateSpeaker;
  text: string;
}

export interface DebateResult {
  debate: DebateLine[];
  lastId: string;
  lastSuperego: string;
  idViolated: boolean;
  idViolationType?: string;
}

// ==================== 争吵台词清洗 ====================

/**
 * 程序级兜底：清洗争吵台词中的"戏精"成分（prompt 已禁止，但小模型偶尔不听话）。
 * 1) 去掉行首的舞台指示括号，如"（挑眉咧嘴）""（把手机扣桌上）"
 * 2) 去掉"本我：/超我："说话人前缀
 * 3) 若模型把整份争吵记录复述出来（含多个说话人前缀），只保留最后一段真正的新台词
 */
export function sanitizeDebateLine(raw: string): string {
  let t = raw.trim();
  // 若复述了争吵记录：按"本我：/超我："切分，取最后一个非空段
  const parts = t.split(/(?:^|\n)\s*(?:本我|超我)[：:]/).map((s) => s.trim()).filter(Boolean);
  if (parts.length > 1) t = parts[parts.length - 1]!;
  // 逐行去掉纯舞台指示行 + 行首括号旁白
  t = t
    .split("\n")
    .map((line) => line.replace(/^[（(][^）)]{1,30}[）)]\s*/, "").trim())
    .filter((line) => line.length > 0)
    .join(" ")
    .trim();
  // 再兜一次残余的说话人前缀
  t = t.replace(/^(?:本我|超我)[：:]\s*/, "");
  return t || raw.trim();
}

// ==================== 本我↔超我「争吵」循环 ====================

/**
 * 运行本我↔超我争吵阶段。仅在 `env.DEBATE_ENABLED === "on"` 时由编排层调用。
 * 返回最后一轮本我/超我台词、完整记录、以及本我是否踩线。
 */
export async function runDebate(params: {
  client: OpenAI;
  model: string;
  diaryEntry: string;
  style?: TemperamentStyleMod;
  memoryContext: string;
  kbId: string;
  kbSuperego: string;
  dejaVu: string;
  searchContext: string;
}): Promise<DebateResult> {
  const { client, model, diaryEntry, style, memoryContext, kbId, kbSuperego, dejaVu, searchContext } = params;

  const debate: DebateLine[] = [];
  let lastId = "";
  let lastSuperego = "";
  let idViolated = false;
  let idViolationType: string | undefined;

  const debateStart = Date.now();
  // 用户要求：不超过 2 轮（1 轮 = 本我一句 + 超我一句），且保底至少 2 秒观感
  const maxRounds = Math.max(1, Math.min(2, Math.floor(env.DEBATE_MAX_ROUNDS)));
  let soFar = "";

  for (let round = 1; round <= maxRounds; round++) {
    // —— 本我先撩一句（七宗罪立场）——
    const idRaw = await callLLM(
      client,
      ID_BASE_PROMPT,
      buildIdDebatePrompt(diaryEntry, soFar, style, memoryContext, kbId, dejaVu, searchContext),
      model,
      "id",
    );
    const idSafety = checkContentSafety(idRaw);
    const idText = idSafety.passed ? sanitizeDebateLine(idRaw) : "[此内容因安全策略被替换]";
    const idCheck = detectIdViolation(idRaw);
    if (idCheck.violated) {
      idViolated = true;
      idViolationType = idCheck.violationType;
    }
    debate.push({ speaker: "id", text: idText });
    lastId = idText;
    soFar += `本我：${idText}\n`;

    // —— 超我回怼（七美德立场）——
    const supRaw = await callLLM(
      client,
      SUPEREGO_BASE_PROMPT,
      buildSuperegoDebatePrompt(diaryEntry, soFar, idViolated, style, memoryContext, kbSuperego, dejaVu, searchContext),
      model,
      "superego",
    );
    const supSafety = checkContentSafety(supRaw);
    const supText = supSafety.passed ? sanitizeDebateLine(supRaw) : "[此内容因安全策略被替换]";
    debate.push({ speaker: "superego", text: supText });
    lastSuperego = supText;
    soFar += `超我：${supText}\n`;
  }

  // 保底 ≥ DEBATE_MIN_MS，给用户"在思考"的观感
  const elapsed = Date.now() - debateStart;
  if (elapsed < env.DEBATE_MIN_MS) {
    await new Promise((r) => setTimeout(r, env.DEBATE_MIN_MS - elapsed));
  }

  return { debate, lastId, lastSuperego, idViolated, idViolationType };
}
