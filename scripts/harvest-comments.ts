/**
 * 从网络真实语料「学习」人类自然语言 —— 采集脚本
 *
 * 用途：用联网检索（见 src/core/websearch.ts）抓取真实人类写的摘要 / 问答 / 评论区文本，
 * 经安全过滤与去重后，写入 data/style-corpus.json，作为三我 agent 的语气 few-shot 样例。
 *
 * 运行：
 *   npm run harvest-comments            # 用内置的日常中性查询采集
 *   npm run harvest-comments -- "如何缓解焦虑"   # 追加自定义查询
 *
 * 注意：仅采集中性、日常、情绪向的语料；命中安全策略的片段会被丢弃，避免引入敏感内容。
 */

import { webSearch } from "../src/core/websearch.js";
import { addStyleLines } from "../src/core/styleCorpus.js";
import { checkContentSafety } from "../src/core/safety.js";
import { env } from "../src/config.js";

/** 内置的日常 / 情绪向中性查询，避免触及敏感话题 */
const DEFAULT_QUERIES = [
  "今天有点累怎么调节心情",
  "工作压力大怎么缓解",
  "和朋友闹矛盾了怎么办",
  "想放弃的时候怎么坚持",
  "emo了怎么办",
  "如何和自己和解",
  "成年人的崩溃瞬间",
  "如何安慰一个难过的朋友",
  "周末不想出门只想躺着",
  "最近总是睡不好",
];

async function main() {
  const custom = process.argv.slice(2);
  const queries = custom.length > 0 ? custom : DEFAULT_QUERIES;

  console.log(`[harvest] 开始采集，共 ${queries.length} 个查询，超时 ${env.WEB_SEARCH_TIMEOUT_MS}ms/源`);
  const collected: string[] = [];

  for (const q of queries) {
    try {
      const results = await webSearch(q, {
        timeoutMs: env.WEB_SEARCH_TIMEOUT_MS,
        apiUrl: env.SEARCH_API_URL,
        apiKey: env.SEARCH_API_KEY,
      });
      for (const r of results) {
        const text = (r.snippet || r.title).trim();
        // 只取自然语言片段：长度适中、通过安全过滤、含中文
        if (
          text.length >= 8 &&
          text.length <= 80 &&
          /[一-龥]/.test(text) &&
          checkContentSafety(text).passed
        ) {
          collected.push(text);
        }
      }
      console.log(`  · "${q}" → ${results.length} 条结果`);
    } catch (e) {
      console.warn(`  · "${q}" 采集失败:`, (e as Error).message);
    }
  }

  const added = addStyleLines(collected);
  console.log(`[harvest] 完成：候选 ${collected.length} 条，新入库 ${added} 条。`);
  console.log(`[harvest] 重启服务后，新语料将作为三我语气样例生效。`);
}

main().catch((e) => {
  console.error("[harvest] 异常退出:", e);
  process.exit(1);
});
