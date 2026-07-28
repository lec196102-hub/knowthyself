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
}

/** 获取日记存储目录（已确保存在） */
export function getJournalDir(): string {
  return journalDir;
}

/** 保存一条日记，返回写入的文件路径 */
export function saveJournal(record: JournalRecord, userId: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
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
