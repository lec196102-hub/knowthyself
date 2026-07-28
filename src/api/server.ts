/**
 * Triune Journal · API 服务入口
 *
 * 仅负责启动 Express、装配路由、监听端口。
 * 各功能模块已拆分到：
 *   - api/routes/journal.ts     日记接口
 *   - api/routes/temperament.ts 气质测试接口
 *   - api/routes/static.ts      静态页面 / 健康检查
 *   - core/triune.ts            三 Agent 引擎
 *   - storage/*                 持久化层
 */

import express from "express";
import { env } from "../config.js";
import { TriuneEngine } from "../core/triune.js";
import { createJournalRouter } from "./routes/journal.js";
import { createTemperamentRouter } from "./routes/temperament.js";
import { createKnowledgeRouter } from "./routes/knowledge.js";
import { createStaticRouter } from "./routes/static.js";
import { installSecurity } from "./security.js";

const app = express();
app.use(express.json({ limit: "1mb" }));

// 信息安全防火墙：仅本地访问 + 安全响应头（阻断局域网拖库 / 外源注入）
installSecurity(app, env.PORT);

const engine = new TriuneEngine();

// 装配路由（顺序：业务路由在前，静态/运维路由兜底）
app.use("/api/journal", createJournalRouter(engine));
app.use("/api/temperament", createTemperamentRouter(engine));
app.use("/api/knowledge", createKnowledgeRouter(engine));
app.use("/", createStaticRouter(engine));

app.listen(env.PORT, "127.0.0.1", () => {
  console.log(`\n🔮 Triune Journal 已启动`);
  console.log(`   端口: ${env.PORT}（仅绑定 127.0.0.1，禁止局域网访问）`);
  console.log(`   模型: ${env.LLM_MODEL}`);
  console.log(`   日记目录: ${process.cwd()}/data/journals（已 AES-256-GCM 加密落盘）`);
  console.log(`   气质画像目录: ${process.cwd()}/data/profiles（已加密落盘）`);
  console.log(`   API文档: http://localhost:${env.PORT}/api/health\n`);
});

export default app;
