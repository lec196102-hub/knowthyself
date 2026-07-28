import { config as dotenvConfig } from "dotenv";
import { z } from "zod";

dotenvConfig();

const envSchema = z.object({
  // LLM 提供商配置
  LLM_PROVIDER: z.string().default("siliconflow"),
  LLM_API_KEY: z.string().optional(),
  LLM_BASE_URL: z.string().default("https://api.siliconflow.cn/v1"),
  LLM_MODEL: z.string().default("Qwen/Qwen2.5-7B-Instruct"),

  // 审计模式：主审分离（可选）
  LLM_AUDIT_MAIN_MODEL: z.string().optional(),
  LLM_AUDIT_REVIEW_MODEL: z.string().optional(),

  // 服务配置
  PORT: z.coerce.number().default(3000),
  SAFETY_API_KEY: z.string().optional(),
  SAFETY_BASE_URL: z.string().default("https://api.openai.com/v1"),
  JOURNAL_DIR: z.string().default("./data/journals"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),

  // 联网检索（让三我基于真实资料作答，不瞎编）
  // auto = 仅当问题像「问事实 / 专业」时才检索；always = 每次都检索；off = 关闭
  WEB_SEARCH_MODE: z.enum(["auto", "always", "off"]).default("auto"),
  WEB_SEARCH_TIMEOUT_MS: z.coerce.number().default(4000),
  // 可选：自建 / 第三方 JSON 检索网关（兼容 SerpAPI 结构）。留空则走 Bing→DDG 兜底
  SEARCH_API_URL: z.string().optional(),
  SEARCH_API_KEY: z.string().optional(),

  // 本我↔超我「争吵」阶段（作为自我综合前的"思考时间"）
  // on = 开启争吵；off = 跳过，直接进入自我综合（退回旧三段式观感）
  DEBATE_ENABLED: z.enum(["on", "off"]).default("on"),
  // 争吵最多轮数（1 轮 = 本我一句 + 超我一句）；用户要求"不超过2轮"
  DEBATE_MAX_ROUNDS: z.coerce.number().default(2),
  // 争吵阶段保底时长（毫秒）：用户要求"至少2秒"的思考时间观感
  DEBATE_MIN_MS: z.coerce.number().default(2000),
});

export const env = envSchema.parse(process.env);
export type Env = z.infer<typeof envSchema>;

/** 获取 Ego(主) Agent 的模型配置 */
export function getMainModelConfig() {
  return {
    apiKey: env.LLM_API_KEY!,
    baseURL: env.LLM_BASE_URL,
    model: env.LLM_AUDIT_MAIN_MODEL || env.LLM_MODEL,
  };
}

/** 获取 Id/Superego(审) Agent 的模型配置 */
export function getReviewModelConfig() {
  // 审计模式下可用不同模型，否则复用主模型
  return {
    apiKey: env.LLM_API_KEY!,
    baseURL: env.LLM_BASE_URL,
    model: env.LLM_AUDIT_REVIEW_MODEL || env.LLM_AUDIT_MAIN_MODEL || env.LLM_MODEL,
  };
}

// 安全规则已迁移至独立模块 config/safety-rules.ts，此处转发导出以保持兼容
export { SAFETY_RULES } from "./config/safety-rules.js";
