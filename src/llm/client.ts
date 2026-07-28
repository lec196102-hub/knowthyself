/**
 * LLM 提供商注册表
 *
 * 预置国内外主流 LLM 提供商，含免费/付费选项。
 * 每个提供商包含：名称、API 地址、可用模型列表、免费额度说明、注册链接。
 *
 * 用户可通过交互式配置脚本选择提供商和模型，
 * 也可直接编辑 .env 文件手动配置。
 */

export interface LLMProvider {
  id: string;
  name: string;
  baseUrl: string;
  models: LLMModel[];
  freeTier: string;
  registerUrl: string;
  note?: string;
}

export interface LLMModel {
  id: string;
  name: string;
  /** 是否免费可用 */
  free: boolean;
  /** 模型能力标签 */
  tags: string[];
}

/** 所有预置提供商 */
export const PROVIDERS: LLMProvider[] = [
  {
    id: "siliconflow",
    name: "硅基流动 (SiliconFlow)",
    baseUrl: "https://api.siliconflow.cn/v1",
    models: [
      { id: "Qwen/Qwen2.5-7B-Instruct", name: "Qwen2.5 7B (推荐免费)", free: true, tags: ["中文优秀", "轻量", "推理快"] },
      { id: "Qwen/Qwen3-8B", name: "Qwen3 8B (推荐免费)", free: true, tags: ["中文优秀", "最新", "推理快"] },
      { id: "deepseek-ai/DeepSeek-V3", name: "DeepSeek V3", free: false, tags: ["顶级推理", "大模型"] },
      { id: "Pro/Qwen/Qwen2.5-7B-Instruct", name: "Qwen2.5 7B Pro (付费加速)", free: false, tags: ["低延迟", "高并发"] },
    ],
    freeTier: "注册即送 2000 万 tokens，Qwen2.5-7B 等开源模型免费使用",
    registerUrl: "https://cloud.siliconflow.cn",
    note: "推荐首选！国内直连，无需代理，免费额度充裕。",
  },
  {
    id: "deepseek",
    name: "DeepSeek 深度求索",
    baseUrl: "https://api.deepseek.com/v1",
    models: [
      { id: "deepseek-chat", name: "DeepSeek V3", free: false, tags: ["顶级推理", "中文优秀"] },
      { id: "deepseek-reasoner", name: "DeepSeek R1", free: false, tags: ["深度推理", "慢但强"] },
    ],
    freeTier: "注册即送 500 万 tokens，用完后按量付费（极便宜）",
    registerUrl: "https://platform.deepseek.com",
    note: "性价比极高，中文理解能力顶级。",
  },
  {
    id: "zhipu",
    name: "智谱 AI (GLM)",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    models: [
      { id: "glm-4-flash", name: "GLM-4 Flash (免费)", free: true, tags: ["免费", "中文优秀", "速度快"] },
      { id: "glm-4-plus", name: "GLM-4 Plus", free: false, tags: ["中文顶级", "强推理"] },
    ],
    freeTier: "GLM-4 Flash 完全免费，注册即用",
    registerUrl: "https://open.bigmodel.cn",
    note: "GLM-4 Flash 免费且质量不错，适合体验。",
  },
  {
    id: "aliyun",
    name: "阿里百炼 (Qwen)",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    models: [
      { id: "qwen-turbo", name: "Qwen Turbo (免费额度)", free: true, tags: ["免费额度", "中文优秀"] },
      { id: "qwen-plus", name: "Qwen Plus", free: false, tags: ["性价比", "强推理"] },
      { id: "qwen-max", name: "Qwen Max", free: false, tags: ["顶级推理", "最强"] },
    ],
    freeTier: "新用户免费额度 100 万 tokens (qwen-turbo)",
    registerUrl: "https://dashscope.console.aliyun.com",
    note: "阿里系产品，云服务稳定。",
  },
  {
    id: "openai",
    name: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    models: [
      { id: "gpt-4o-mini", name: "GPT-4o Mini", free: false, tags: ["便宜", "快速", "多模态"] },
      { id: "gpt-4o", name: "GPT-4o", free: false, tags: ["顶级推理", "多模态"] },
    ],
    freeTier: "无免费额度，需预付费",
    registerUrl: "https://platform.openai.com",
    note: "需代理访问。",
  },
  {
    id: "custom",
    name: "自定义 (OpenAI 兼容接口)",
    baseUrl: "",
    models: [],
    freeTier: "取决于你的提供商",
    registerUrl: "",
    note: "任何兼容 OpenAI API 格式的服务均可使用。",
  },
];

/**
 * 根据提供商 ID 查找
 */
export function findProvider(id: string): LLMProvider | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

/**
 * 获取推荐配置（免费优先）
 */
export function getRecommendedConfig() {
  return {
    provider: "siliconflow",
    model: "Qwen/Qwen2.5-7B-Instruct",
    providerInfo: findProvider("siliconflow"),
  };
}
