/**
 * 气质测试 API 路由
 *
 * GET  /api/temperament/today       获取今日待答题 + 进度（渐进式每日测试）
 * POST /api/temperament/answer       提交今日答案，累积进度
 * POST /api/temperament/test         一次性提交 60 题（旧接口，保留兼容）
 * GET  /api/temperament/profile/:userId 获取用户气质画像/进度
 * GET  /api/temperament/questions    获取完整 60 题列表
 */

import { Router, type Request, type Response } from "express";
import { TriuneEngine } from "../../core/triune.js";
import { saveProfile, loadProfile } from "../../storage/profile-store.js";
import { collectDiaryTexts } from "../../storage/journal-store.js";
import {
  calculateScores,
  determineProfile,
  pickDailyQuestions,
  buildCongrats,
  getStyleModulation,
  TOTAL_QUESTIONS,
  QUESTIONS_PER_DAY,
} from "../../core/temperament.js";
import type { AnswerSheet } from "../../core/temperament.js";
import type { ProfileRecord } from "../../storage/profile-store.js";

/** 本地日期 YYYY-MM-DD（用于「每天不重复」判定） */
function todayStr(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** 把一份累积答案最终化：若答满则计算画像与恭喜词 */
function finalizeIfComplete(answers: AnswerSheet, rec: {
  onboarded: boolean;
  completed: boolean;
  profile?: any;
  congrats?: string;
  completedAt?: string;
}) {
  const answeredCount = Object.keys(answers).length;
  rec.onboarded = answeredCount >= QUESTIONS_PER_DAY;
  if (answeredCount >= TOTAL_QUESTIONS) {
    rec.completed = true;
    rec.completedAt = new Date().toISOString();
    const profile = determineProfile(calculateScores(answers));
    rec.profile = profile;
    rec.congrats = buildCongrats(profile);
  }
  return rec;
}

export function createTemperamentRouter(engine: TriuneEngine): Router {
  const router = Router();

  /** GET /api/temperament/today - 今日待答题 + 进度（渐进式） */
  router.get("/today", (req: Request, res: Response) => {
    try {
      const userId = String(req.query.userId || "default");
      const rec = loadProfile(userId);

      // 首次使用：未答题
      if (!rec) {
        return res.json({
          success: true,
          data: {
            onboarded: false,
            completed: false,
            answered: 0,
            total: TOTAL_QUESTIONS,
            day: 1,
            alreadyDoneToday: false,
            todayQuestions: pickDailyQuestions({}),
          },
        });
      }

      const answered = Object.keys(rec.answers).length;

      // 已答满：直接返回完成态 + 恭喜词
      if (rec.completed) {
        return res.json({
          success: true,
          data: {
            onboarded: true,
            completed: true,
            answered,
            total: TOTAL_QUESTIONS,
            day: Math.floor(answered / QUESTIONS_PER_DAY) + 1,
            alreadyDoneToday: true,
            profile: rec.profile,
            congrats: rec.congrats,
          },
        });
      }

      const alreadyDoneToday = rec.lastDailyDate === todayStr();
      const todayQuestions = alreadyDoneToday ? [] : pickDailyQuestions(rec.answers);
      const day = Math.floor(answered / QUESTIONS_PER_DAY) + 1;

      return res.json({
        success: true,
        data: {
          onboarded: rec.onboarded,
          completed: false,
          answered,
          total: TOTAL_QUESTIONS,
          day,
          alreadyDoneToday,
          todayQuestions,
        },
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  /** POST /api/temperament/answer - 提交今日答案（累积，渐进式） */
  router.post("/answer", (req: Request, res: Response) => {
    try {
      const { answers, userId = "default" } = req.body;

      if (!answers || typeof answers !== "object") {
        return res.status(400).json({ error: "请提供答题数据 {1: 1-5, 2: 1-5, ...}" });
      }

      const rec: ProfileRecord = loadProfile(userId) || {
        userId,
        answers: {} as AnswerSheet,
        onboarded: false,
        completed: false,
        createdAt: new Date().toISOString(),
      };

      // 合并今日答案（覆盖同题）
      rec.answers = { ...rec.answers, ...answers };
      rec.lastDailyDate = todayStr();

      finalizeIfComplete(rec.answers, rec);

      const savedTo = saveProfile(userId, rec);

      // 注册到引擎（前期/完整均用累积答案计算，渐进调制语气）
      engine.setUserTemperament(userId, rec.answers);

      return res.json({
        success: true,
        savedTo,
        data: {
          onboarded: rec.onboarded,
          completed: rec.completed,
          answered: Object.keys(rec.answers).length,
          total: TOTAL_QUESTIONS,
          day: Math.floor(Object.keys(rec.answers).length / QUESTIONS_PER_DAY) + 1,
          alreadyDoneToday: true,
          profile: rec.profile,
          congrats: rec.congrats,
        },
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  /** POST /api/temperament/test - 一次性提交 60 题（旧接口，保留兼容） */
  router.post("/test", (req: Request, res: Response) => {
    try {
      const { answers, userId = "default" } = req.body;

      if (!answers || typeof answers !== "object") {
        return res.status(400).json({ error: "请提供答题数据 {1: 1-5, 2: 1-5, ...}" });
      }

      const profile = determineProfile(calculateScores(answers));
      const congrats = buildCongrats(profile);

      const rec = {
        userId,
        answers: answers as AnswerSheet,
        onboarded: true,
        completed: true,
        profile,
        congrats,
        lastDailyDate: todayStr(),
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      };
      const savedTo = saveProfile(userId, rec);

      // 注册到引擎（后续日记批注使用此气质风格）
      engine.setUserTemperament(userId, answers);

      return res.json({
        success: true,
        data: profile,
        congrats,
        savedTo,
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  /** POST /api/temperament/infer - 用用户语言（日记/随笔）推断气质画像
   *  支持两种样本来源：
   *   - 显式文本：texts 数组 或 text 字符串
   *   - 历史聚合：fromHistory=true 时，自动拉取该用户全部历史日记作为样本
   */
  router.post("/infer", async (req: Request, res: Response) => {
    try {
      const { userId = "default", texts, text, fromHistory = false } = req.body || {};

      // 收集文本样本：支持 texts 数组 或 单个 text（按换行切分）
      const collected: string[] = [];
      if (Array.isArray(texts)) {
        for (const t of texts) if (typeof t === "string" && t.trim()) collected.push(t.trim());
      }
      if (typeof text === "string" && text.trim()) {
        for (const line of text.split(/\n+/)) if (line.trim()) collected.push(line.trim());
      }

      // 无显式文本时，尝试聚合该用户的历史日记作为样本
      if (collected.length === 0 && fromHistory) {
        collected.push(...collectDiaryTexts(userId));
      }

      if (collected.length === 0) {
        return res.status(400).json({
          error: "请提供用于推断的文本（texts/text），或传 fromHistory:true 以聚合该用户的历史日记。",
        });
      }

      // 体量限制：每篇 ≤ 2000 字，最多 30 篇，总 ≤ 6000 字（防 token 膨胀）
      const trimmed = collected
        .map((t) => t.slice(0, 2000))
        .slice(0, 30);
      const totalLen = trimmed.join("").length;
      if (totalLen < 20) {
        return res.status(400).json({ error: "文本太少，无法推断气质。请多写几句（≥20 字）。" });
      }
      if (totalLen > 6000) {
        return res.status(400).json({ error: "文本过长，单次上限 6000 字。" });
      }

      // 复用引擎方法：推断 + 落盘（ language 来源）+ 返回结果
      const { scores, profile, basis, method, congrats, savedTo } = await engine.inferAndSaveProfile(
        userId,
        trimmed,
      );

      return res.json({
        success: true,
        method, // "llm" | "heuristic"，前端可据此提示「这是估算」
        basis: basis || undefined,
        savedTo,
        sampleCount: trimmed.length,
        data: {
          scores,
          profile,
          style: getStyleModulation(profile),
          congrats,
        },
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  /** GET /api/temperament/profile/:userId - 获取用户气质画像/进度 */
  router.get("/profile/:userId", (req: Request, res: Response) => {
    try {
      const userId = String(req.params.userId);
      const rec = loadProfile(userId);

      if (!rec) {
        return res.status(404).json({ error: "未找到该用户的气质画像，请先完成测试" });
      }

      return res.json({
        success: true,
        data: {
          onboarded: rec.onboarded,
          completed: rec.completed,
          answered: Object.keys(rec.answers).length,
          total: TOTAL_QUESTIONS,
          profile: rec.profile,
          congrats: rec.congrats,
        },
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  /** GET /api/temperament/questions - 获取完整60题列表 */
  router.get("/questions", (_req: Request, res: Response) => {
    // lazy import 避免潜在循环依赖
    import("../../core/temperament.js").then((mod) => {
      return res.json({
        success: true,
        count: mod.QUESTIONS.length,
        data: mod.QUESTIONS,
        scoring: {
          options: [
            { value: 1, label: "很符合", score: "+2" },
            { value: 2, label: "比较符合", score: "+1" },
            { value: 3, label: "拿不准/中间", score: "0" },
            { value: 4, label: "比较不符合", score: "-1" },
            { value: 5, label: "完全不符合", score: "-2" },
          ],
          categories: {
            choleric: { label: "胆汁质", count: 15 },
            sanguine: { label: "多血质", count: 15 },
            phlegmatic: { label: "粘液质", count: 15 },
            melancholic: { label: "抑郁质", count: 15 },
          },
        },
      });
    }).catch((err) => {
      return res.status(500).json({ success: false, error: err.message });
    });
  });

  return router;
}
