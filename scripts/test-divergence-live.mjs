/**
 * 实测脚本：同一个问题打 /api/journal，检验三我回答是否"完全不同"。
 * 量化指标：字符 bigram Jaccard 相似度（0=完全不同，1=完全相同）。
 * 经验阈值：< 0.15 泾渭分明；0.15~0.30 尚可；> 0.30 趋同预警。
 */
const BASE = process.env.BASE_URL || "http://localhost:3000";
const question = process.argv[2] || "我总是忍不住熬夜刷手机，怎么才能早点睡？";

function bigrams(s) {
  const t = s.replace(/[\s，。！？、：；""''…—()（）\[\]【】]/g, "");
  const set = new Set();
  for (let i = 0; i < t.length - 1; i++) set.add(t.slice(i, i + 2));
  return set;
}
function jaccard(a, b) {
  const A = bigrams(a), B = bigrams(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}
const fmt = (x) => (x * 100).toFixed(1) + "%";

const t0 = Date.now();
const resp = await fetch(`${BASE}/api/journal`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ content: question, userId: "default" }),
});
const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
const json = await resp.json();
if (!json.success) {
  console.error("请求失败:", JSON.stringify(json, null, 2));
  process.exit(1);
}
const d = json.data;

console.log("═══════════════════════════════════════════");
console.log("问题:", question);
console.log("总耗时:", elapsed + "s（含争吵保底时间）");
console.log("═══════════════════════════════════════════");

if (Array.isArray(d.debate) && d.debate.length) {
  console.log("\n⚡ 本我↔超我 争吵（" + d.debate.length + " 条）:");
  for (const turn of d.debate) {
    console.log(`  [${turn.speaker || turn.role || "?"}] ${turn.text}`);
  }
} else {
  console.log("\n（本轮无争吵记录）");
}

console.log("\n🔥 本我:", d.id.text);
console.log("\n👑 自我(拍板):", d.ego.text);
console.log("\n⚖️ 超我:", d.superego.text);

const sIE = jaccard(d.id.text, d.ego.text);
const sIS = jaccard(d.id.text, d.superego.text);
const sES = jaccard(d.ego.text, d.superego.text);
console.log("\n───────── 相似度（bigram Jaccard）─────────");
const judge = (v) => (v < 0.15 ? "✅ 泾渭分明" : v < 0.3 ? "🟡 尚可" : "🔴 趋同预警");
console.log(`本我 vs 自我:   ${fmt(sIE)}  ${judge(sIE)}`);
console.log(`本我 vs 超我:   ${fmt(sIS)}  ${judge(sIS)}`);
console.log(`自我 vs 超我:   ${fmt(sES)}  ${judge(sES)}`);
const max = Math.max(sIE, sIS, sES);
console.log(`\n总评: 最大相似度 ${fmt(max)} → ${judge(max)}`);
if (d.sources?.length) console.log(`\n🔍 参考来源 ${d.sources.length} 条`);
