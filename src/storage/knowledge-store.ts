/**
 * 用户知识库持久化层
 *
 * 让用户上传自己的日记 / 笔记 / 经历，并分别为三我（本我/自我/超我）
 * 设定语气与风格，构建「属于这个用户的人格知识库」。
 *
 * 与 memory（自动从日记提炼的长期事实）不同，这里是用户主动注入的、
 * 稳定的「关于我是谁 / 我希望三我怎么说话」的语料与偏好。
 * 底层 fs 操作统一走 storage/adapter。
 */

import { resolve } from "path";
import { ensureDir, readJsonFile, writeJsonFile } from "./adapter.js";

const knowledgeDir = ensureDir("./data/knowledge");

export type DocKind = "diary" | "note" | "experience";

/** 一篇用户上传的文档 */
export interface KnowledgeDoc {
  id: string;
  title: string;
  kind: DocKind;
  content: string;
  createdAt: string;
}

/** 用户为三我分别设定的语气 / 风格（自由文本） */
export interface PersonaStyle {
  id?: string;
  ego?: string;
  superego?: string;
}

/** 单个用户的知识库档案 */
export interface KnowledgeRecord {
  userId: string;
  personaStyle: PersonaStyle;
  documents: KnowledgeDoc[];
  /** LLM 从上传文档提炼的「用户画像简报」（自然、不越界） */
  brief?: string;
  briefUpdatedAt?: string;
  updatedAt: string;
}

/** 读取用户知识库；不存在时返回空骨架 */
export function loadKnowledge(userId: string): KnowledgeRecord {
  const rec = readJsonFile<KnowledgeRecord>(knowledgeDir, `${userId}.json`);
  if (!rec) {
    return { userId, personaStyle: {}, documents: [], updatedAt: new Date().toISOString() };
  }
  return {
    userId,
    personaStyle: rec.personaStyle ?? {},
    documents: rec.documents ?? [],
    brief: rec.brief,
    briefUpdatedAt: rec.briefUpdatedAt,
    updatedAt: rec.updatedAt ?? new Date().toISOString(),
  };
}

/** 保存用户知识库 */
export function saveKnowledge(userId: string, rec: KnowledgeRecord): void {
  rec.updatedAt = new Date().toISOString();
  writeJsonFile(knowledgeDir, `${userId}.json`, rec);
}
