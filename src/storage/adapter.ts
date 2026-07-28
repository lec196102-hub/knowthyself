/**
 * 存储层公共基础设施（Phase 0）
 *
 * 把散落在 4 个 store 里的 `fs` 读写、目录确保、容错解析统一收敛到这里。
 * 业务 store 只调用这些薄封装，不再直接 import `fs` / `path`。
 *
 * 这是「换数据库」的唯一改动点：将来只要把这里的文件实现替换成
 * DB 实现（或新增一个 JsonStore 接口 + 子类），上层业务代码无需改动。
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, unlinkSync } from "fs";
import { resolve, join } from "path";
import { encryptJson, decryptJson } from "./crypto.js";

/** 确保目录存在并返回绝对路径 */
export function ensureDir(dir: string): string {
  const abs = resolve(dir);
  if (!existsSync(abs)) mkdirSync(abs, { recursive: true });
  return abs;
}

/** 读取单个 JSON 文件；不存在或解析失败返回 null（调用方决定兜底值） */
export function readJsonFile<T>(dir: string, name: string): T | null {
  const file = join(dir, name);
  if (!existsSync(file)) return null;
  try {
    return decryptJson<T>(readFileSync(file, "utf-8"));
  } catch {
    return null;
  }
}

/** 写入单个 JSON 文件（带缩进、UTF-8），自动确保目录存在 */
export function writeJsonFile(dir: string, name: string, data: unknown): void {
  ensureDir(dir);
  writeFileSync(join(dir, name), encryptJson(data), "utf-8");
}

/** 列出目录中满足谓词的文件名（自然排序） */
export function listFiles(dir: string, predicate: (name: string) => boolean): string[] {
  const abs = resolve(dir);
  if (!existsSync(abs)) return [];
  return readdirSync(abs, { encoding: "utf-8" }).filter(predicate).sort();
}

/** 删除目录中指定文件；不存在或删除失败返回 false */
export function deleteFile(dir: string, name: string): boolean {
  const file = join(dir, name);
  if (!existsSync(file)) return false;
  try {
    unlinkSync(file);
    return true;
  } catch {
    return false;
  }
}
