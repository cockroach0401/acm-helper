# Nowcoder 抓取规则（浏览器插件）

本文记录牛客两类页面抓取规则：

- ACM 题库/比赛题：`https://ac.nowcoder.com/acm/problem/{id}` 与 `https://ac.nowcoder.com/acm/contest/{contestId}/{index}`
- 题霸 Practice：`https://www.nowcoder.com/practice/{id}`

已实现于：

- `browser-extension/content/nowcoder_scraper.js`
- `browser-extension/content/nowcoder_practice_scraper.js`
- `browser-extension/popup/popup.js`

## 1. URL 识别规则

- ACM 题库：`https://ac.nowcoder.com/acm/problem/*` -> `ACM_HELPER_NC_ACM_SCRAPE`
- ACM 比赛：`https://ac.nowcoder.com/acm/contest/*/*` -> `ACM_HELPER_NC_ACM_SCRAPE`
- 题霸 Practice：`https://www.nowcoder.com/practice/*` -> `ACM_HELPER_NC_PRACTICE_SCRAPE`

## 2. ACM 页面 DOM 规则（ac.nowcoder）

- 标题：`.question-title`（兜底 `.terminal-topic-title` / `document.title`）
- 题面根区域：`.terminal-topic .subject-describe`
- 题目描述：`.subject-describe .subject-question`
- 输入描述标题：`H2` 文本匹配 `输入描述`
- 输入描述正文：输入标题后的紧邻节点（通常为 `pre`）
- 输出描述标题：`H2` 文本匹配 `输出描述`
- 输出描述正文：输出标题后的紧邻节点（通常为 `pre`）
- 样例块：`.subject-describe .question-oi`
- 样例输入：优先隐藏 `textarea[data-clipboard-text-id^="input"]`，兜底 `pre`
- 样例输出：优先隐藏 `textarea[data-clipboard-text-id^="output"]`，兜底 `pre`
- 元信息：`.terminal-topic .question-intr .subject-item-wrap`

补充：若 `subject-describe` 不存在，会返回失败提示（常见于付费比赛未购买/未登录）。

## 3. Practice 页面 DOM 规则（www.nowcoder.com）

- 根区域：`.ta-question.question-module`
- 标题：`.question-title .hide-txt`（兜底 `.question-title`）
- 描述：`.content-wrapper .describe-table`
- 输入描述标题：`.section-sub-title` 匹配 `输入描述`
- 输入描述正文：输入标题后的紧邻节点
- 输出描述标题：`.section-sub-title` 匹配 `输出描述`
- 输出描述正文：输出标题后的紧邻节点
- 样例区：`.section-box` 中标题匹配 `示例`
- 样例项：`.question-sample .sample-item`（按标签“输入/输出”取对应 `pre`）
- 元信息：`.content-wrapper .flex-row.flex-none .flex-auto.fs-xs`（时间/空间/通过率/难度）

## 4. 文本清洗规则

- 复制节点后移除 `.katex-mathml`，保留可读数学文本（来自 `katex-html`）
- 换行标准化：`\r\n` -> `\n`
- 空白标准化：`\u00a0` -> 空格
- 连续空行压缩为最多 1 个

## 5. 字段映射（导入后端）

写入 `POST /api/problems/import` 的结构：

- ACM 页：
  - `source`: `nowcoder`
  - `id`: `NC{数字id}`（例：`NC312331`）；比赛页使用 `NC{contestId}_{index}`
- Practice 页：
  - `source`: `nowcoder_practice`
  - `id`: `P{practiceId}`（例：`P78660925b1cd49b6b2e43cb375ed7945`）
- `title`: 页面标题
- `content`: 题目描述 + 样例拼接文本
- `input_format`: 输入描述
- `output_format`: 输出描述
- `constraints`: 从元信息抽取并按行拼接
  - `时间限制：...`
  - `空间限制：...`
  - `64bit IO Format: ...`
- `tags`: `[]`（当前页面未发现稳定标签区）
- `difficulty`: `unknown`
- `status`: `unsolved`
- `my_ac_code`: `""`
- `my_ac_language`: `""`

## 6. 已验证页面

- `https://ac.nowcoder.com/acm/problem/312331`
- `https://ac.nowcoder.com/acm/contest/120561/A`（可识别为 ACM 路由；当前页若受权限限制会返回抓取失败提示）
- `https://www.nowcoder.com/practice/78660925b1cd49b6b2e43cb375ed7945?tpId=385&tqId=10868166&channelPut=tracker1`
