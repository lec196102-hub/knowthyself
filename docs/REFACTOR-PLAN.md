# Triune Journal 重构方案（REFACTOR-PLAN）

> 状态：**待评审**。本文件仅描述方案，未改动任何源码。评审通过后按 Phase 0 → 2 顺序执行。  
> 目标：在不改变现有 API 契约（路径 / 响应结构 / 智能体行为）的前提下，提升可维护性与可修改性。

---

## 1. 背景与原则

当前项目已具备分层结构（`agents / core / config / storage / api / platforms`）、三层安全架构、平台适配器接口和 Zod 配置校验，底子良好。但存在**两个"上帝模块"和几处会让后续改动很疼的设计**，不利于"日后方便维护和修改"。

重构原则：

1. **行为不变（Behavior-preserving）**：API 路径、响应字段、三个智能体的输出风格一律不动。
2. **小步提交**：每个 Phase 一个 git commit，任一阶段可独立回滚（仓库已为 git 仓库）。
3. **先抽接口、再拆逻辑**：存储层先有统一接口，再让业务代码依赖接口而非具体 `fs` 实现。
4. **范围外不动**：智能体 prompt 文案、安全规则内容、Electron 桌宠外壳不在本次范围。

---

## 2. 现状痛点（ concretely ）

| #   | 痛点                                                                                 | 位置                                                                                                  | 影响                                                 |
| --- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| P-1 | 上帝模块：编排 / 辩论 / 响应构建 / 记忆装配 / 联网装配全在一处，且泄漏表现层                                       | `src/core/triune.ts`（391 行）                                                                         | 加角色或改流程必动此文件；"未配置 Key"返回里写了 `env.PORT`，领域层耦合展示层    |
| P-2 | 题库 / 计分 / 画像 / 风格调制混合                                                              | `src/core/temperament.ts`（383 行）                                                                    | 改题库牵连计分                                            |
| P-3 | 存储层无统一接口，4 处各自 `fs`                                                                | `core/memory.ts`、`storage/journal-store.ts`、`storage/knowledge-store.ts`、`storage/profile-store.ts` | 换数据库要改 4 个文件                                       |
| P-4 | src 根散落 `llm-registry.ts` / `llm-setup.ts` / `test-dry.ts` / `test-temperament.ts` | `src/` 根                                                                                            | 归类混乱                                               |
| P-5 | 根目录杂物：`server-3200.log`、`server-run.log`、`fix_server.py`、`outputs/`                | 仓库根                                                                                                 | 干扰查找与 git 历史                                       |
| P-6 | 无真实测试、无 logger、无 lint/CI                                                           | 全局                                                                                                  | 重构无回归保护；`console.*` 满地；`npm test` 是占位 `echo Error` |

---

## 3. 目标目录结构

```
src/
  shared/        # 跨领域基建：types.ts / logger.ts / errors.ts / env.ts
  llm/           # client.ts(原 llm-registry) / setup.ts(原 llm-setup)
  safety/        # rules.ts(原 config/safety-rules) / filter.ts(原 core/safety)
  storage/       # adapter.ts(统一接口 + FileJsonStore 基类) + index.ts
  memory/        # store.ts(原 core/memory) / extract.ts(记忆提取)
  knowledge/     # store.ts(原 storage/knowledge-store) / extract.ts(画像简报提取)
  temperament/   # questions.ts / scoring.ts / profile.ts   ← 拆自 core/temperament.ts
  agents/        # id.ts / ego.ts / superego.ts / humanize.ts（保持不动）
  engine/        # triune.ts(编排门面) / debate.ts / responder.ts   ← 拆自 core/triune.ts
  journal/       # service.ts(业务编排入口) / routes.ts(原 api/routes/journal)
  platform/      # adapter.ts(接口) + wechat/ telegram/(未来)
  web/           # server.ts(原 api/server) / static.ts(原 api/routes/static)
tests/           # vitest，按模块对齐（safety / temperament / engine / storage）
```

> 说明：`agents/` 与智能体业务行为保持不变，仅随依赖路径调整 import。`api/` 拆为 `web/`（传输层）与 `journal/`（业务层），让"路由"和"领域服务"分离。

---

## 4. 分阶段执行计划

### Phase 0 — 存储抽象（P-3，优先级最高，半天）

目标：4 个 store 共用一个基类，换数据库只新增一个实现类。

1. 新建 `src/storage/adapter.ts`：
   ```ts
   export interface JsonStore<T> {
     load(userId: string): T | null;
     save(userId: string, data: T): void;
     exists(userId: string): boolean;
   }
   export abstract class FileJsonStore<T> implements JsonStore<T> {
     constructor(private dir: string, private makeEmpty: () => T) {}
     // 统一的 resolve/mkdir/read/write/容错逻辑（从 4 个文件抽出来）
   }
   ```
2. 让 `JournalStore`、`KnowledgeStore`、`ProfileStore`、`MemoryStore` 改为继承 `FileJsonStore<T>`，删除各自重复的 `fs` 代码。
3. 业务侧（`engine`、`memory`、`knowledge`）继续 import 原类名，**接口签名不变**，仅实现内移。
4. **验收**：`npm run build` 通过；手动跑一次 `npm run dev` 提交一条日记，落盘与读取正常。

### Phase 1 — 拆上帝模块（P-1 / P-2，半天）

**1a. 拆 `core/triune.ts` → `engine/`**

- `engine/debate.ts`：搬入 `runDebate(...)`（本我↔超我循环）+ `sanitizeDebateLine(...)`。入参：diary / style / memoryContext / kb / dejaVu / searchContext / env 开关；返回 `{ debate, lastId, lastSuperego, idViolated }`。
- `engine/responder.ts`：搬入最终过滤 + `TriuneResponse` 组装逻辑（L3 过滤、`anyCensored` 计算、去重记录）。
- `engine/triune.ts`：`TriuneEngine` 类作为**编排门面**，只负责：加载气质/记忆/知识/联网 →（可选）`runDebate` → Ego 生成 → 异步 `updateMemory` → `assembleResponse`。
- **表现层解耦**：删除引擎里"未配置 Key"对 `env.PORT` 的引用。改为：无 client 时 `throw new ConfigError(...)`；由 `web/routes` 捕获并返回友好文案。

**1b. 拆 `core/temperament.ts` → `temperament/`**

- `questions.ts`：60 题库常量。
- `scoring.ts`：`calculateScores`。
- `profile.ts`：`determineProfile` + `getStyleModulation` + 类型导出。
- 保留原所有导出名，避免调用方改动。

**验收**：`npm run build`；`scripts/verify-*`、手动日记流程输出与重构前逐字一致（可截屏比对）。

### Phase 2 — 工程化与清理（P-4 / P-5 / P-6，1 天）

1. **归类**：`src/llm-registry.ts` → `src/llm/client.ts`；`src/llm-setup.ts` → `src/llm/setup.ts`；`src/test-dry.ts`、`src/test-temperament.ts` → `tests/` 或 `scripts/`，并更新 `package.json` 的 `test:dry` 等脚本路径。
2. **日志**：新增 `src/shared/logger.ts`（级别取自已定义的 `env.LOG_LEVEL`，当前未生效），全局替换 `console.log/error`。
3. **测试**：加 `vitest` 依赖，`npm test` → `vitest run`。优先覆盖：
   - `safety` 正则替换 / 关键词拦截
   - `temperament` 计分与画像判定边界
   - `engine/debate.sanitizeDebateLine` 各类"戏精"清洗
   - `storage` 读写往返（FileJsonStore）
4. **根目录清理**：`server-*.log`、`fix_server.py` 加入 `.gitignore`（已有 `*.log`，需补 `fix_server.py`）；日志统一到 `logs/`（可选）；`outputs/` 已在 `.gitignore`？当前 `.gitignore` 仅忽略 `node_modules/ dist/ .env data/ *.log`，**未忽略 `outputs/` 与 `fix_server.py`**，需补。
5. **Lint/Format（可选但推荐）**：加 `eslint` + `prettier`，以及一个最小 GitHub Actions（lint + test）。

---

## 5. 风险与回滚

- **import 路径改动面广**：拆分涉及约 10+ 个文件的 import 调整。对策：每 Phase 一个 commit；`npm run build`（tsc）即类型保障。
- **行为漂移**：Phase 1 务必做"重构前后输出逐字比对"。
- **回滚**：`git revert <phase-commit>` 即可；因每阶段独立，不影响已完成的其它阶段。

## 6. 明确不做的事

- 不改三个智能体的 prompt 文案与输出风格。
- 不改 API 路径与响应结构（`/api/journal` 等契约保持）。
- 不实现微信/Telegram 适配器（仅保留接口）。
- 不动 Electron 桌宠外壳。
- 不引入数据库（Phase 0 只是把"换库"变为"加一个实现类"，真换库是后续独立任务）。

## 7. 评审确认项

- [x] 目标目录结构是否接受（尤其 `api/` 拆为 `web/` + `journal/`）？
- [x] Phase 0/1/2 的范围与排序是否同意？
- [x] 是否要把 `outputs/` 也加入 `.gitignore`？
- [x] 是否要本次一并加 eslint/prettier/CI（Phase 2.5，可选）？

> 评审通过后，我将从 **Phase 0** 开始执行，每阶段完成后汇报并等待你确认再进下一阶段。

