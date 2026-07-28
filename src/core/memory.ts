/**
 * 长期记忆层（Memory Layer）
 *
 * 让"三我"能跨会话记住用户——这是"陪伴"飞轮与付费墙的地基。
 *
 * 设计要点：
 *  - 每条日记处理后，用便宜模型异步提取「关于用户的长期事实」
 *    （压力源 / 重要关系 / 反复情绪 / 目标价值观 / 重大事件 / 性格）。
 *  - 提取与合并在生成回复之后 fire-and-forget，本回合用的是上一会话的记忆，
 *    新事实存给下一回用 —— 因此零额外延迟，不冲击 5s 红线。
 *  - 记忆按"被重复提及次数"加权，只保留权重最高 / 最近的前 20 条，避免无限增长。
 */

import type OpenAI from "openai";
import { callLLM } from "./llm.js";
import { ensureDir, readJsonFile, writeJsonFile } from "../storage/adapter.js";

const memoryDir = ensureDir("./data/memories");

/** 一条长期记忆事实 */
export interface MemoryFact {
  id: string;
  text: string;
  /** 被重复提及次数（1..9），越高越重要 */
  weight: number;
  createdAt: string;
  lastSeen: string;
}

/** 单个用户的记忆档案 */
export interface UserMemory {
  userId: string;
  facts: MemoryFact[];
  /** 最近几条日记的一句话主题，最多保留 12 条（用于短期上下文） */
  recentThemes: string[];
  updatedAt: string;
}

/** 记忆库：按 userId 落盘到 ./data/memories/<userId>.json */
export class MemoryStore {
  load(userId: string): UserMemory {
    const rec = readJsonFile<UserMemory>(memoryDir, `${userId}.json`);
    if (!rec) {
      return { userId, facts: [], recentThemes: [], updatedAt: new Date().toISOString() };
    }
    // 兼容缺字段
    return {
      userId,
      facts: rec.facts ?? [],
      recentThemes: rec.recentThemes ?? [],
      updatedAt: rec.updatedAt ?? new Date().toISOString(),
    };
  }

  save(userId: string, mem: UserMemory): void {
    mem.updatedAt = new Date().toISOString();
    writeJsonFile(memoryDir, `${userId}.json`, mem);
  }
}

const EXTRACT_PROMPT = `你是一个用户长期记忆提取器。下面是一篇用户日记，以及三位人格（本我/自我/超我）对它的回应。
请从中提取关于这个人的、跨会话仍有价值的"长期记忆事实"，例如：
- 长期压力来源、重要关系（家人/伴侣/同事/朋友）
- 反复出现的情绪或困扰、个人目标与价值观
- 近期重大生活事件、稳定的性格特点
要求：
- 只输出一个 JSON 数组，每个元素是字符串，2-4 条，每条 8-20 字，客观、不评判。
- 不要提取一次性琐事，不要提取当前这篇日记的临时情绪（除非是反复出现的模式）。
- 如果确实没有值得长期记住的内容，输出空数组 []。
只输出 JSON，不要任何解释或代码块标记。`;

function normalize(s: string): string {
  return s.replace(/\s+/g, "").toLowerCase();
}

/** 将新提取的事实合并进已有记忆：重复提及则升权重，否则新增；最后裁剪到 top-20 */
export function mergeMemories(
  existing: UserMemory,
  extractedTexts: string[],
  theme?: string,
): UserMemory {
  const next: UserMemory = { ...existing, facts: [...existing.facts] };

  for (const t of extractedTexts) {
    const norm = normalize(t);
    const found = next.facts.find((f) => normalize(f.text) === norm);
    if (found) {
      found.weight = Math.min(found.weight + 1, 9);
      found.lastSeen = new Date().toISOString();
    } else {
      next.facts.push({
        id: Buffer.from(norm).toString("base64").slice(0, 8),
        text: t,
        weight: 1,
        createdAt: new Date().toISOString(),
        lastSeen: new Date().toISOString(),
      });
    }
  }

  // 按权重降序、其次按最近一次出现时间，保留前 20 条
  next.facts.sort(
    (a, b) => b.weight - a.weight || b.lastSeen.localeCompare(a.lastSeen),
  );
  next.facts = next.facts.slice(0, 20);

  if (theme && theme.trim()) {
    next.recentThemes = [theme.trim(), ...existing.recentThemes].slice(0, 12);
  }
  return next;
}

/** 用便宜模型从一次对话中提取长期记忆事实（返回字符串数组，失败返回 []） */
export async function extractMemories(
  client: OpenAI,
  model: string,
  diary: string,
  egoText: string,
  idText: string,
  agentName = "memory",
): Promise<string[]> {
  const userMsg =
    `【用户日记】\n"""\n${diary}\n"""\n\n` +
    `【本我回应】\n${idText}\n\n` +
    `【自我回应】\n${egoText}`;

  const raw = await callLLM(client, EXTRACT_PROMPT, userMsg, model, agentName, 1);
  const cleaned = raw.replace(/```json|```/g, "").trim();
  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) {
      return parsed
        .filter((x) => typeof x === "string")
        .map((x) => (x as string).trim())
        .filter(Boolean);
    }
    return [];
  } catch {
    return [];
  }
}

/** 把记忆转成注入 prompt 的文本；无记忆时返回空串 */
export function buildMemoryContext(mem: UserMemory): string {
  if (mem.facts.length === 0) return "";
  const top = mem.facts
    .slice(0, 6)
    .map((f) => `- ${f.text}`)
    .join("\n");
  return (
    `【你和用户之前聊过的长期记忆（用于更懂他/她，但不要明说"我记得你说过"，自然地用上即可）】\n` +
    `${top}`
  );
}
