/**
 * 用户知识库 API 路由
 *
 * 让用户构建「属于自己的人格知识库」：
 *  - 上传日记 / 笔记 / 经历（构建三我回应的背景与画像）
 *  - 分别为三我（本我/自我/超我）设定语气与风格
 *
 * 路由（挂在 /api/knowledge 下）：
 *  GET    /:userId              读取知识库全貌（风格 + 文档列表 + 画像简报）
 *  POST   /:userId/doc          上传一篇文档
 *  PUT    /:userId/style        设置三我风格
 *  PUT    /:userId/doc/:docId   编辑一篇文档
 *  DELETE /:userId/doc/:docId   删除一篇文档
 */

import { Router, type Request, type Response } from "express";
import { TriuneEngine } from "../../core/triune.js";
import {
  loadKnowledge,
  saveKnowledge,
  type DocKind,
  type KnowledgeDoc,
  type PersonaStyle,
} from "../../storage/knowledge-store.js";

export function createKnowledgeRouter(engine: TriuneEngine): Router {
  const router = Router();

  const DOC_MAX = 20000; // 单篇内容上限（字符），防滥用 / token 膨胀
  const KIND_SET = new Set<DocKind>(["diary", "note", "experience"]);

  /** GET /api/knowledge/:userId - 知识库全貌 */
  router.get("/:userId", (req: Request, res: Response) => {
    try {
      const userId = String(req.params.userId);
      const kb = loadKnowledge(userId);
      return res.json({
        success: true,
        userId,
        personaStyle: kb.personaStyle,
        brief: kb.brief || "",
        briefUpdatedAt: kb.briefUpdatedAt,
        documents: kb.documents.map((d) => ({
          id: d.id,
          title: d.title,
          kind: d.kind,
          createdAt: d.createdAt,
          length: d.content.length,
          excerpt: d.content.length > 120 ? d.content.slice(0, 120) + "…" : d.content,
        })),
        docCount: kb.documents.length,
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  /** POST /api/knowledge/:userId/doc - 上传一篇文档 */
  router.post("/:userId/doc", async (req: Request, res: Response) => {
    try {
      const userId = String(req.params.userId);
      const { title, content, kind } = req.body || {};

      if (!content || typeof content !== "string" || content.trim().length === 0) {
        return res.status(400).json({ error: "内容不能为空" });
      }
      if (content.length > DOC_MAX) {
        return res.status(400).json({ error: `单篇内容过长，单次上限 ${DOC_MAX} 字` });
      }

      const k: DocKind =
        typeof kind === "string" && KIND_SET.has(kind as DocKind) ? (kind as DocKind) : "note";
      const t =
        typeof title === "string" && title.trim()
          ? title.trim().slice(0, 80)
          : `未命名-${new Date().toLocaleDateString("zh-CN")}`;

      const doc: KnowledgeDoc = {
        id: Buffer.from(userId + Date.now() + Math.random()).toString("base64").slice(0, 12),
        title: t,
        kind: k,
        content,
        createdAt: new Date().toISOString(),
      };

      const kb = loadKnowledge(userId);
      kb.documents.push(doc);
      saveKnowledge(userId, kb);

      // 异步重建画像简报（不阻塞响应）
      void engine.rebuildPersonaBrief(userId);

      return res.json({ success: true, doc, docCount: kb.documents.length });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  /** PUT /api/knowledge/:userId/style - 设置三我风格 */
  router.put("/:userId/style", (req: Request, res: Response) => {
    try {
      const userId = String(req.params.userId);
      const { id, ego, superego } = req.body || {};
      const kb = loadKnowledge(userId);
      const ps: PersonaStyle = { ...kb.personaStyle };
      if (typeof id === "string") ps.id = id.slice(0, 1000);
      if (typeof ego === "string") ps.ego = ego.slice(0, 1000);
      if (typeof superego === "string") ps.superego = superego.slice(0, 1000);
      kb.personaStyle = ps;
      saveKnowledge(userId, kb);
      return res.json({ success: true, personaStyle: ps });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  /** GET /api/knowledge/:userId/doc/:docId - 读取单篇文档全文（编辑时用） */
  router.get("/:userId/doc/:docId", (req: Request, res: Response) => {
    try {
      const userId = String(req.params.userId);
      const docId = String(req.params.docId);
      const kb = loadKnowledge(userId);
      const doc = kb.documents.find((d) => d.id === docId);
      if (!doc) {
        return res.status(404).json({ success: false, error: "文档不存在" });
      }
      return res.json({ success: true, doc });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  /** PUT /api/knowledge/:userId/doc/:docId - 编辑一篇文档（标题/类型/内容） */
  router.put("/:userId/doc/:docId", (req: Request, res: Response) => {
    try {
      const userId = String(req.params.userId);
      const docId = String(req.params.docId);
      const { title, content, kind } = req.body || {};

      const kb = loadKnowledge(userId);
      const doc = kb.documents.find((d) => d.id === docId);
      if (!doc) {
        return res.status(404).json({ success: false, error: "文档不存在" });
      }
      if (typeof content === "string") {
        if (content.trim().length === 0) {
          return res.status(400).json({ success: false, error: "内容不能为空" });
        }
        if (content.length > DOC_MAX) {
          return res.status(400).json({ success: false, error: `单篇内容过长，单次上限 ${DOC_MAX} 字` });
        }
        doc.content = content;
      }
      if (typeof title === "string" && title.trim()) {
        doc.title = title.trim().slice(0, 80);
      }
      if (typeof kind === "string" && KIND_SET.has(kind as DocKind)) {
        doc.kind = kind as DocKind;
      }
      saveKnowledge(userId, kb);
      // 内容变化后重建画像简报
      void engine.rebuildPersonaBrief(userId);
      return res.json({ success: true, doc: { id: doc.id, title: doc.title, kind: doc.kind } });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  /** DELETE /api/knowledge/:userId/doc/:docId - 删除一篇文档 */
  router.delete("/:userId/doc/:docId", (req: Request, res: Response) => {
    try {
      const userId = String(req.params.userId);
      const docId = String(req.params.docId);
      const kb = loadKnowledge(userId);
      const before = kb.documents.length;
      kb.documents = kb.documents.filter((d) => d.id !== docId);
      if (kb.documents.length === before) {
        return res.status(404).json({ success: false, error: "文档不存在" });
      }
      saveKnowledge(userId, kb);
      // 文档变化后重建画像简报
      void engine.rebuildPersonaBrief(userId);
      return res.json({ success: true, docCount: kb.documents.length });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  return router;
}
