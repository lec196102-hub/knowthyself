/**
 * 信息安全防火墙（网络层）
 *
 * 老己是常驻本机的伴侣应用，后端只该被本机访问。但 Express 默认
 * `app.listen(port)` 会绑 0.0.0.0（所有网卡），于是同一 WiFi 下任何人
 * `GET /api/journal/default` 就能静默拖走用户全部日记与心理画像（且全接口零鉴权）。
 *
 * 本模块在启动时装配两层防护：
 *  1) 仅允许本地 Host（localhost / 127.0.0.1 / ::1）—— 阻断 DNS 重绑定与"借 Host 头从局域网访问"。
 *  2) 注入安全响应头 —— 收紧 XSS / 点击劫持 / MIME 嗅探 / 外链加载。
 *
 * 注：本项目纯本地、页面大量使用内联 <script>/事件处理器，故 CSP 的 script/style 放行
 * 'unsafe-inline'，仅禁止外部源（default-src 'self'、connect-src 'self'），在"不破坏功能"
 * 与"防外源注入"之间取平衡。
 */

import type { Express, Request, Response, NextFunction } from "express";

export function installSecurity(app: Express, port: number): void {
  const allowedHosts = new Set<string>([
    `localhost:${port}`,
    `127.0.0.1:${port}`,
    `::1:${port}`,
  ]);

  // ① 本地 Host 白名单
  app.use((req: Request, res: Response, next: NextFunction) => {
    const host = req.headers.host || "";
    if (!allowedHosts.has(host)) {
      return res.status(403).send("Forbidden: local access only");
    }
    next();
  });

  // ② 安全响应头
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader(
      "Content-Security-Policy",
      [
        "default-src 'self'",
        "img-src 'self' data:",
        "style-src 'self' 'unsafe-inline'",
        "script-src 'self' 'unsafe-inline'",
        "connect-src 'self'",
        "frame-ancestors 'none'",
      ].join("; "),
    );
    next();
  });
}
