# ACM Helper 架构设计（V2：不含爬取功能）

## 1. 文档目标

本版本聚焦于：
- 插件“状态总览”页面；
- 题解任务管理（待生成、生成中、成功、失败）；
- 月报按需生成与查看。

**明确不做**：
- 题目网页爬取；
- content script 抓题与站点适配（Codeforces/AtCoder/NowCoder）。

---

## 2. 产品范围与原则

### 2.1 In Scope
1. 插件侧新增总览页（新标签页打开）。
2. 维护“待生成题解列表”：
   - `unsolved`、`attempted` 默认加入；
   - `solved` 默认不加入。
3. 后端异步生成题解任务，前端可见任务状态。
4. 月报按需生成与查看。
5. 前端轮询任务状态（非 SSE / WebSocket）。

### 2.2 Out of Scope
1. 自动爬取与解析题面。
2. 自动定时批量生成题解。
3. 系统级通知提醒。
4. 本地 `codex` CLI 调用（当前只保留 HTTP Provider）。

### 2.3 核心原则
1. **手动触发生成**：避免无效消耗，符合刷题复盘节奏。
2. **后端统一执行**：前端只发请求，后端负责状态、重试、日志、落盘。
3. **状态可观测**：任何生成过程都能在前端看到明确状态。

---

## 3. 用户流程（无爬取版）

1. 用户通过“手动录入/导入”把题目写入系统（含 `status`）。
2. 系统按规则自动计算是否进入待生成列表：
   - `unsolved` / `attempted` => `needs_solution=true`
   - `solved` => `needs_solution=false`
3. 用户打开插件总览页（新标签页）查看：
   - 本月统计；
   - 待生成题目；
   - 题解任务状态；
   - 月报状态。
4. 用户在总览页手动触发单题或批量生成题解。
5. 前端轮询任务状态直到完成。
6. 用户按需点击“生成月报”并查看月报内容。

---

## 4. 架构与模块

### 4.1 浏览器插件（Extension）

```text
browser-extension/
├── manifest.json
├── popup/
│   ├── popup.html
│   ├── popup.js
│   └── popup.css
├── dashboard/
│   ├── dashboard.html
│   ├── dashboard.js
│   └── dashboard.css
└── utils/
    └── api.js
```

说明：
- `popup`：轻量入口与跳转（打开 dashboard）。
- `dashboard`：核心总览页面（新标签页）。
- `utils/api.js`：统一封装后端 API。

### 4.2 后端（FastAPI）

```text
backend/src/
├── main.py
├── models/
│   ├── problem.py
│   ├── solution.py
│   └── task.py
├── routes/
│   ├── problems.py
│   ├── solutions.py
│   ├── dashboard.py
│   ├── reports.py
│   └── shared.py
├── services/
│   ├── ai_client.py
│   ├── solution_gen.py
│   ├── task_runner.py
│   └── report_gen.py
└── storage/
    └── file_manager.py
```

说明：
- `task_runner.py`：统一管理异步任务状态机。
- `dashboard.py`：聚合接口，减少前端拼装请求。

---

## 5. 数据模型设计

### 5.1 Problem
字段：
- `source`, `id`, `title`
- `status`: `solved|attempted|unsolved`
- `needs_solution`: `bool`
- `solution_status`: `none|queued|running|done|failed`
- `solution_updated_at`
- `created_at`, `updated_at`

规则：
- 导入/更新状态时，默认联动 `needs_solution`：
  - `unsolved`、`attempted` => `true`
  - `solved` => `false`

### 5.2 SolutionTask
字段：
- `task_id`
- `problem_key`（`${source}:${id}`）
- `status`: `queued|running|succeeded|failed`
- `error_message`
- `output_path`
- `created_at`, `started_at`, `finished_at`

### 5.3 月报元数据
- `month`
- `status`: `none|generating|ready|failed`
- `report_path`
- `updated_at`
- `error_message`

---

## 6. API 设计

### 6.1 题目管理
1. `POST /api/problems/import`
2. `PATCH /api/problems/{source}/{id}/status`

### 6.2 总览
3. `GET /api/dashboard/overview?month=YYYY-MM`

### 6.3 题解任务
4. `POST /api/solutions/tasks`
5. `GET /api/solutions/tasks/{task_id}`
6. `GET /api/solutions/pending?month=YYYY-MM`

### 6.4 月报
7. `POST /api/reports/{month}/generate`
8. `GET /api/reports/{month}/status`
9. `GET /api/reports/{month}`

---

## 7. 前端页面方案（Dashboard）

### 7.1 页面分区
1. 本月统计卡片。
2. 待生成题目列表（单题生成）。
3. 任务队列（状态、错误、输出路径）。
4. 月报区域（生成与查看）。
5. 手动导入题目（JSON Lines）。

### 7.2 刷新策略
- 轮询间隔 `3s`。
- 仅有 `queued/running` 任务时轮询。
- 无运行任务自动停止轮询。

---

## 8. 题解生成策略结论

1. 不在导入时自动生成。
2. 在总览页手动触发（单题/批量）。
3. `unsolved/attempted` 自动进入待生成池，`solved` 默认不进入。
4. 后端执行生成，前端只做任务触发和状态展示。

---

## 9. 任务状态机

- `queued -> running -> succeeded`
- `queued -> running -> failed`

失败处理：
- 记录错误；
- 支持重试（重新建任务）。

---

## 10. 验收标准

1. 导入 `unsolved/attempted` 后出现在待生成列表。
2. 导入 `solved` 后不出现在待生成列表。
3. 状态联动生效（`solved <-> attempted/unsolved`）。
4. 任务状态可见、可追踪。
5. 失败任务有错误信息。
6. 月报可按需生成并查看。

---

## 11. 配置项

- `AI_PROVIDER=mock|openai`
- `AI_API_BASE`
- `AI_API_KEY`
- `AI_MODEL`
- `TASK_MAX_CONCURRENCY=2`

---

## 12. 里程碑

1. 后端基础能力。
2. 插件总览页面。
3. 题解生成闭环。
4. 月报闭环。
5. 验收优化。

---

## 13. 假设与默认值

1. 单用户本地部署。
2. 数据按月归档（`YYYY-MM`）。
3. 月报按需生成，不做自动定时。
4. 当前仅支持 HTTP Provider，不包含本地 CLI provider。
