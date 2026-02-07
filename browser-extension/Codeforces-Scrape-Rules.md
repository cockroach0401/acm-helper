# Codeforces 抓取规则（浏览器插件）

本文记录 `https://codeforces.com/contest/{contestId}/problem/{index}` 这类页面的稳定抓取规则，已实现于：

- `browser-extension/content/codeforces_scraper.js`
- `browser-extension/popup/popup.js`

## 1. URL 识别规则

插件仅在以下 URL 触发内容脚本：

- `https://codeforces.com/contest/*/problem/*`
- `https://codeforces.com/gym/*/problem/*`
- `https://codeforces.com/group/*/contest/*/problem/*`
- `https://codeforces.com/group/*/gym/*/problem/*`

Popup 层二次校验当前标签页 URL，避免误抓取。

## 2. 主体 DOM 规则

- 题面根节点：`.problem-statement`
- 标题：`.problem-statement .title`
- 时间限制：`.problem-statement .header .time-limit`
- 内存限制：`.problem-statement .header .memory-limit`
- 输入说明：`.problem-statement .input-specification`
- 输出说明：`.problem-statement .output-specification`
- 样例输入：`.problem-statement .sample-test .input pre`（兼容 `.sample-tests`）
- 样例输出：`.problem-statement .sample-test .output pre`（兼容 `.sample-tests`）
- 注释（若存在）：`.problem-statement .note`

## 3. 标签与难度规则

- 侧栏容器：查找包含 `Problem tags` 文本的 `.roundbox.sidebox`
- 标签项：`span.tag-box`
- `*1300` 这种项解析为 `difficulty=1300`
- `No tag edit access` 丢弃
- 其余 `span.tag-box` 文本进入 `tags[]`

## 4. 文本清洗规则

- 移除 `.MathJax` 和 `.MathJax_Preview` 节点，减少重复符号（如 `a` 与 `𝑎` 并存）
- 换行标准化：`\r\n` -> `\n`
- 空白标准化：`\u00a0` -> 普通空格
- 连续空行压缩为最多 1 个空行

## 5. 字段映射（导入后端）

写入 `POST /api/problems/import` 的单题结构：

- `source`: 固定 `codeforces`
- `id`: `{contestId}{index}`（例：`2187A`）
- `title`: 去掉前缀编号后的标题（例：`A. Restricted Sorting` -> `Restricted Sorting`）
- `content`: 题目描述 + Note + 样例拼接文本
- `input_format`: 输入说明
- `output_format`: 输出说明
- `constraints`: `time limit` + `memory limit` + `rating`（按行拼接）
- `tags`: 抓到的标签列表
- `difficulty`: rating 数字；抓不到则 `unknown`
- `status`: 默认 `unsolved`
- `my_ac_code`: 空字符串
- `my_ac_language`: 空字符串

## 6. Popup 联动流程

1. 点击“抓取当前 Codeforces 题目”
2. Popup 给当前标签页发送消息 `ACM_HELPER_CF_SCRAPE`
3. 内容脚本返回标准化题目对象
4. Popup 调用后端 `POST /api/problems/import`
5. 成功后提示 `source:id`

## 7. 已验证页面

- `https://codeforces.com/contest/2187/problem/A`

