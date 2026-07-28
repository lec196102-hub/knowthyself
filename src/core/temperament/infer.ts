/**
 * 语言推断气质画像（用户语言 → 四气质得分）
 *
 * 这是问卷之外的第二种画像构建方式：用户不用做 60 题，
 * 直接把自己的日记 / 随笔 / 碎碎念丢进来，系统从中推断四气质得分，
 * 产出与问卷同源的 `TemperamentScores`（-30~+30），无缝接入
 * `determineProfile` → `getStyleModulation` → 三我语气调制。
 *
 * 两条路径：
 *  - inferScoresFromLanguage：用 LLM 做「语义级」推断，最准；
 *  - inferScoresHeuristic：零依赖的「词法/标点」启发式兜底，没有 API key 也能跑。
 *
 * 设计要点：
 *  - 打分尺度与问卷对齐——每个维度 15 题 × ±2，故理论范围 [-30, +30]，0 为中性。
 *  - LLM 必须输出 JSON；解析层对 ```json 包裹、前后缀碎语、缺字段做容错。
 */

import type OpenAI from "openai";
import { callLLM } from "../llm.js";
import type { TemperamentScores, TemperamentType } from "./questions.js";

// ==================== 类型 ====================

/** 语言推断结果：四维度得分 + 可视化依据（透明可溯） */
export interface LanguageInferResult {
  scores: TemperamentScores;
  /** LLM 给出的依据说明（启发式兜底时为空） */
  basis: string;
  /** 本次推断实际使用的路径 */
  method: "llm" | "heuristic";
}

// ==================== LLM 版 ====================

/** 系统提示：把四气质讲清楚，并约束输出为严格 JSON */
const INFER_SYSTEM_PROMPT = `你是一位精通「四气质（体液说）」的人格分析师。
请根据用户提供的日记 / 随笔 / 碎碎念文本，推断其在四个气质维度上的倾向强度。

四气质维度说明：
- choleric（胆汁质）：热情直率、精力旺盛、情绪起伏大、易冲动、行动力强、易怒。
- sanguine（多血质）：活泼外向、适应力强、兴趣广泛、善于社交、情绪乐观但易转移。
- phlegmatic（粘液质）：稳重隐忍、情绪平稳、做事踏实、被动从容、不爱冲突。
- melancholic（抑郁质）：敏感细腻、深思内省、感受深刻、易内耗、优柔寡断、易低落。

评分规则（关键）：
- 为每个维度打一个整数分，范围从 -30（毫无此特质）到 +30（极其典型），0 表示中性/无明显信号。
- 这是相对强度评分：四个维度可以同正、同负或混合，不必互相抵消。
- 依据必须是文本中「真实的表达信号」——用词、语气、句式、情绪色调、自我觉察方式，
  而不是你主观希望用户是什么样。
- 文本越多越准；若文本极少、信号不足，各维度应贴近 0，不要强行拉高。

只输出如下结构的 JSON，不要任何解释、标题或代码块标记：
{
  "scores": {
    "choleric": <整数 -30~30>,
    "sanguine": <整数 -30~30>,
    "phlegmatic": <整数 -30~30>,
    "melancholic": <整数 -30~30>
  },
  "basis": "<一句话说明推断依据，30 字内>"
}`;

/** 把用户文本拼成一次推断请求的用户消息 */
export function buildInferPrompt(texts: string[]): string {
  const corpus = texts
    .map((t, i) => `【样本 ${i + 1}】\n${t}`)
    .join("\n\n---\n\n");
  return `以下是用户（同一人）写下的若干段文字。请综合判断其四气质倾向。

${corpus}

请只输出 JSON。`;
}

/** 从模型自由文本中挖出第一个 JSON 对象 */
function extractJsonObject(raw: string): any | null {
  if (!raw) return null;
  // 去 ```json ... ``` 包裹
  let s = raw.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  // 找第一个 { 到最后一个 } 的子串
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  s = s.slice(start, end + 1);
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const TYPE_KEYS: TemperamentType[] = ["choleric", "sanguine", "phlegmatic", "melancholic"];

/** 把任意解析结果规整成合法 TemperamentScores */
function normalizeScores(obj: any): TemperamentScores | null {
  if (!obj || typeof obj !== "object") return null;
  // 兼容 "scores" 嵌套 或直接平铺两种结构
  const src = obj.scores && typeof obj.scores === "object" ? obj.scores : obj;
  const out: Partial<TemperamentScores> = {};
  let ok = true;
  for (const k of TYPE_KEYS) {
    const v = src[k];
    if (typeof v !== "number" || !Number.isFinite(v)) {
      ok = false;
      break;
    }
    out[k] = clamp(Math.round(v), -30, 30);
  }
  return ok ? (out as TemperamentScores) : null;
}

/**
 * LLM 版语言推断：调用模型 → 解析 JSON → 规整得分。
 * 任何失败（空响应 / 解析失败 / 字段缺失）抛出，由调用方降级到启发式。
 */
export async function inferScoresFromLanguage(
  client: OpenAI,
  model: string,
  texts: string[],
): Promise<LanguageInferResult> {
  const raw = await callLLM(client, INFER_SYSTEM_PROMPT, buildInferPrompt(texts), model, "infer-tem", 1);
  const parsed = extractJsonObject(raw);
  const scores = normalizeScores(parsed);
  if (!scores) throw new Error("语言推断未能解析出合法得分");
  const basis =
    parsed && typeof parsed.basis === "string" && parsed.basis.trim().length > 0
      ? parsed.basis.trim().slice(0, 80)
      : "";
  return { scores, basis, method: "llm" };
}

// ==================== 启发式兜底（零依赖） ====================

/**
 * 词法 / 标点级启发式推断：没有 API key 或 LLM 失败时使用。
 * 思路：四气质各有可观测的语言信号，按「信号密度」做归一化打分，
 * 再 clamp 到 [-30, 30]。这是粗粒度估计，但开箱即用、零成本。
 */

// 各维度信号词（小写匹配；命中即视为该维度的语言痕迹）
const SIGNAL_WORDS: Record<TemperamentType, string[]> = {
  choleric: [
    "气死", "气愤", "烦死", "烦人", "烦透了", "受不了", "滚", "凭什么", "凭啥",
    "老子", "操", "他妈", "草", "怒", "火大", "暴躁", "真他妈", "看不惯",
    "凭啥", "凭什么", "冲", "怼", "干就完了", "急眼", "炸了", "上头", "去你的",
  ],
  sanguine: [
    "哈哈", "嘿嘿", "好玩", "开心", "太棒了", "刺激", "新鲜", "有意思", "八卦",
    "约", "聚会", "出去玩", "朋友", "热闹", "蹦迪", "逛", "嗨", "好耶", "冲鸭",
    "快乐", "爽", "种草", "安利", "八卦", "整活", "笑死", "绝了", "好玩儿",
  ],
  phlegmatic: [
    "还好", "蛮好", "无所谓", "随缘", "慢慢来", "不急", "都行", "随便", "凑合",
    "平静", "安稳", "不争", "佛系", "顺其自然", "随它去", "不care", "没所谓",
    "平平淡淡", "不慌", "看淡", "随遇而安", "也没事", "还行吧", "过得去",
  ],
  melancholic: [
    "不知道为什么", "想太多", "有点", "难受", "emo", "孤独", "孤单", "为什么",
    "没意思", "提不起", "内耗", "敏感", "委屈", "眼泪", "失眠", "撑不住",
    "迷茫", "回忆", "细腻", "想哭", "低落", "丧", "心累", "空落落", "怅然",
    "若有所失", "说不出的", "莫名其妙地", "反复", "钻牛角尖",
  ],
};

/** 统计某维度信号命中次数（允许一个词多命中） */
function countSignals(text: string): Record<TemperamentType, number> {
  const lower = text.toLowerCase();
  const counts: Record<TemperamentType, number> = {
    choleric: 0,
    sanguine: 0,
    phlegmatic: 0,
    melancholic: 0,
  };
  for (const t of TYPE_KEYS) {
    for (const w of SIGNAL_WORDS[t]) {
      if (lower.includes(w.toLowerCase())) counts[t] += 1;
    }
  }
  return counts;
}

/**
 * 启发式推断：综合
 *  - 维度信号词密度（按字数归一）
 *  - 标点气质：感叹号/问号多 → 偏胆汁；emoji 多 → 偏多血；
 *    长句且标点稀疏 → 偏粘液；长句+犹豫词(可能/也许/大概) → 偏抑郁
 * 各维度独立打分后 clamp 到 [-30, 30]。
 */
export function inferScoresHeuristic(texts: string[]): LanguageInferResult {
  const joined = texts.join("\n");
  const len = Math.max(1, joined.length);

  const sig = countSignals(joined);

  // 标点 / 句式信号
  const exclam = (joined.match(/[!！]/g) || []).length;
  const emoji = (joined.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}]/gu) || []).length;
  const sentences = joined.split(/[。.!?！？\n]+/).filter((s) => s.trim().length > 0);
  const avgSentLen = sentences.length ? joined.length / sentences.length : 0;
  const hedges = (joined.match(/可能|也许|大概|或许|有点|说不准|拿不准/g) || []).length;

  // 各维度基础分（信号词密度 × 权重）
  const w = 9;
  const scores: TemperamentScores = {
    choleric: clamp(Math.round((sig.choleric * w) / len * 1000 + exclam * 1.5), -30, 30),
    sanguine: clamp(Math.round((sig.sanguine * w) / len * 1000 + emoji * 2.0), -30, 30),
    phlegmatic: clamp(
      Math.round((sig.phlegmatic * w) / len * 1000 + (avgSentLen > 28 ? 4 : 0) + (exclam === 0 ? 3 : 0)),
      -30,
      30,
    ),
    melancholic: clamp(
      Math.round((sig.melancholic * w) / len * 1000 + (avgSentLen > 26 ? 3 : 0) + hedges * 1.2),
      -30,
      30,
    ),
  };

  return {
    scores,
    basis: "基于标点与词法的启发式估计（无模型调用）。",
    method: "heuristic",
  };
}

/**
 * 统一入口：优先 LLM，失败或无客户端时降级启发式。
 * 返回带 method 标记的结果，供调用方决定如何落盘与告知用户。
 */
export async function inferTemperamentFromTexts(
  client: OpenAI | null,
  model: string,
  texts: string[],
): Promise<LanguageInferResult> {
  if (client) {
    try {
      return await inferScoresFromLanguage(client, model, texts);
    } catch {
      // 落到启发式
    }
  }
  return inferScoresHeuristic(texts);
}
