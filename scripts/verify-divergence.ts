/**
 * 临时验证脚本：三我差异化机制自检（可随时删除或保留作回归用）
 * 运行：npx tsx scripts/verify-divergence.ts
 */
import { ID_BASE_PROMPT, buildIdDebatePrompt } from "../src/agents/id.js";
import { EGO_BASE_PROMPT, buildEgoFinalPrompt } from "../src/agents/ego.js";
import { SUPEREGO_BASE_PROMPT, buildSuperegoDebatePrompt } from "../src/agents/superego.js";
import { humanizeDirective, searchGroundingBlock } from "../src/agents/humanize.js";

let fail = 0;
function check(name: string, ok: boolean) {
  console.log((ok ? "PASS" : "FAIL") + "  " + name);
  if (!ok) fail++;
}

check("ID 含欲望层", ID_BASE_PROMPT.includes("欲望层"));
check("ID 不含现实层专属块", !ID_BASE_PROMPT.includes("现实层 · 怎么办"));
check("SUP 含价值层", SUPEREGO_BASE_PROMPT.includes("价值层"));
check("SUP 不含欲望专属块", !SUPEREGO_BASE_PROMPT.includes("专属层 = 【欲望层"));
check("EGO 含现实层", EGO_BASE_PROMPT.includes("现实层"));
check(
  "三者都含分工铁律",
  [ID_BASE_PROMPT, EGO_BASE_PROMPT, SUPEREGO_BASE_PROMPT].every((p) => p.includes("三我分工铁律")),
);

const sc = "1. 测试资料\n   这是一条测试摘要";
const bId = searchGroundingBlock(sc, "id");
const bSup = searchGroundingBlock(sc, "superego");
const bEgo = searchGroundingBlock(sc, "ego");
check("id 资料块=背景版", bId.includes("严禁复述") && !bId.includes("必须据此作答"));
check("superego 资料块=背景版", bSup.includes("严禁复述"));
check("ego 资料块=引用版", bEgo.includes("必须据此作答"));

const a = humanizeDirective();
const b = humanizeDirective();
const c = humanizeDirective();
check("humanizeDirective 每次独立采样", a !== b || b !== c);

const dId = buildIdDebatePrompt("测试问题？", "超我：先冷静。");
const dSup = buildSuperegoDebatePrompt("测试问题？", "本我：冲就完了。", false);
check("id 争吵禁重复对方用词", dId.includes("禁止重复超我用过的词"));
check("superego 争吵禁重复对方用词", dSup.includes("禁止重复本我用过的词"));

const fEgo = buildEgoFinalPrompt("测试问题？", "本我：想要。\n超我：克制。");
check("ego 拍板禁重播台词", fEgo.includes("一个都不要复用"));

console.log(fail === 0 ? "\nALL PASS" : `\n${fail} FAILED`);
process.exit(fail === 0 ? 0 : 1);
