# ACM Helper Backend API 文档（V2）

Base URL（默认）：`http://localhost:8000`

## 约定

- 请求与响应均为 JSON（`Content-Type: application/json`）。
- 本项目当前不含鉴权。
- 错误响应由 FastAPI 标准返回：
  - `400` 参数错误/业务校验失败
  - `404` 资源不存在
  - `500` 服务内部错误

---

## 1) 健康检查

### `GET /health`

响应：

```json
{
  "ok": true
}
```

---

## 2) 题目管理

### `POST /api/problems/import`

用途：批量导入/更新题目。

请求：

```json
{
  "problems": [
    {
      "source": "manual",
      "id": "A1",
      "title": "Two Sum",
      "content": "...",
      "input_format": "...",
      "output_format": "...",
      "constraints": "...",
      "tags": ["array"],
      "difficulty": "easy",
      "status": "attempted",
      "my_ac_code": "",
      "my_ac_language": ""
    }
  ]
}
```

说明：
- `status` 可选值：`solved | attempted | unsolved`
- 导入时联动：
  - `attempted/unsolved` => `needs_solution=true`
  - `solved` => `needs_solution=false`

响应（示例）：

```json
{
  "imported": 1,
  "updated": 0,
  "records": [
    {
      "source": "manual",
      "id": "A1",
      "title": "Two Sum",
      "content": "...",
      "input_format": "...",
      "output_format": "...",
      "constraints": "...",
      "tags": ["array"],
      "difficulty": "easy",
      "status": "attempted",
      "my_ac_code": "",
      "my_ac_language": "",
      "needs_solution": true,
      "solution_status": "none",
      "solution_updated_at": null,
      "created_at": "2026-02-06T10:00:00Z",
      "updated_at": "2026-02-06T10:00:00Z"
    }
  ]
}
```

---

### `PATCH /api/problems/{source}/{id}/status`

用途：更新题目学习状态。

请求：

```json
{
  "status": "solved"
}
```

响应：返回更新后的题目对象（同上 `records` 元素结构）。

---

### `PUT /api/problems/{source}/{id}/ac-code`

用途：提交（或更新）题目的已 AC 代码。

请求：

```json
{
  "code": "#include <bits/stdc++.h>\n...",
  "language": "cpp",
  "mark_solved": true
}
```

说明：
- `mark_solved=true` 时会将题目状态标记为 `solved`，并移出待生成题解列表。
- 代码会写入题目对应 markdown 文件末尾 `## My AC Code` 段落。
- `language` 受控选项：`c | cpp | python | java`。
- 若为空或不合法，后端会使用设置中的默认语言（默认 `cpp`）。

响应：返回更新后的题目对象。

---

### `GET /api/problems/{source}/{id}/markdown`

用途：获取题目 markdown 内容。

响应：

```json
{
  "source": "manual",
  "id": "A1",
  "content": "# Problem\n...\n## My AC Code\n```cpp\n...\n```"
}
```

---

## 3) 总览

### `GET /api/dashboard/overview?month=YYYY-MM`

用途：前端总览页面聚合数据。

参数：
- `month` 可选，格式 `YYYY-MM`，不传默认当前 UTC 月份。

响应（结构）：

```json
{
  "month": "2026-02",
  "stats": {
    "total": 12,
    "solved": 5,
    "attempted": 4,
    "unsolved": 3,
    "pending_solution": 7,
    "solution_done": 3,
    "solution_failed": 1,
    "running_tasks": 2,
    "failed_tasks": 1
  },
  "pending": ["...ProblemRecord..."],
  "tasks": ["...TaskRecord..."],
  "report": {
    "month": "2026-02",
    "status": "ready",
    "updated_at": "2026-02-06T10:30:00Z",
    "report_path": "...",
    "error_message": null
  },
  "ai": {
    "provider": "openai_compatible",
    "model": "gpt-4o-mini"
  }
}
```

---

## 4) 题解任务

### `POST /api/solutions/tasks`

用途：创建题解生成任务。

请求：

```json
{
  "problem_keys": ["manual:A1", "manual:B2"]
}
```

说明：
- 当 `problem_keys` 为空数组时，后端会自动选择当月待生成题目。

响应：

```json
{
  "task_ids": ["d2d6...", "f8a1..."]
}
```

---

### `GET /api/solutions/tasks/{task_id}`

用途：查询单任务状态。

响应：

```json
{
  "task_id": "d2d6...",
  "problem_key": "manual:A1",
  "status": "running",
  "error_message": null,
  "output_path": null,
  "created_at": "2026-02-06T10:20:00Z",
  "started_at": "2026-02-06T10:20:01Z",
  "finished_at": null
}
```

`status` 枚举：`queued | running | succeeded | failed`

---

### `GET /api/solutions/pending?month=YYYY-MM`

用途：获取待生成题目列表。

响应：

```json
{
  "month": "2026-02",
  "total": 5,
  "items": ["...ProblemRecord..."]
}
```

---

## 5) 月报

### `POST /api/reports/{month}/generate`

用途：按需生成月报。

响应：

```json
{
  "month": "2026-02",
  "status": "ready",
  "report_path": ".../backend/data/2026-02/report.md"
}
```

---

### `GET /api/reports/{month}/status`

响应：

```json
{
  "month": "2026-02",
  "status": "ready",
  "updated_at": "2026-02-06T10:30:00Z",
  "report_path": "...",
  "error_message": null
}
```

`status` 枚举：`none | generating | ready | failed`

---

### `GET /api/reports/{month}`

响应：

```json
{
  "month": "2026-02",
  "content": "# 月报..."
}
```

---

## 6) 设置中心（新增）

### `GET /api/settings`

用途：获取 AI 配置和提示词模板。

响应：

```json
{
  "ai": {
    "provider": "mock",
    "api_base": "",
    "api_key": "",
    "model": "gpt-4o-mini",
    "temperature": 0.2,
    "timeout_seconds": 120
  },
  "prompts": {
    "solution_template": "...",
    "report_template": "..."
  }
}
```

---

### `PUT /api/settings/ai`

用途：保存 AI 配置。

请求：

```json
{
  "provider": "openai_compatible",
  "api_base": "https://api.openai.com",
  "api_key": "sk-xxx",
  "model": "gpt-4o-mini",
  "model_options": ["gpt-4o-mini", "gpt-5.2"],
  "temperature": 0.2,
  "timeout_seconds": 120
}
```

`provider` 枚举：
- `mock`
- `openai_compatible`
- `anthropic`

`api_base` 兼容以下写法：
- 基础地址：`http://127.0.0.1:8317`
- `v1` 根路径：`http://127.0.0.1:8317/v1`
- 完整 chat completions 路径：`http://127.0.0.1:8317/v1/chat/completions`

`model_options` 说明：
- 用于前端模型下拉列表。
- `model` 必须在 `model_options` 中（后端会自动纠正并补全）。

响应：返回完整 `settings`（同 `GET /api/settings` 结构）。

---

### `PUT /api/settings/prompts`

用途：保存提示词模板。

请求：

```json
{
  "solution_template": "...{{title}}...",
  "report_template": "...{{month}}..."
}
```

响应：返回完整 `settings`。

说明：
- 两个模板都不能为空。
- 若模板含未解析占位符，实际生成时会返回错误。

---

### `POST /api/settings/ai/test`

用途：测试当前 AI 配置连通性。

响应：

```json
{
  "ok": true,
  "preview": "ok"
}
```

失败时返回 `400` 与错误详情。

本地 OpenAI 兼容服务示例：

```json
{
  "provider": "openai_compatible",
  "api_base": "http://127.0.0.1:8317/v1/chat/completions",
  "api_key": "123456789",
  "model": "gpt-5.2",
  "model_options": ["gpt-5.2"],
  "temperature": 0.2,
  "timeout_seconds": 120
}
```

---

### `PUT /api/settings/ui`

用途：保存管理面板 UI 默认值。

请求：

```json
{
  "default_ac_language": "cpp"
}
```

`default_ac_language` 枚举：`c | cpp | python | java`

响应：返回完整 `settings`。

---

## 7) 模板占位符说明

### 题解模板支持

- `{{source}}`
- `{{id}}`
- `{{title}}`
- `{{status}}`
- `{{content}}`
- `{{input_format}}`
- `{{output_format}}`
- `{{constraints}}`

### 月报模板支持

- `{{month}}`
- `{{stats_json}}`
- `{{problem_list_json}}`

---

## 8) 前端联调建议

- 先调用 `GET /api/settings` 初始化设置页。
- 提交配置后调用 `POST /api/settings/ai/test` 快速验证。
- 生成题解前，建议先保存提示词模板。
- 总览页保持 3 秒轮询，仅在任务 `queued/running` 时开启。

---

## 9) 题目 Markdown 存储约定（新增）

- 路径：`backend/data/{YYYY-MM}/problems/{source}_{id}.md`
- 每次导入题目、更新状态、提交 AC 代码时都会刷新该文件。
- 文件末尾固定保留：
  - `## My AC Code`（用户 AC 代码段）
  - 抓取阶段 TODO 注释（后续接入抓取弹窗提交）
