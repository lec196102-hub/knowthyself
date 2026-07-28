/**
 * 气质画像持久化层
 *
 * 负责用户气质画像（temperament profile）的落盘与读取。
 * 与 API / 引擎逻辑解耦。
 *
 * 渐进式测试（每日 10 题、6 天答完）的状态也存放在这里：
 *  - answers:     累积已答的所有题目（题号 → 选项）
 *  - onboarded:   是否至少完成首日一批（>=10 题，可解锁聊天）
 *  - completed:   是否答满全部 60 题（出恭喜词 + 完整体验）
 *  - lastDailyDate: 上次答题日期（YYYY-MM-DD），用于「每天不重复」
 *  - congrats:    完成时生成的恭喜词
 * 底层 fs 操作统一走 storage/adapter。
 */

import { resolve } from "path";
import type { AnswerSheet, TemperamentProfile } from "../core/temperament.js";
import { ensureDir, readJsonFile, writeJsonFile } from "./adapter.js";

const profilesDir = ensureDir("./data/profiles");

/** 气质画像记录结构（兼容渐进式每日测试） */
export interface ProfileRecord {
  userId: string;
  /** 累积已答题：题号 → 选项(1-5) */
  answers: AnswerSheet;
  /** 至少完成首日一批（>=10 题），可解锁聊天 */
  onboarded: boolean;
  /** 已答满全部 60 题 */
  completed: boolean;
  /** 完整画像（仅 completed 时有值） */
  profile?: TemperamentProfile;
  /** 上次答题日期 YYYY-MM-DD（用于「每天不重复」） */
  lastDailyDate?: string;
  createdAt: string;
  completedAt?: string;
  /** 完成时生成的恭喜词 */
  congrats?: string;
}

/** 获取气质画像存储目录（已确保存在） */
export function getProfileDir(): string {
  return profilesDir;
}

/** 保存用户气质画像记录，返回写入的文件路径 */
export function saveProfile(userId: string, record: ProfileRecord): string {
  const file = `${userId}.json`;
  writeJsonFile(profilesDir, file, record);
  return `${profilesDir}/${file}`;
}

/** 读取用户气质画像；不存在时返回 null */
export function loadProfile(userId: string): ProfileRecord | null {
  return readJsonFile<ProfileRecord>(profilesDir, `${userId}.json`);
}
