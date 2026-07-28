/**
 * 日记 API 路由
 *
 * POST   /api/journal                    提交一篇日记，返回三角色回应
 * POST   /api/journal/import             批量导入历史日记（支持带原始日期），可选导入后自动聚合推断画像
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
  collectDiaryTexts,
  getJournalDir,
  type JournalRecord,
} from "../../storage/journal-store.js";
import { loadProfile } from "../../storage/profile-store.js";
import { getStyleModulation } from "../../core/temperament.js";
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

  /** POST /api/journal/import - 批量导入历史日记
   *  - entries: [{ text, date?, timestamp? }]，text 必填
   *  - 自动去重（该用户内大小写不敏感去重，含已存在与批次内重复）
   *  - 保留原始日期（date/timestamp）以还原时间线排序
   *  - autoInfer: 导入完成后自动用该用户全部历史日记聚合推断气质画像
   *  此入口不受 onboarding 门禁限制（导入即用于构建语言画像，无需先做题）
   */
  router.post("/import", async (req: Request, res: Response) => {
    try {
      const { entries, userId = "default", autoInfer = false } = req.body || {};
      if (!Array.isArray(entries) || entries.length === 0) {
        return res.status(400).json({ error: "请提供 entries 数组，每项至少含 text 字段" });
      }

      // 现有日记去重集合
      const existing = new Set(
        listJournals(userId)
          .map((r) => (r.diary || "").trim().toLowerCase())
          .filter(Boolean),
      );
      const batchSeen = new Set<string>();

      let saved = 0;
      let skipped = 0;
      const savedFiles: string[] = [];

      for (const entry of entries) {
        if (!entry || typeof entry.text !== "string") {
          skipped++;
          continue;
        }
        const text = entry.text.trim();
        if (text.length === 0 || text.length > 5000) {
          skipped++;
          continue;
        }
        const key = text.toLowerCase();
        if (existing.has(key) || batchSeen.has(key)) {
          skipped++;
          continue;
        }
        batchSeen.add(key);

        // 还原原始时间线：优先 timestamp，其次 date（YYYY-MM-DD / ISO）
        let ts: string | undefined;
        if (typeof entry.timestamp === "string" && entry.timestamp.trim()) ts = entry.timestamp.trim();
        else if (typeof entry.date === "string" && entry.date.trim()) ts = entry.date.trim();

        const record: JournalRecord = {
          userId,
          timestamp: ts || new Date().toISOString(),
          diary: text,
          hasTemperamentProfile: false,
          responses: null,
          imported: true,
          importedAt: new Date().toISOString(),
          originalDate: ts,
        };
        const f = saveJournal(record, userId, ts);
        savedFiles.push(f);
        saved++;
        existing.add(key);
      }

      // 可选：导入完成后，自动用该用户全部历史日记聚合推断画像
      let infer: any = null;
      if (autoInfer && saved > 0) {
        const texts = collectDiaryTexts(userId);
        if (texts.length > 0) {
          const r = await engine.inferAndSaveProfile(userId, texts);
          infer = {
            method: r.method,
            sampleCount: texts.length,
            savedTo: r.savedTo,
            data: {
              scores: r.scores,
              profile: r.profile,
              style: getStyleModulation(r.profile),
              congrats: r.congrats,
            },
          };
        }
      }

      return res.json({
        success: true,
        saved,
        skipped,
        total: entries.length,
        savedTo: getJournalDir(),
        infer,
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
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
