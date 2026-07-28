/**
 * 日记 API 路由
 *
 * POST   /api/journal                    提交一篇日记，返回三角色回应
 * GET    /api/journal/:userId            获取用户所有日记记录
 * GET    /api/journal/:userId/logs?q=…   聊天日志：搜索聊天记录
 * DELETE /api/journal/:userId/logs/:logId 删除一条聊天记录
 * DELETE /api/journal/:userId/logs       清空全部聊天记录
 */

import { Router, type Request, type Response } from "express";
import { TriuneEngine } from "../../core/triune.js";
import {
  saveJournal,
  listJournals,
  listJournalEntries,
  deleteJournal,
  deleteAllJournals,
} from "../../storage/journal-store.js";
import { loadProfile } from "../../storage/profile-store.js";
import { MemoryStore } from "../../core/memory.js";

export function createJournalRouter(engine: TriuneEngine): Router {
  const router = Router();

  // 基础速率限制：按 userId 限制最小请求间隔，防刷接口 / 失控循环
  const lastRequestAt = new Map<string, number>();
  const MIN_INTERVAL_MS = 1500;

  /** POST /api/journal - 提交一篇日记，获取三角色回应 */
  router.post("/", async (req: Request, res: Response) => {
    try {
      const { content, userId = "default" } = req.body;
      const hasImage = !!req.body.imageBase64;
      const imageBase64 = req.body.imageBase64 || null;

      if (!content || typeof content !== "string" || content.trim().length === 0) {
        return res.status(400).json({ error: "日记内容不能为空" });
      }

      // 体量限制 + 基础限流（防止超长输入与高频刷接口）
      if (content.length > 5000) {
        return res.status(400).json({ error: "日记内容过长，单次上限 5000 字" });
      }
      const now = Date.now();
      const lastReq = lastRequestAt.get(userId);
      if (lastReq && now - lastReq < MIN_INTERVAL_MS) {
        return res.status(429).json({ error: "操作过于频繁，请稍后再试" });
      }
      lastRequestAt.set(userId, now);

      // Onboarding 门禁：使用前必须先完成首日一批气质测试（每日10题），
      // 否则不允许日记。渐进式：答满首日即可解锁，剩余题目后续 6 天内补齐。
      const profile = loadProfile(userId);
      if (!profile || !profile.onboarded) {
        return res.status(401).json({
          success: false,
          onboardingRequired: true,
          error: "请先完成今日的气质测试（10题）后再开始日记。",
          temperamentUrl: "/api/temperament/today",
        });
      }

      // 调用三Agent引擎（会自动应用该用户的气质风格）
      const result = await engine.processDiary(content.trim(), userId);

      const hasProfile = engine.getUserStyle(userId) !== undefined;

      const record = {
        userId,
        timestamp: new Date().toISOString(),
        diary: content.trim(),
        hasTemperamentProfile: hasProfile,
        responses: result,
      };
      const savedTo = saveJournal(record, userId);

      return res.json({
        success: true,
        data: {
          id: result.id,
          ego: result.ego,
          superego: result.superego,
          safety: result.safetyFlags,
          sources: result.sources ?? [],
          debate: result.debate ?? [],
        },
        temperamentActive: hasProfile,
        imageNote: hasImage
          ? "图片已接收。当前模型暂不支持视觉分析，请为截图添加文字描述以获得更好的回应。"
          : undefined,
        audit: result.auditTrail,
        savedTo,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: "处理日记时出错",
        detail: error.message,
      });
    }
  });

  /** GET /api/memory/:userId - 查看该用户的长期记忆（验证"陪伴"飞轮） */
  router.get("/memory/:userId", (req: Request, res: Response) => {
    try {
      const userId = String(req.params.userId);
      const mem = new MemoryStore().load(userId);
      return res.json({
        success: true,
        userId,
        factCount: mem.facts.length,
        facts: mem.facts,
        recentThemes: mem.recentThemes,
        updatedAt: mem.updatedAt,
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  /** GET /api/journal/:userId/logs?q=关键词 - 聊天日志：搜索聊天记录（q 为空则返回全部，新→旧） */
  router.get("/:userId/logs", (req: Request, res: Response) => {
    try {
      const userId = String(req.params.userId);
      const q = String(req.query.q || "").trim().toLowerCase();
      let entries = listJournalEntries(userId);

      if (q) {
        entries = entries.filter((e) => {
          const rec = e.record as any;
          const parts: string[] = [rec.diary || ""];
          const rs = rec.responses || {};
          for (const k of ["id", "ego", "superego"]) {
            if (rs[k]?.text) parts.push(rs[k].text);
          }
          if (Array.isArray(rs.debate)) {
            for (const d of rs.debate) parts.push(d.text || "");
          }
          return parts.join("\n").toLowerCase().includes(q);
        });
      }

      // 列表瘦身：只回传预览字段，避免整包 JSON 拖慢页面
      const data = entries.map((e) => {
        const rec = e.record as any;
        const rs = rec.responses || {};
        return {
          id: e.id,
          timestamp: rec.timestamp,
          diary: rec.diary || "",
          idText: rs.id?.text || "",
          egoText: rs.ego?.text || "",
          superegoText: rs.superego?.text || "",
          debateCount: Array.isArray(rs.debate) ? rs.debate.length : 0,
        };
      });
      return res.json({ success: true, count: data.length, data });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  /** DELETE /api/journal/:userId/logs/:logId - 删除一条聊天记录 */
  router.delete("/:userId/logs/:logId", (req: Request, res: Response) => {
    try {
      const userId = String(req.params.userId);
      const logId = String(req.params.logId);
      const ok = deleteJournal(userId, logId);
      if (!ok) return res.status(404).json({ success: false, error: "记录不存在或无权删除" });
      return res.json({ success: true });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  /** DELETE /api/journal/:userId/logs - 清空该用户全部聊天记录 */
  router.delete("/:userId/logs", (req: Request, res: Response) => {
    try {
      const userId = String(req.params.userId);
      const n = deleteAllJournals(userId);
      return res.json({ success: true, deleted: n });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  /** GET /api/journal/:userId - 获取用户所有日记记录 */
  router.get("/:userId", (req: Request, res: Response) => {
    try {
      const userId = String(req.params.userId);
      const records = listJournals(userId);
      return res.json({ success: true, count: records.length, data: records });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  return router;
}
