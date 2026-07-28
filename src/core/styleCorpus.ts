/**
 * 自然语言语料库（从网络真实语料「学习」人类说话方式）
 *
 * 三我 agent 的「人话感」不应靠硬编码模板，而应从真实人类的表达里学。
 * 本模块维护一份自然语言片段库：
 *  - SEED_LINES：内置种子（日常口语 / 群聊语气），保证开箱即用、不依赖网络；
 *  - data/style-corpus.json：由 scripts/harvest-comments.ts 从网络真实摘要 / 评论区
 *    采集、经安全过滤后补充的片段。
 *
 * 采样出的片段作为 few-shot 风格示例注入 humanize 指令，让三我在「说人话」时有真实参照。
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CORPUS_PATH = join(__dirname, "..", "..", "data", "style-corpus.json");

/** 内置种子：覆盖情绪 / 吐槽 / 自嘲 / 安慰等日常群聊语感（中文、口语、不敏感） */
export const SEED_LINES: string[] = [
  "哎今天真的有点丧，提不起劲。",
  "说真的我也不知道咋办，先混着吧。",
  "你就别劝我了，我自己心里有数。",
  "这事儿搁谁身上都得炸，太离谱了。",
  "我反正认了，跟自己较劲没意思。",
  "累得不想说话，只想瘫着。",
  "有点想哭但又说不上来为啥。",
  "我是不是想太多了……越想越乱。",
  "算了不纠结了，船到桥头自然直。",
  "你这话说到点子上了，我刚一直绕。",
  "害，成年人的崩溃就在一瞬间。",
  "嘴上说着没事，其实心里早翻江倒海了。",
  "整挺好，但我就是高兴不起来。",
  "别卷了，躺平一会儿不行吗。",
  "这波属实被戳中了，破防了。",
  "我也想开，可现实它不允许啊。",
  "行吧，就当交学费了。",
  "谁还没个低谷呢，慢慢熬。",
  "你说的我懂，但做不到也是真的。",
  "突然就emo了，没啥原因。",
  "我妈那句老话又应验了。",
  "这锅我不背，明明是环境的问题。",
  "努力了但不一定有结果，挺无奈的。",
  "被你这么一提醒，好像也没那么严重。",
  "我现在就是需要有人听我说说话。",
];

interface CorpusFile {
  lines: string[];
}

function loadUserLines(): string[] {
  try {
    if (!existsSync(CORPUS_PATH)) return [];
    const raw = readFileSync(CORPUS_PATH, "utf8");
    const parsed = JSON.parse(raw) as CorpusFile;
    return Array.isArray(parsed.lines) ? parsed.lines : [];
  } catch {
    return [];
  }
}

/**
 * 从「种子 ∪ 采集库」中随机采样 n 条，用于 few-shot 风格示例。
 * 去重后不足以 n 条时返回全部去重结果。
 */
export function sampleStyleLines(n = 5): string[] {
  const pool = Array.from(new Set([...SEED_LINES, ...loadUserLines()]));
  // Fisher–Yates 局部洗牌后取前 n
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, n);
}

/** 向语料库追加新片段（去重 + 落盘），供 harvest 脚本调用 */
export function addStyleLines(lines: string[]): number {
  const user = loadUserLines();
  const set = new Set(user);
  let added = 0;
  for (const l of lines) {
    const clean = l.trim();
    if (clean.length >= 4 && clean.length <= 80 && !set.has(clean)) {
      set.add(clean);
      added++;
    }
  }
  const next = Array.from(set);
  try {
    const dir = dirname(CORPUS_PATH);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(CORPUS_PATH, JSON.stringify({ lines: next } as CorpusFile, null, 2), "utf8");
  } catch (e) {
    console.error("[styleCorpus] 写入语料库失败:", e);
  }
  return added;
}
