# ACM Helper Backend API（前端对接版）

Base URL（默认）：`http://localhost:8000`

本版包含你最新补充需求：

- 题目状态前端可手动更改
- 题目难度改为数字（对标 CF rating，由前端手填）
- ????????????????? + ???????

---

## 1. ProblemRecord 字段说明（核心）

```json
{
  "source": "codeforces",
  "id": "2187C",
  "title": "Jerry and Tom",
  "content": "...",
  "input_format": "...",
  "output_format": "...",
  "constraints": "...",
  "reflection": "这题关键是状态定义...",
  "tags": ["dp", "graphs"],
  "difficulty": 1800,
  "status": "solved",
  "my_ac_code": "...",
  "my_ac_language": "cpp",
  "needs_solution": false,
  "solution_status": "done",
  "solution_updated_at": "2026-02-06T12:20:00Z",
  "solved_at": "2026-02-06T12:15:00Z",
  "translated_title": "...",
  "translated_content": "...",
  "translated_input_format": "...",
  "translated_output_format": "...",
  "translated_constraints": "...",
  "translation_status": "done",
  "translation_error": null,
  "translation_updated_at": "2026-02-06T12:10:00Z",
  "created_at": "2026-02-06T12:00:00Z",
  "updated_at": "2026-02-06T12:30:00Z"
}
```

枚举：

- `status`: `solved | attempted | unsolved`
- `solution_status`: `none | queued | running | done | failed`
- `translation_status`: `none | running | done | failed`

---

## 2. 题库管理接口

### 2.0 单题详情（编辑页先读）

`GET /api/problems/{source}/{id}`

响应：完整 `ProblemRecord`。

---

### 2.0.1 单题整体编辑保存（推荐）

`PUT /api/problems/{source}/{id}`

请求体为“局部更新”（只传要改的字段）：

```json
{
  "title": "新标题",
  "content": "新题面",
  "input_format": "...",
  "output_format": "...",
  "constraints": "...",
  "reflection": "心得...",
  "tags": ["dp", "graphs"],
  "difficulty": 1800,
  "status": "attempted"
}
```

说明：

- 字段均可选，未传即不改
- `difficulty` 传 `null` 可清空
- `status` 联动规则与 `/status` 接口一致

---

### 2.1 题库详细列表

`GET /api/problems`

Query：

- `month=YYYY-MM`（可选）
- `source`（可选）
- `status=solved|attempted|unsolved`（可选）
- `keyword`（可选，匹配标题/内容/id/tags/心得等）

响应：

```json
{
  "month": "2026-02",
  "source": null,
  "status": null,
  "keyword": "dp",
  "total": 12,
  "items": ["...ProblemRecord..."]
}
```

---

### 2.2 手动修改题目状态（前端可直接调）

支持两种写法（语义一致）：

- `PATCH /api/problems/{source}/{id}/status`
- `PUT /api/problems/{source}/{id}/status`

请求：

```json
{
  "status": "attempted"
}
```

响应：更新后的 `ProblemRecord`。

状态联动规则：

- 设为 `solved`：若 `solved_at` 为空会自动写入当前 UTC 时间
- 设为非 `solved`：`solved_at` 清空

---

### 2.3 手动更新难度（数字）

`PUT /api/problems/{source}/{id}/difficulty`

请求：

```json
{
  "difficulty": 1700
}
```

可传 `null` 清空难度：

```json
{
  "difficulty": null
}
```

说明：

- `difficulty` 为非负整数（前端手填）
- 导入旧数据若是字符串（如 `"1800"`、`"*1900"`）后端会自动规范成整数

---

### 2.4 更新做题心得

`PUT /api/problems/{source}/{id}/reflection`

请求：

```json
{
  "reflection": "本题易错点是边界和初始化"
}
```

响应：更新后的 `ProblemRecord`。

---

### 2.5 删除题目

`DELETE /api/problems/{source}/{id}`

会删除：

- 题目主记录
- 题目 markdown 文件
- 题解 markdown 文件
- 关联任务记录

---

### 2.6 Codeforces 翻译

`POST /api/problems/{source}/{id}/translate`

请求（可空）：

```json
{
  "force": false
}
```

仅 `source=codeforces` 可用；翻译结果会写入题目 markdown 的 `## Chinese Translation`。

---

## 3. 统计与报告

### 3.1 日/周/月统计数据

`GET /api/stats/charts`

Query：

- `from_date=YYYY-MM-DD`（可选）
- `to_date=YYYY-MM-DD`（可选）

响应：

```json
{
  "from_date": "2025-02-06",
  "to_date": "2026-02-06",
  "daily": ["...StatsPoint..."],
  "weekly": ["...StatsPoint..."],
  "monthly": ["...StatsPoint..."]
}
```

`StatsPoint`：

```json
{
  "period_start": "2026-02-01",
  "period_end": "2026-02-01",
  "solved_count": 3,
  "attempted_count": 0,
  "unsolved_count": 0,
  "total_count": 3
}
```

---

### 3.2 聚合序列

`GET /api/stats/series?period=day|week|month`

---

### 3.3 周报接口

- `POST /api/reports/weekly/{week}/generate`
- `GET /api/reports/weekly/{week}/status`
- `GET /api/reports/weekly/{week}`

说明：
- `week` 格式：`YYYY-Www`
- 前端“周报生成”区域直接调用该组接口。

---

### 3.4 阶段性报告接口（起始周 + 截止周）

- `POST /api/reports/phased/{start_week}/{end_week}/generate`
- `GET /api/reports/phased/{start_week}/{end_week}/status`
- `GET /api/reports/phased/{start_week}/{end_week}`

说明：
- `start_week`、`end_week` 均为 `YYYY-Www`
- 生成前后端会校验范围内周报是否已存在，缺失时报 `400`
- 阶段性报告提示词复用周报模板，仅把 `{{problem_list_json}}` 改为注入“已生成周报集合 JSON”

---

### 3.5 任务列表（含题解与报告任务混排）

总览接口：`GET /api/dashboard/overview`

返回 `tasks` 中每条任务新增字段：

- `task_type`：`solution | weekly_report | phased_report`
- `report_type`：报告任务时为 `weekly | phased`
- `report_target`：报告目标（如 `2026-W08` 或 `2026-W07__2026-W08`）

前端展示建议：
- `solution` 使用 `problem_key`
- 报告任务使用 `report_target`

---

## 4. AI 配置与模板

### 4.1 ????

`POST /api/reports/weekly/{week}/generate`

- `week` ???`YYYY-Www`?? `2026-W06`

---

### 4.2 ????

`GET /api/reports/weekly/{week}/status`

???`none | generating | ready | failed`

---

### 4.3 ????

`GET /api/reports/weekly/{week}`

---

## 5. ???????????????

????? AI prompt ?????????????????

- ?????`title/content/input_format/output_format/constraints`
- ?????`status/solved_at/tags/difficulty`
- ?????`reflection/my_ac_code/my_ac_language`
- ?????`translated_*` ? `translation_status`
- ?????`solution_status` ? `solution_markdown`????????????
- ?????`created_at/updated_at`

?????????????????????????????????????

---

## 6. ????????

1. ??????????????? `/status`
2. ??????????????? `/difficulty`
3. ????????????? `/reflection`
4. ???? `/api/stats/charts` ???/?/??
5. ???????????????

