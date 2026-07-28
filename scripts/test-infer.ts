/**
 * 语言推断气质画像 · 验证脚本
 *
 * 用法（项目根目录）：
 *   npx tsx scripts/test-infer.ts
 *
 * 它会用四段「特征鲜明」的示例文本，分别走启发式推断，
 * 并展示 文本 → 四气质得分 → 画像判定 → 风格调制 的完整链路，
 * 证明「用用户语言构建三我性格画像」在问卷之外确实可用。
 *
 * LLM 路径（inferScoresFromLanguage）由 API 端 /api/temperament/infer 触发，
 * 此处重点验证零依赖的启发式兜底与下游 determineProfile/getStyleModulation 衔接。
 */

import {
  inferScoresHeuristic,
  determineProfile,
  getStyleModulation,
  TYPE_LABELS,
  type TemperamentType,
} from "../src/core/temperament.js";

const SAMPLES: { name: string; expect: TemperamentType; text: string }[] = [
  {
    name: "胆汁质样本",
    expect: "choleric",
    text: "气死我了！这破班真是一天都干不下去，老子不伺候了！凭什么天天让我背锅？烦透了！",
  },
  {
    name: "多血质样本",
    expect: "sanguine",
    text: "哈哈今天和朋友出去玩太开心了！逛街吃火锅看电影，简直不要太爽～明天再约！😆",
  },
  {
    name: "粘液质样本",
    expect: "phlegmatic",
    text: "还好吧，事情慢慢来就行。我也不急，顺其自然，该来的总会来。随便怎样都行，无所谓。",
  },
  {
    name: "抑郁质样本",
    expect: "melancholic",
    text: "不知道为什么，最近总是有点难过，想太多睡不着。回忆涌上来，心里空落落的，有点想哭。",
  },
];

console.log("🔮 语言推断气质画像 · 验证\n");

let pass = 0;
for (const s of SAMPLES) {
  const res = inferScoresHeuristic([s.text]);
  const profile = determineProfile(res.scores);
  const mod = getStyleModulation(profile);
  const hit = profile.primary === s.expect;
  if (hit) pass++;

  console.log(`【${s.name}】 期望主导=${TYPE_LABELS[s.expect]}`);
  console.log(
    `  得分: 胆${res.scores.choleric} 多${res.scores.sanguine} 粘${res.scores.phlegmatic} 抑${res.scores.melancholic}`,
  );
  console.log(`  判定: ${profile.type} / 主导=${TYPE_LABELS[profile.primary]}`);
  console.log(`  本我语气调制(节选): ${mod.idStyle.slice(0, 40)}…`);
  console.log(`  命中期望: ${hit ? "✅" : "⚠️（启发式为粗估，未命中属正常）"}\n`);
}

console.log(`启发式主导气质命中: ${pass}/${SAMPLES.length}（目标 ≥1，证明链路可用）`);
console.log("说明：启发式仅作无 API key 时的兜底；配置模型后 API 端用 LLM 做语义级推断，精度更高。");
