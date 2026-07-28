/**
 * 联网检索模块（web search grounding）
 *
 * 设计目标：让三我 agent 在回答事实性 / 专业问题时，能基于真实网络资料作答，
 * 而不是凭空编造。所有失败都优雅降级为空结果——绝不让检索拖垮主流程。
 *
 * 检索源（按 fallback 顺序，无需 API Key 即可用）：
 *   1. Bing 网页搜索（中国可达性较好）
 *   2. DuckDuckGo HTML（通用）
 * 可选：若配置了 SEARCH_API_URL / SEARCH_API_KEY，则优先走该 JSON 接口
 *       （兼容 SerpAPI / 自建检索网关 的 { organic_results:[{title,link,snippet}] } 结构）。
 */

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

/** 带超时的文本抓取；任何异常都返回空串（不抛错） */
async function fetchText(url: string, timeoutMs: number): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml" },
      signal: controller.signal,
    });
    if (!r.ok) return "";
    return await r.text();
  } catch {
    return ""; // 网络不可达 / 超时 / 被墙 → 静默降级
  } finally {
    clearTimeout(timer);
  }
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

function stripHtml(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

/** 解析 Bing 搜索结果页 */
function parseBing(html: string): SearchResult[] {
  const results: SearchResult[] = [];
  const blockRe = /<li class="b_algo"[^>]*>([\s\S]*?)<\/li>/g;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(html)) !== null && results.length < 6) {
    const block = m[1];
    const titleM = block.match(/<h2>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>\s*<\/h2>/);
    const url = titleM?.[1] ?? "";
    const title = titleM ? stripHtml(titleM[2]) : "";
    const capM = block.match(/<p[^>]*>([\s\S]*?)<\/p>/);
    const snippet = capM ? stripHtml(capM[1]) : "";
    if (title && url) results.push({ title, url, snippet });
  }
  return results;
}

/** 解析 DuckDuckGo HTML 结果页 */
function parseDDG(html: string): SearchResult[] {
  const results: SearchResult[] = [];
  const blockRe =
    /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>([\s\S]*?)<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(html)) !== null && results.length < 6) {
    const rawUrl = m[1].replace(/^\/\/duckduckgo\.com\/l\/\?uddg=/, "");
    const url = decodeURIComponent(rawUrl);
    const title = stripHtml(m[2]);
    const snippet = stripHtml(m[4]);
    if (title) results.push({ title, url, snippet });
  }
  return results;
}

/** 解析通用 JSON 检索网关返回 */
function parseApi(json: any): SearchResult[] {
  const arr =
    json?.organic_results ??
    json?.results ??
    json?.webPages?.value ??
    [];
  return (Array.isArray(arr) ? arr : [])
    .slice(0, 6)
    .map((r: any) => ({
      title: String(r?.title ?? ""),
      url: String(r?.link ?? r?.url ?? ""),
      snippet: String(r?.snippet ?? r?.description ?? ""),
    }))
    .filter((r: SearchResult) => r.title && r.url);
}

/**
 * 主入口：带超时与多源 fallback 的联网检索。
 * 任何源失败都向下一个源降级；全部失败返回 []。绝不抛错。
 */
export async function webSearch(
  query: string,
  opts: { timeoutMs?: number; apiUrl?: string; apiKey?: string } = {},
): Promise<SearchResult[]> {
  const timeoutMs = opts.timeoutMs ?? 4000;
  const q = encodeURIComponent(query.slice(0, 200));

  // 可选：优先走用户自建 / 第三方 JSON 检索网关
  if (opts.apiUrl) {
    try {
      const sep = opts.apiUrl.includes("?") ? "&" : "?";
      const u = `${opts.apiUrl}${sep}q=${q}${
        opts.apiKey ? `&api_key=${encodeURIComponent(opts.apiKey)}` : ""
      }`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const r = await fetch(u, {
        signal: controller.signal,
        headers: opts.apiKey ? { Authorization: `Bearer ${opts.apiKey}` } : {},
      });
      clearTimeout(timer);
      if (r.ok) {
        const out = parseApi(await r.json());
        if (out.length) return out;
      }
    } catch {
      /* 网关不可用 → 继续走兜底源 */
    }
  }

  // 无 Key fallback：Bing → DuckDuckGo
  const bingHtml = await fetchText(`https://www.bing.com/search?q=${q}&setlang=zh-CN`, timeoutMs);
  if (bingHtml) {
    const bing = parseBing(bingHtml);
    if (bing.length) return bing;
  }
  const ddgHtml = await fetchText(`https://html.duckduckgo.com/html/?q=${q}`, timeoutMs);
  if (ddgHtml) {
    const ddg = parseDDG(ddgHtml);
    if (ddg.length) return ddg;
  }
  return [];
}

// ==================== 是否应该联网（启发式） ====================

/** 问句 / 疑问标记：出现任一即视为在「问问题」 */
const FACTUAL_MARKERS = [
  "？", "?", "怎么", "如何", "为什么", "为何", "是什么", "哪些是", "哪些",
  "多少", "哪里", "哪个", "谁", "吗", "呢", "是不是", "能不能", "可不可以",
  "可以吗", "区别", "推荐", "怎样", "怎么选", "怎么用", "原理", "原因",
  "怎么办", "如何做", "怎么搞", "咋", "几", "啥", "怎么啦", "如何评价",
  "靠谱吗", "好吗", "值得吗", "排名", "对比", "用法", "步骤", "方法",
  "标准", "依据", "规定", "法律", "法规", "政策", "条款", "靠谱不",
];

/** 专业 / 技术关键词：命中即视为专业类问题，应检索真实资料 */
const PROFESSIONAL_KEYWORDS = [
  "代码", "编程", "程序", "bug", "模型", "算法", "ai", "法律", "律师",
  "医疗", "健康", "医院", "诊断", "投资", "股票", "基金", "理财", "保险",
  "税务", "心理学", "心理", "历史", "科学", "数学", "物理", "化学", "生物",
  "英语", "考试", "考研", "留学", "签证", "学历", "工作", "面试", "薪资",
  "协议", "合同", "专利", "商标", "数据", "统计", "研究", "论文", "规范",
  "制度", "语法", "单词", "症状", "药", "疫苗", "利率",
];

/**
 * 判断一段用户输入是否值得联网检索。
 * 仅当看起来在「问事实 / 问做法 / 涉专业」时才检索，
 * 纯情绪日记（"今天好累""好烦"）不检索，避免无关资料污染语气。
 */
export function needsWebSearch(text: string): boolean {
  const t = text.toLowerCase();
  if (FACTUAL_MARKERS.some((k) => t.includes(k.toLowerCase()))) return true;
  if (PROFESSIONAL_KEYWORDS.some((k) => t.includes(k.toLowerCase()))) return true;
  return false;
}
