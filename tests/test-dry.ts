/**
 * 干运行测试 - 验证架构正确性（含气质模块）
 * 不调用 LLM API
 */

import { checkContentSafety, finalSafetyFilter, validateUserInput, detectIdViolation } from "../src/core/safety.js";
import { ID_BASE_PROMPT } from "../src/agents/id.js";
import { EGO_BASE_PROMPT } from "../src/agents/ego.js";
import { SUPEREGO_BASE_PROMPT } from "../src/agents/superego.js";
import {
  QUESTIONS,
  calculateScores,
  determineProfile,
  getStyleModulation,
} from "../src/core/temperament.js";
import type { AnswerSheet, TemperamentType } from "../src/core/temperament.js";

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string): void {
  if (!condition) {
    console.error(`❌ FAIL: ${testName}`);
    failed++;
  } else {
    console.log(`✅ PASS: ${testName}`);
    passed++;
  }
}

// ========== 安全层测试 ==========
console.log("\n🛡️ 安全层测试");

const r1 = checkContentSafety("今天工作很累，但我觉得自己在成长");
assert(r1.passed, "正常内容通过安全检查");

const r2 = validateUserInput("我想自杀方法");
assert(!r2.safe, "违规输入被拦截");
assert(r2.warning !== undefined, "违规输入返回警告");

const r3 = detectIdViolation("我建议你去报复他，打他一顿");
assert(r3.violated, "检测到本我行为建议违规");
assert(r3.violationType === "行为建议", "违规类型正确");

const r4 = detectIdViolation("我真的很生气，感觉被背叛了");
assert(!r4.violated, "正常情绪表达不触发违规");

const r5 = finalSafetyFilter("正常内容");
assert(r5.passed, "正常内容通过最终过滤");

// ========== Prompt 完整性测试 ==========
console.log("\n📝 Prompt 完整性测试");

const allPrompts = [ID_BASE_PROMPT, EGO_BASE_PROMPT, SUPEREGO_BASE_PROMPT];
for (const prompt of allPrompts) {
  assert(prompt.includes("不支持这种做法"), `包含安全约束`);
  assert(prompt.length > 100, `长度充足: ${prompt.length}`);
  assert(prompt.length < 3000, `长度合理: ${prompt.length}`);
}

// ========== 气质测试模块 ==========
console.log("\n🧬 气质测试模块测试");

// 测试1：题库完整性
assert(QUESTIONS.length === 60, "题库共60题");

const categories = { choleric: 0, sanguine: 0, phlegmatic: 0, melancholic: 0 };
for (const q of QUESTIONS) categories[q.category]++;
assert(categories.choleric === 15, "胆汁质15题");
assert(categories.sanguine === 15, "多血质15题");
assert(categories.phlegmatic === 15, "粘液质15题");
assert(categories.melancholic === 15, "抑郁质15题");

// 测试2：计分 - 典型胆汁质
const cholericAnswers: AnswerSheet = {};
for (const q of QUESTIONS) {
  cholericAnswers[q.id] = q.category === "choleric" ? 1 : 5;
}
const cholericScores = calculateScores(cholericAnswers);
assert(cholericScores.choleric === 30, "纯胆汁质得分=30");
assert(cholericScores.melancholic === -30, "纯胆汁质时抑郁质=-30");

// 测试3：判定 - 典型胆汁质
const cholericProfile = determineProfile(cholericScores);
assert(cholericProfile.type === "single", "判定为单一型");
assert(cholericProfile.primary === "choleric", "主导=胆汁质");
assert(cholericProfile.intensities.choleric === "high", "强度标签=high");
assert(cholericProfile.summary.includes("胆汁质"), "摘要包含胆汁质");
assert(cholericProfile.summary.includes("高度典型"), ">20分标注高度典型");

// 测试4：计分 - 混合型（粘液+多血）
const mixedAnswers: AnswerSheet = {};
for (const q of QUESTIONS) {
  if (q.category === "phlegmatic" || q.category === "sanguine") {
    mixedAnswers[q.id] = 1; // 很符合
  } else {
    mixedAnswers[q.id] = 5; // 完全不符合
  }
}
const mixedScores = calculateScores(mixedAnswers);
const mixedProfile = determineProfile(mixedScores);
assert(mixedProfile.type === "mixed_dual", "判定为双混合型");
assert(
  mixedProfile.primary === "phlegmatic" || mixedProfile.primary === "sanguine",
  "主导是粘液或多血"
);
assert(mixedProfile.secondary !== undefined, "存在次导");

// 测试5：计分 - 均衡型（全选3）
const balancedAnswers: AnswerSheet = {};
for (const q of QUESTIONS) balancedAnswers[q.id] = 3;
const balancedScores = calculateScores(balancedAnswers);
const balancedProfile = determineProfile(balancedScores);
assert(balancedProfile.type === "mixed_balanced", "全3分判定为均衡混合");

// 测试6：风格调制不为空
const style = getStyleModulation(cholericProfile);
assert(style.idStyle.length > 0, "本我风格调制非空");
assert(style.egoTactic.length > 0, "自我策略调制非空");
assert(style.superegoAngle.length > 0, "超我角度调制非空");

// 测试7：四种气质都能正常调制
for (const type of ["choleric", "sanguine", "phlegmatic", "melancholic"] as TemperamentType[]) {
  const tp = { type: "single" as const, primary: type, intensities: { choleric: "high" as const, sanguine: "high" as const, phlegmatic: "high" as const, melancholic: "high" as const }, scores: { choleric: 20, sanguine: 20, phlegmatic: 20, melancholic: 20 }, summary: "" };
  // 修复：使用完整数据构造
  const singleAnswers: AnswerSheet = {};
  for (const q of QUESTIONS) {
    singleAnswers[q.id] = q.category === type ? 1 : 5;
  }
  const singleProfile = determineProfile(calculateScores(singleAnswers));
  const singleStyle = getStyleModulation(singleProfile);
  assert(singleStyle.idStyle.length > 0, `${type} 风格调制成功`);
}

// ========== 汇总 ==========
console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`✅ ${passed} passed  ❌ ${failed} failed  (${passed + failed} total)`);
console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

if (failed > 0) process.exit(1);
