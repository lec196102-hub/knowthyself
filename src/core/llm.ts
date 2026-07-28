/**
 * LLM 客户端与调用工具
 *
 * 统一封装 OpenAI 兼容客户端的创建与带重试的对话调用，
 * 与 Triune 引擎的业务编排逻辑解耦。
 */

import OpenAI from "openai";

/** 单个 LLM 客户端的配置 */
export interface LLMConfig {
  apiKey: string;
  baseURL: string;
  model: string;
}

/**
 * 创建 OpenAI 兼容客户端。
 * 无 API Key 时返回 null（用于懒初始化 / 未配置降级）。
 */
export function createClient(cfg: LLMConfig): OpenAI | null {
  if (!cfg.apiKey) return null;
  return new OpenAI({ apiKey: cfg.apiKey, baseURL: cfg.baseURL });
}

/**
 * 带重试的 LLM 对话调用。
 *
 * @param client       已初始化的 OpenAI 客户端
 * @param systemPrompt 系统提示词
 * @param userMessage  用户消息
 * @param model        使用的模型名
 * @param agentName    调用方标识（用于日志，如 "ego" / "id"）
 * @param retries      失败重试次数（默认 2）
 * @returns 模型回复文本；连续失败返回降级提示
 */
/** 单次 LLM 调用超时（毫秒）。避免免费 7B 模型卡死导致请求无限挂起 */
const DEFAULT_TIMEOUT_MS = 30000;

export async function callLLM(
  client: OpenAI,
  systemPrompt: string,
  userMessage: string,
  model: string,
  agentName: string,
  retries = 2,
): Promise<string> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
    try {
      const response = await client.chat.completions.create(
        {
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userMessage },
          ],
          temperature: 0.85,
          max_tokens: 300,
          // 去模板化：抑制重复词/套话（参考 jsdev.space 的 humanize 系统提示实践）
          frequency_penalty: 0.5,
          presence_penalty: 0.3,
        },
        { signal: controller.signal },
      );
      clearTimeout(timer);

      const content = response.choices[0]?.message?.content;
      // 空响应视为失败：避免把空白气泡下发给用户（否则前端出现三块空白）
      if (content && content.trim().length > 0) {
        return content;
      }
      throw new Error("模型返回空响应");
    } catch (error: any) {
      clearTimeout(timer);
      if (attempt === retries) {
        console.error(`[${agentName}] API 调用失败 (重试${retries}次): ${error.message}`);
        // 返回降级文案而非空串，保证前端不会渲染空白气泡
        return `[${agentName} 暂时不可用，请稍后重试]`;
      }
      console.warn(`[${agentName}] 第${attempt + 1}次调用失败，重试中...`);
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  return `[${agentName} 暂时不可用，请稍后重试]`;
}
