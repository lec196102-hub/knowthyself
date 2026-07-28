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
import {
  calculateScores,
  determineProfile,
  pickDailyQuestions,
  buildCongrats,
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
