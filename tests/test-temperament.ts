/**
 * CLI 气质测试工具
 *
 * 交互式运行 60 道气质测试题，输出判定结果和 Agent 风格调制预览。
 * 无需 API key 即可运行。
 *
 * 用法: npx tsx src/test-temperament.ts
 *        或指定答案文件: npx tsx src/test-temperament.ts --file answers.json
 */

import { createInterface } from "readline";
import { readFileSync } from "fs";
import { resolve } from "path";
import {
  QUESTIONS,
  calculateScores,
  determineProfile,
  getStyleModulation,
  OPTION_SCORES,
} from "../src/core/temperament.js";
import type { AnswerSheet } from "../src/core/temperament.js";

const OPTION_LABELS: Record<number, string> = {
  1: "很符合",
  2: "比较符合",
  3: "拿不准/中间",
  4: "比较不符合",
  5: "完全不符合",
};

const TYPE_EMOJI: Record<string, string> = {
  choleric: "🔥",
  sanguine: "🌊",
  phlegmatic: "🪨",
  melancholic: "🌙",
};

const TYPE_NAMES: Record<string, string> = {
  choleric: "胆汁质",
  sanguine: "多血质",
  phlegmatic: "粘液质",
  melancholic: "抑郁质",
};

async function main(): Promise<void> {
  console.log("\n╔══════════════════════════════════╗");
  console.log("║   🔮 Triune Journal 气质测试    ║");
  console.log("║   60题 · 4维度 · 3 Agent调制    ║");
  console.log("╚══════════════════════════════════╝\n");

  // 检查是否从文件加载答案
  const args = process.argv.slice(2);
  const fileArg = args.indexOf("--file");
  let answers: AnswerSheet = {};

  if (fileArg !== -1 && args[fileArg + 1]) {
    const filePath = resolve(args[fileArg + 1]);
    console.log(`📂 从文件加载答案: ${filePath}`);
    try {
      const raw = readFileSync(filePath, "utf-8");
      const data = JSON.parse(raw);
      answers = data.answers || data;
    } catch (err: any) {
      console.error("❌ 读取文件失败:", err.message);
      process.exit(1);
    }
  } else {
    // 交互式答题
    answers = await interactiveTest();
  }

  // 计算结果
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("📊 分析结果\n");

  const scores = calculateScores(answers);
  const profile = determineProfile(scores);
  const style = getStyleModulation(profile);

  // 显示四个维度得分
  const maxScore = 30;
  for (const [type, score] of Object.entries(scores) as [string, number][]) {
    const emoji = TYPE_EMOJI[type] || "❓";
    const name = TYPE_NAMES[type] || type;
    const barLen = Math.max(0, Math.round(((score + maxScore) / (maxScore * 2)) * 30));
    const bar = "█".repeat(Math.min(barLen, 30));
    const intensity = score > 20 ? "🔥 高度典型" : score > 10 ? "📈 明显" : score >= -5 ? "📊 中等" : "📉 弱";
    console.log(`${emoji} ${name.padEnd(6)} ${String(score).padStart(3)}分  ${bar.padEnd(30)} ${intensity}`);
  }

  // 判定结果
  console.log(`\n📋 判定: ${profile.summary}`);
  console.log(`   类型: ${profile.type}`);

  // Agent 风格调制预览
  console.log(`\n🎭 Agent 风格调制预览:`);
  console.log(`   ${"-".repeat(38)}`);
  console.log(`   本我语气: ${style.idStyle.substring(0, 100)}...`);
  console.log(`   自我策略: ${style.egoTactic.substring(0, 100)}...`);
  console.log(`   超我角度: ${style.superegoAngle.substring(0, 100)}...`);
  console.log();

  // 输出 JSON（方便保存）
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("📦 JSON 输出（可保存为文件复用）:\n");
  console.log(JSON.stringify({ scores, profile, style }, null, 2));

  // 提示使用方法
  console.log("\n💡 提示:");
  console.log("   1. 将上方JSON保存为 answers.json");
  console.log("   2. 下次运行: npx tsx src/test-temperament.ts --file answers.json");
  console.log("   3. 或在 API 中: POST /api/temperament/test { answers: {...} }\n");
}

async function interactiveTest(): Promise<AnswerSheet> {
  const answers: AnswerSheet = {};

  console.log("请逐题作答（输入 1-5，回车确认）:\n");
  console.log("  1=很符合  2=比较符合  3=拿不准/中间  4=比较不符合  5=完全不符合");
  console.log("  输入 q 退出 | 输入 s 跳过当前题\n");

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  let currentIndex = 0;
  const total = QUESTIONS.length;

  const askNext = (): Promise<void> => {
    return new Promise((resolve) => {
      if (currentIndex >= total) {
        rl.close();
        resolve();
        return;
      }

      const q = QUESTIONS[currentIndex];
      const category = TYPE_NAMES[q.category];
      console.log(`\n[${currentIndex + 1}/${total}] [${category}]`);
      console.log(`${q.text}`);
      rl.question(`你的选择 (1-5): `, (input: string) => {
        const trimmed = input.trim().toLowerCase();

        if (trimmed === "q") {
          rl.close();
          resolve();
          return;
        }

        const num = parseInt(trimmed, 10);
        if (num >= 1 && num <= 5) {
          answers[q.id] = num;
          console.log(`  ✓ ${OPTION_LABELS[num]} (${OPTION_SCORES[num] > 0 ? "+" : ""}${OPTION_SCORES[num]})`);
        } else if (trimmed === "s" || trimmed === "") {
          // 跳过，不记录
          console.log("  ⏭ 跳过");
        } else {
          console.log("  ⚠ 请输入 1-5 之间的数字");
        }

        currentIndex++;
        resolve(askNext());
      });
    });
  };

  await askNext();
  console.log(`\n✅ 答题完成！共作答 ${Object.keys(answers).length}/${total} 题\n`);
  return answers;
}

main().catch(console.error);
