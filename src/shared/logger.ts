/**
 * 统一日志（Phase 2）
 *
 * 替代散落的 console.log/error，支持按 env.LOG_LEVEL 调整级别。
 * 后续可无痛替换为文件日志 / 结构化日志（pino 等）而不动业务代码。
 */

import { env } from "../config.js";

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 } as const;
type Level = keyof typeof LEVELS;

const current: number = LEVELS[(env.LOG_LEVEL ?? "info") as Level] ?? LEVELS.info;

function fmt(level: string, scope: string, msg: unknown): string {
  const t = new Date().toISOString().slice(11, 19);
  const text = typeof msg === "string" ? msg : JSON.stringify(msg);
  return `[${t}] [${level}] (${scope}) ${text}`;
}

export const logger = {
  debug(scope: string, msg: unknown): void {
    if (current <= LEVELS.debug) console.debug(fmt("DEBUG", scope, msg));
  },
  info(scope: string, msg: unknown): void {
    if (current <= LEVELS.info) console.log(fmt("INFO", scope, msg));
  },
  warn(scope: string, msg: unknown): void {
    if (current <= LEVELS.warn) console.warn(fmt("WARN", scope, msg));
  },
  error(scope: string, msg: unknown): void {
    if (current <= LEVELS.error) console.error(fmt("ERROR", scope, msg));
  },
};
