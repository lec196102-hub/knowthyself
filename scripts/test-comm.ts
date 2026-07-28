/**
 * 验证「沟通底层逻辑」模块：
 *  - communicationDirective() 返回通用底理且非空
 *  - buildCommStyle() 对四种气质产出差异化、可区分的沟通适配文本
 *  - 胆汁质 vs 抑郁质 的适配明显不同（直接结论 vs 深度共情）
 */
import { buildCommStyle, communicationDirective, COMM_STYLE_BY_TEMPERAMENT } from "../src/core/communication.js";
import type { TemperamentProfile, TemperamentType } from "../src/core/temperament/questions.js";

const H: TemperamentProfile["intensities"] = {
  choleric: "high", sanguine: "low", phlegmatic: "low", melancholic: "low",
};
const types: TemperamentType[] = ["choleric", "sanguine", "phlegmatic", "melancholic"];

const profiles: Record<TemperamentType, TemperamentProfile> = {
  choleric: { scores: {} as any, type: "single", primary: "choleric", intensities: { ...H }, summary: "" },
  sanguine: { scores: {} as any, type: "single", primary: "sanguine", intensities: { choleric: "low", sanguine: "high", phlegmatic: "low", melancholic: "low" }, summary: "" },
  phlegmatic: { scores: {} as any, type: "single", primary: "phlegmatic", intensities: { choleric: "low", sanguine: "low", phlegmatic: "high", melancholic: "low" }, summary: "" },
  melancholic: { scores: {} as any, type: "single", primary: "melancholic", intensities: { choleric: "low", sanguine: "low", phlegmatic: "low", melancholic: "high" }, summary: "" },
};

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean, extra = "") {
  if (cond) { pass++; console.log(`  ✅ ${label}${extra ? " — " + extra : ""}`); }
  else { fail++; console.log(`  ❌ ${label}${extra ? " — " + extra : ""}`); }
}

console.log("🗣 沟通底层逻辑 · 验证\n");

const directive = communicationDirective();
check("通用沟通底理非空", directive.length > 200, `${directive.length} 字`);
check("底理含 NVC/萨提亚/FBI 等来源关键词",
  /非暴力沟通|萨提亚|NVC|FBI|关键对话|好感话术/.test(directive));

const styles = types.map((t) => ({ t, s: buildCommStyle(profiles[t]) }));

for (const { t, s } of styles) {
  check(`[${t}] commStyle 非空且含「最爱听」`, s.includes("他最爱听"), `${s.length} 字`);
  // 不应包含其它气质「最爱听」的内容（单气质纯净度）
  const others = types.filter((o) => o !== t);
  const leak = others.some((o) => s.includes(`【${labelOf(o)}倾向`));
  check(`[${t}] 未串入其它气质画像`, !leak);
}

// 胆汁质 与 抑郁质 差异化
const chol = buildCommStyle(profiles.choleric);
const melan = buildCommStyle(profiles.melancholic);
check("胆汁质↔抑郁质 沟通适配不同", chol !== melan);
check("胆汁质强调「结论/决定权」", /结论先行|决定权|踢回/.test(chol));
check("抑郁质强调「深度共情/不完美」", /深度共情|不完美|被看见/.test(melan));

// 混合型：primary 0.7 + secondary 0.3 应同时出现两段
const mixed: TemperamentProfile = {
  scores: {} as any, type: "mixed_dual", primary: "choleric", secondary: "melancholic",
  intensities: { choleric: "high", sanguine: "low", phlegmatic: "low", melancholic: "moderate" },
  summary: "",
};
const mixedStyle = buildCommStyle(mixed);
check("混合型出现两段气质画像", mixedStyle.includes("【胆汁质倾向") && mixedStyle.includes("【抑郁质倾向"));

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
if (fail > 0) process.exit(1);

function labelOf(t: TemperamentType): string {
  return ({ choleric: "胆汁质", sanguine: "多血质", phlegmatic: "粘液质", melancholic: "抑郁质" } as const)[t];
}
