# Triune Journal 架构文档

## 概述

Triune Journal 是一个基于弗洛伊德精神分析理论的多 LLM Agent 情绪陪伴系统。用户提交日记后，三个独立配置的 LLM Agent 分别以"本我（Id）""自我（Ego）""超我（Superego）"的身份给予批注和人生建议。

## 架构图

```
用户 ──→ [平台适配层] ──→ [安全过滤层 L0]
                              │
                              ▼
                        ┌─────────────┐
                        │  Triune 引擎 │
                        ├─────────────┤
                        │ ① 本我 Agent │ ──→ [安全检查 L1]
                        │      │        │
                        │ ② 自我 Agent │ ──→ [内群纠正 L2]
                        │      │        │
                        │ ③ 超我 Agent │ ──→ [安全检查 L1]
                        └─────────────┘
                              │
                              ▼
                        [最终过滤 L3]
                              │
                              ▼
                         用户 ←── [平台适配层]
```

## 三层安全架构

| 层级 | 名称 | 机制 | 位置 |
|------|------|------|------|
| L0 | 输入过滤 | validateUserInput() 检测违规关键词 | safety.ts |
| L1 | 角色级 | 每个 Agent 的 system prompt 嵌入统一伦理准则 | id.ts/ego.ts/superego.ts |
| L2 | 群聊级 | detectIdViolation() 检测本我输出，触发自我/超我纠正 | triune.ts |
| L3 | 输出过滤 | finalSafetyFilter() 最终汇总前对违规内容打码替换 | safety.ts |

## 目录结构

```
triune-journal/
├── src/
│   ├── agents/
│   │   ├── id.ts          # 本我 Agent - system prompt + 消息构建 + 审计条款
│   │   ├── ego.ts         # 自我 Agent
│   │   └── superego.ts    # 超我 Agent
│   ├── core/
│   │   ├── triune.ts      # Triune 引擎 - 编排三个 Agent
│   │   ├── safety.ts      # 安全过滤 - 三层防护实现
│   │   ├── llm.ts         # LLM 客户端工厂 + 带重试的对话调用
│   │   └── temperament.ts # 气质测试 - 题库/计分/判定/风格调制（每日10题渐进式）
│   ├── config/
│   │   ├── index.ts       # 运行环境配置 (Zod 校验) + 模型配置读取
│   │   └── safety-rules.ts# 安全规则（伦理条款 / 正则 / 替换语）
│   ├── storage/
│   │   ├── journal-store.ts   # 日记文件持久化（落盘 / 读取）
│   │   └── profile-store.ts   # 气质画像文件持久化
│   ├── api/
│   │   ├── server.ts      # Express 入口 - 装配路由、监听端口
│   │   └── routes/
│   │       ├── journal.ts     # 日记接口 (POST / GET)
│   │       ├── temperament.ts # 气质测试接口 (today / answer / test / profile / questions)
│   │       └── static.ts      # 静态页面 + 健康检查
│   ├── platforms/
│   │   └── adapter.ts     # IM 平台适配器接口
│   ├── llm-registry.ts    # LLM 提供商注册表
│   ├── llm-setup.ts       # 交互式配置向导
│   ├── test-dry.ts        # 无 API 干运行测试
│   └── test-temperament.ts# CLI 气质测试工具
├── docs/
│   └── architecture.md    # 本文档
├── electron/              # 桌宠悬浮窗 (main.cjs / preload.cjs)
├── public/                # 前端页面 (index.html / widget.html)
├── outputs/               # 用户交付物
├── .env.example           # 环境变量模板
├── tsconfig.json
└── package.json
```

## 模块职责划分

| 模块 | 职责 | 依赖 |
|------|------|------|
| `agents/*` | 三个角色的 system prompt、消息构建、审计条款 | `core/safety`(伦理) `core/temperament`(风格类型) |
| `core/triune` | 审计策略编排：Ego→Id→Superego 流程、安全标记汇总 | `agents/*` `core/safety` `core/temperament` `core/llm` |
| `core/llm` | OpenAI 兼容客户端创建 + 带重试的调用 | `openai` |
| `core/safety` | 三层安全过滤实现 | `config/safety-rules` |
| `core/temperament` | 60 题库、计分、气质判定、风格调制 | — |
| `config/index` | 环境变量解析、模型配置读取 | `dotenv` `zod` |
| `config/safety-rules` | 安全规则文本与正则 | — |
| `storage/*` | 日记 / 气质画像的落盘与读取 | `config` |
| `api/routes/*` | 各业务路由，组装引擎与存储层 | `core/*` `storage/*` |
| `api/server` | 启动 Express、装配路由、监听端口 | `api/routes/*` `core/triune` |

## 核心数据类型

### TriuneResponse
```typescript
interface TriuneResponse {
  id:    { text: string; censored: boolean };
  ego:   { text: string; censored: boolean };
  superego: { text: string; censored: boolean };
  safetyFlags: {
    inputFlagged: boolean;
    idViolated: boolean;
    idViolationType?: string;
    anyCensored: boolean;
  };
}
```

## API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/journal` | 提交日记，返回三角色回应 |
| GET  | `/api/journal/:userId` | 获取用户历史记录 |
| GET  | `/api/health` | 健康检查 |

### POST /api/journal 请求体
```json
{
  "content": "今天工作特别累，被领导当众批评了方案...",
  "userId": "user_001"
}
```

### POST /api/journal 响应体
```json
{
  "success": true,
  "data": {
    "id": { "text": "我好生气！...", "censored": false },
    "ego": { "text": "我能感觉到你的委屈...", "censored": false },
    "superego": { "text": "从另一个角度看...", "censored": false },
    "safety": {
      "inputFlagged": false,
      "idViolated": false,
      "anyCensored": false
    }
  },
  "savedTo": "./data/journals/user_001-2026-07-27T12-00-00-000Z.json"
}
```

## 部署

### 本地开发
```bash
cp .env.example .env  # 编辑填入 API Key
npm install
npm run dev
```

### 云服务器部署
1. 上传代码到服务器
2. 配置 `.env` 文件
3. `npm install && npm run build && npm start`
4. 使用 PM2 或 systemd 守护进程
5. 配置 Nginx 反向代理

### 接入微信
- 微信个人号：通过微信机器人框架（wechaty）实现 IPlatformAdapter
- 微信公众号：配置 Webhook 回调
- 微信企业号：API 对接

## 扩展点

1. **新 LLM 提供商**：修改 config.ts 中的 LLM_BASE_URL 即可切换任何 OpenAI 兼容接口
2. **新 IM 平台**：实现 IPlatformAdapter 接口
3. **新角色**：在 agents/ 下新增 Agent 模块，在 triune.ts 中编排
4. **日记分析**：可接入情感分析、主题聚类等后处理

## 当前状态

- [x] 核心三 Agent 引擎
- [x] 三层安全架构
- [x] REST API（按功能拆分为 journal / temperament / static 三组路由）
- [x] 平台适配器接口
- [x] 功能模块化拆分（引擎 / LLM 客户端 / 存储层 / 配置 / 路由 相互解耦）
- [ ] 微信平台适配器实现
- [ ] Telegram 平台适配器实现
- [ ] 前端 Web UI（当前为简易测试页 + Electron 桌宠）
- [ ] 数据库持久化（当前用文件存储）
