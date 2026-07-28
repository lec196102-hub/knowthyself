/**
 * 日记持久化层
 *
 * 负责日记记录的落盘与读取，使用按用户隔离的文件存储。
 * 与 API / 引擎逻辑解耦。底层 fs 操作统一走 storage/adapter。
 */

import { resolve } from "path";
import { env } from "../config.js";
import { ensureDir, writeJsonFile, listFiles, deleteFile, readJsonFile } from "./adapter.js";

const journalDir = ensureDir(env.JOURNAL_DIR);

/** 日记记录结构 */
export interface JournalRecord {
  userId: string;
  timestamp: string;
  diary: string;
  hasTemperamentProfile: boolean;
  responses: unknown;
  /** 由「导入历史日记」入口写入（区别于正常日记），用于区分来源 */
  imported?: boolean;
  /** 导入时的原始日期（用户提供的 YYYY-MM-DD / ISO），用于还原时间线 */
  originalDate?: string;
  /** 导入操作发生的时间 ISO */
  importedAt?: string;
}

/** 获取日记存储目录（已确保存在） */
export function getJournalDir(): string {
  return journalDir;
}

/** 保存一条日记，返回写入的文件路径
 * @param timestampOverride 可选，覆盖文件名里的时间戳（用于导入历史日记时保留原始日期排序）
 */
export function saveJournal(
  record: JournalRecord,
  userId: string,
  timestampOverride?: string,
): string {
  const timestamp = (timestampOverride || new Date().toISOString()).replace(/[:.]/g, "-");
  const name = `${userId}-${timestamp}.json`;
  writeJsonFile(journalDir, name, record);
  return `${journalDir}/${name}`;
}

/** 读取某用户的所有日记记录（按文件名自然排序） */
export function listJournals(userId: string): JournalRecord[] {
  return listFiles(
    journalDir,
    (f) => f.startsWith(`${userId}-`) && f.endsWith(".json"),
  ).map((f) => readJsonFile<JournalRecord>(journalDir, f)!);
}

/** 带文件 id 的记录（聊天日志页需要唯一 id 才能删除单条） */
export interface JournalEntry {
  /** 文件名即唯一 id（不含路径） */
  id: string;
  record: JournalRecord;
}

/** 校验文件 id 合法性：必须属于该用户、无路径穿越 */
function isSafeJournalId(userId: string, id: string): boolean {
  return (
    /^[\w.\-]+\.json$/.test(id) &&
    !id.includes("/") &&
    !id.includes("\\") &&
    !id.includes("..") &&
    id.startsWith(`${userId}-`)
  );
}

/** 读取某用户所有日记（携带文件 id，新→旧排序） */
export function listJournalEntries(userId: string): JournalEntry[] {
  return listFiles(
    journalDir,
    (f) => f.startsWith(`${userId}-`) && f.endsWith(".json"),
  )
    .reverse()
    .map((f) => {
      const record = readJsonFile<JournalRecord>(journalDir, f);
      return record ? { id: f, record } : null;
    })
    .filter((e): e is JournalEntry => e !== null);
}

/** 删除某用户的一条日记，返回是否删除成功 */
export function deleteJournal(userId: string, id: string): boolean {
  if (!isSafeJournalId(userId, id)) return false;
  return deleteFile(journalDir, id);
}

/** 清空某用户的全部日记，返回删除条数 */
export function deleteAllJournals(userId: string): number {
  const files = listFiles(
    journalDir,
    (f) => f.startsWith(`${userId}-`) && f.endsWith(".json"),
  );
  let n = 0;
  for (const f of files) {
    if (deleteFile(journalDir, f)) n++;
  }
  return n;
}

// ==================== 历史聚合（用于语言推断画像） ====================

/** 聚合选项 */
export interface DiaryCollectOpts {
  /** 单条文本最小长度，低于此值视为无效样本 */
  minLen?: number;
  /** 最多返回多少条（防止一次推断 token 膨胀） */
  max?: number;
}

/**
 * 聚合某用户全部历史日记的正文，作为「语言推断气质画像」的样本。
 * - 按旧→新顺序读取（listJournalEntries 是新→旧，这里反转）
 * - 去重（同一用户内正文大小写不敏感去重）
 * - 跳过过短 / 空文本
 * - 限制返回条数（默认 30，与 /infer 上限一致）
 */
export function collectDiaryTexts(userId: string, opts: DiaryCollectOpts = {}): string[] {
  const minLen = opts.minLen ?? 8;
  const max = opts.max ?? 30;

  const entries = listJournalEntries(userId).reverse(); // 旧→新
  const seen = new Set<string>();
  const out: string[] = [];

  for (const e of entries) {
    const text = (e.record?.diary || "").trim();
    if (text.length < minLen) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= max) break;
  }
  return out;
}
