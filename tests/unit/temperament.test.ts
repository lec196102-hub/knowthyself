import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateScores, determineProfile } from "../../src/core/temperament/scoring.js";
import { QUESTIONS } from "../../src/core/temperament/questions.js";

test("纯胆汁质计分 = 30 / 抑郁质 = -30", () => {
  const a: Record<number, number> = {};
  for (const q of QUESTIONS) a[q.id] = q.category === "choleric" ? 1 : 5;
  const s = calculateScores(a);
  assert.equal(s.choleric, 30);
  assert.equal(s.melancholic, -30);
});

test("全选 3 分 → 均衡混合型", () => {
  const a: Record<number, number> = {};
  for (const q of QUESTIONS) a[q.id] = 3;
  const p = determineProfile(calculateScores(a));
  assert.equal(p.type, "mixed_balanced");
});

test("典型胆汁质 → 单一型且主导为 choleric", () => {
  const a: Record<number, number> = {};
  for (const q of QUESTIONS) a[q.id] = q.category === "choleric" ? 1 : 5;
  const p = determineProfile(calculateScores(a));
  assert.equal(p.type, "single");
  assert.equal(p.primary, "choleric");
  assert.equal(p.intensities.choleric, "high");
});
