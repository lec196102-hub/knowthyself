/**
 * 气质测试模块 · 门面（Phase 1a 拆分）
 *
 * 原单文件（383 行）已拆分为：
 *   - temperament/questions.ts  题库与基础类型
 *   - temperament/scoring.ts    计分与判定
 *   - temperament/profile.ts    气质 → Agent 风格调制
 * 本文件仅做再导出，保证所有 `import ... from "../core/temperament.js"` 的调用方零改动。
 */

export * from "./temperament/questions.js";
export * from "./temperament/scoring.js";
export * from "./temperament/profile.js";
