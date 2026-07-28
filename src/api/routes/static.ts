/**
 * 静态页面与运维路由
 *
 * GET /widget.html      桌宠悬浮窗页面
 * GET /api/journal      浏览器访问时返回简易测试页面
 * GET /api/health       健康检查
 */

import { Router, type Request, type Response } from "express";
import express from "express";
import { resolve } from "path";
import { env } from "../../config.js";
import { TriuneEngine } from "../../core/triune.js";

export function createStaticRouter(engine: TriuneEngine): Router {
  const router = Router();

  /** GET /widget.html - 桌宠悬浮窗页面 */
  router.get("/widget.html", (_req: Request, res: Response) => {
    return res.sendFile(resolve(process.cwd(), "public/widget.html"));
  });

  /** GET /api/journal - 浏览器访问时返回简易测试页面 */
  router.get("/api/journal", (_req: Request, res: Response) => {
    return res.sendFile(resolve(process.cwd(), "public/index.html"));
  });

  /** GET /api/health - 健康检查 */
  router.get("/api/health", (_req: Request, res: Response) => {
    return res.json({
      status: "ok",
      model: env.LLM_MODEL,
      timestamp: new Date().toISOString(),
      cachedProfiles: engine["styleCache"]?.size ?? 0,
    });
  });

  // 静态资源（public 目录）：onboarding.js、index.html、widget.html 等
  // 注意：必须在上面的显式路由之后挂载，显式路由优先。
  router.use(express.static(resolve(process.cwd(), "public")));

  return router;
}
