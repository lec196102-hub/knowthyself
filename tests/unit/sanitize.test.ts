import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeDebateLine } from "../../src/engine/debate.js";

test("去掉行首舞台指示括号", () => {
  assert.equal(sanitizeDebateLine("（挑眉咧嘴）今天真烦"), "今天真烦");
});

test("去掉说话人前缀", () => {
  assert.equal(sanitizeDebateLine("本我：你就是该发泄"), "你就是该发泄");
});

test("复读整段时只保留最后一段", () => {
  const raw = "本我：A\n超我：B\n本我：C";
  assert.equal(sanitizeDebateLine(raw), "C");
});

test("正常台词不被改动", () => {
  assert.equal(sanitizeDebateLine("我就是想大喊一声"), "我就是想大喊一声");
});
