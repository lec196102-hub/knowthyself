import { test } from "node:test";
import assert from "node:assert/strict";
import { validateUserInput, finalSafetyFilter, detectIdViolation } from "../../src/core/safety.js";

test("违规输入被拦截", () => {
  const r = validateUserInput("我想自杀方法");
  assert.equal(r.safe, false);
  assert.ok(r.warning !== undefined);
});

test("正常内容通过最终过滤", () => {
  assert.equal(finalSafetyFilter("今天感觉还不错").passed, true);
});

test("本我行为建议被检测为行为建议", () => {
  const r = detectIdViolation("我建议你去报复他，打他一顿");
  assert.equal(r.violated, true);
  assert.equal(r.violationType, "行为建议");
});

test("正常情绪表达不触发违规", () => {
  assert.equal(detectIdViolation("我真的很生气，感觉被背叛了").violated, false);
});
