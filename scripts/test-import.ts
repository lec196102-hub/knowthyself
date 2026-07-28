/**
 * 历史日记导入 + 自动聚合推断 · 验证脚本
 *
 * 用法（项目根目录）：
 *   npx tsx scripts/test-import.ts
 *
 * 验证链路：
 *   导入历史日记（带原始日期）→ 落盘去重 → collectDiaryTexts 聚合
 *   → engine.inferAndSaveProfile 用语言推断画出画像（无 key 走启发式）
 *   → 落盘 source:"language"，日记接口 gate 解除
 *
 * 不依赖 LLM API Key（走启发式兜底），纯验证存储层与引擎整合。
 */

import { saveJournal, collectDiaryTexts, listJournals } from "../src/storage/journal-store.js";
import { loadProfile } from "../src/storage/profile-store.js";
import { TriuneEngine } from "../src/core/triune.js";

// 每次运行用唯一 userId，避免手动删文件（环境安全删除 shim 会拦截 unlinkSync）
const USER = `imp-test-${Date.now()}`;
let pass = 0;
let fail = 0;
function check(label: string, cond: boolean, extra = "") {
  if (cond) {
    pass++;
    console.log(`  ✅ ${label}${extra ? " — " + extra : ""}`);
  } else {
    fail++;
    console.log(`  ❌ ${label}${extra ? " — " + extra : ""}`);
  }
}

async function main() {
  console.log("📥 历史日记导入 + 自动聚合推断 · 验证\n");

  // 1) 模拟「导入」：写入若干带原始日期的历史日记（含一条重复文本用于去重验证）
  const entries = [
    { text: "今天又被领导当众点名了，气死我！这破班真是一天都干不下去，老子不伺候了！凭什么天天让我背锅？", date: "2024-01-01" },
    { text: "烦透了，越想越火大，真想掀桌。什么事都堆到我头上，凭啥？", date: "2024-02-15" },
    { text: "其实也有开心的时候，昨天和朋友出去玩太爽了，哈哈，约下次！", date: "2024-03-20" },
    { text: "今天又被领导当众点名了，气死我！这破班真是一天都干不下去，老子不伺候了！凭什么天天让我背锅？", date: "2024-04-01" }, // 与第1条重复
  ];
  for (const e of entries) {
    saveJournal(
      {
        userId: USER,
        timestamp: e.date,
        diary: e.text,
        hasTemperamentProfile: false,
        responses: null,
        imported: true,
        importedAt: new Date().toISOString(),
        originalDate: e.date,
      },
      USER,
      e.date,
    );
  }

  const files = listJournals(USER);
  console.log(`1) 导入落盘`);
  check("写入 4 条日记文件", files.length === 4, `实际 ${files.length}`);
  check(
    "文件名按原始日期排序（2024-01-01 在前）",
    files[0].timestamp.startsWith("2024-01-01"),
    files[0].timestamp,
  );

  // 2) 聚合：跨导入去重
  const texts = collectDiaryTexts(USER);
  console.log(`2) 历史聚合 collectDiaryTexts`);
  check("聚合去重后返回 3 条（重复文本被合并）", texts.length === 3, `实际 ${texts.length}`);
  check("聚合结果不含空文本", texts.every((t) => t.trim().length > 0));

  // 3) 用聚合样本推断画像（无 key → 启发式）
  console.log(`3) 引擎推断 inferAndSaveProfile`);
  const engine = new TriuneEngine();
  const r = await engine.inferAndSaveProfile(USER, texts);
  check("推断出画像 profile", !!r.profile, `主导=${r.profile?.primary}`);
  check("推断方法合法（llm 或 heuristic 兜底）", r.method === "heuristic" || r.method === "llm", r.method);
  check("返回恭喜词", !!r.congrats);

  // 4) 落盘校验：source 为 language，日记 gate 解除
  const rec = loadProfile(USER);
  console.log(`4) 落盘校验`);
  check("画像来源为 language", rec?.source === "language", `source=${rec?.source}`);
  check("onboarded=true（导入推断后解锁日记）", rec?.onboarded === true);
  check("保留了导入样本 languageSamples", Array.isArray(rec?.languageSamples) && rec!.languageSamples!.length > 0);

  console.log(`\n结果：通过 ${pass} / 失败 ${fail}`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error("测试异常:", e);
  process.exit(1);
});
