# ACM Helper (V2)

本仓库实现了 ACM Helper：

- 浏览器插件提供状态总览页面（新标签页）与 Codeforces / 牛客 ACM / 牛客 Practice 题目抓取导入。
- 后端提供题目导入、待生成题解管理、异步题解任务、统计图表与周报生成。
- 题解生成策略：`手动触发 + 总览页提醒`。
- 新增设置中心：支持前端切换 AI Provider、配置 API、自定义提示词模板。
- AI 设置支持“模型列表 + 模型选择”，可对接本地 OpenAI 兼容接口。
- 新增 AC 代码与做题心得管理：题目保存为 md，并支持状态/难度/心得手动维护。

## 目录

```text
backend/
browser-extension/
ACM Helper 架构设计.md
README.md
```

## 后端启动

```bash
cd backend
pip install -r requirements.txt
uvicorn src.main:app --reload
```

默认：`http://localhost:8000`

## 环境变量（可选默认值）

- `AI_PROVIDER=mock|openai|openai_compatible|anthropic|claude`
- `AI_API_BASE`
- `AI_API_KEY`
- `AI_MODEL=gpt-4o-mini`
- `AI_TEMPERATURE=0.2`
- `AI_TIMEOUT_SECONDS=120`
- `TASK_MAX_CONCURRENCY=2`

说明：
- 这些环境变量会在首次启动时作为默认配置写入 `backend/data/settings.json`。
- 后续以设置接口保存的配置为准。

## 插件加载

1. Chrome 打开 `chrome://extensions`
2. 启用开发者模式
3. 加载已解压扩展程序，选择 `browser-extension`
4. 打开插件 popup，设置后端地址；可在 Codeforces 题目页一键抓取导入，或打开“状态总览”
5. 在总览页的“AI 配置”和“提示词模板”区完成配置

## 核心 API

- `POST /api/problems/import`
- `GET /api/problems`
- `GET /api/problems/{source}/{id}`
- `PUT /api/problems/{source}/{id}`
- `PATCH /api/problems/{source}/{id}/status`
- `PUT /api/problems/{source}/{id}/status`
- `PUT /api/problems/{source}/{id}/ac-code`
- `PUT /api/problems/{source}/{id}/difficulty`
- `PUT /api/problems/{source}/{id}/reflection`
- `DELETE /api/problems/{source}/{id}`
- `POST /api/problems/{source}/{id}/translate`
- `GET /api/problems/{source}/{id}/markdown`
- `GET /api/dashboard/overview?month=YYYY-MM`
- `POST /api/solutions/tasks`
- `GET /api/solutions/tasks/{task_id}`
- `GET /api/solutions/pending?month=YYYY-MM`
- `GET /api/stats/charts`
- `GET /api/stats/series`
- `POST /api/reports/weekly/{week}/generate`
- `GET /api/reports/weekly/{week}/status`
- `GET /api/reports/weekly/{week}`
- `GET /api/settings`
- `PUT /api/settings/ai`
- `PUT /api/settings/prompts`
- `PUT /api/settings/ui`
- `POST /api/settings/ai/test`

## 接口文档

完整后端接口文档见：`backend/API.md`

前端对接增量文档（含状态手改 / 难度数字 / 统计与周报）见：`backend/API-FRONTEND.md`

## 本地模型示例

如你的本地接口是：`http://127.0.0.1:8317/v1/chat/completions`

- Provider: `openai_compatible`
- API Base: `http://127.0.0.1:8317/v1/chat/completions`
- API Key: `123456789`
- 模型列表: `gpt-5.2`
- 当前模型: `gpt-5.2`

保存后点击“测试连接”即可验证。

## 题目 Markdown 存储

- 题目文件路径：`backend/data/{YYYY-MM}/problems/{source}_{id}.md`
- 已 AC 代码会被追加到同一题目 md 文件末尾的 `## My AC Code` 段落。
- `my_ac_language` 受控选项为 `c/cpp/python/java`，默认由管理面板设置决定（缺省 `cpp`）。
- Codeforces 抓取规则文档：`browser-extension/Codeforces-Scrape-Rules.md`
- Nowcoder 抓取规则文档：`browser-extension/Nowcoder-Scrape-Rules.md`
