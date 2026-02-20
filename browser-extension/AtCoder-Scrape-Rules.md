# AtCoder 抓取规则（浏览器插件）

本文记录 `https://atcoder.jp/contests/{contestId}/tasks/{taskId}` 这类页面的抓取规则，已实现于：

- `browser-extension/content/atcoder_scraper.js`
- `browser-extension/popup/popup.js`

## 1. URL 识别规则

插件仅在以下 URL 触发内容脚本：

- `https://atcoder.jp/contests/*/tasks/*`

Popup 层二次校验当前标签页 URL，命中后发送消息：

- `ACM_HELPER_ATCODER_SCRAPE`

## 2. 页面主结构规则

- 题面根节点：`#task-statement`
- 标题：`span.h2`（移除其中 `a` 按钮，如 Editorial/解説）
- 时空限制行：`#main-container p` 中匹配 `Time Limit|Memory Limit|実行時間制限|メモリ制限`
- 语言根容器：`#task-statement > span.lang`
  - 英文：`.lang-en`
  - 日文：`.lang-ja`
  - 抓取优先使用当前“可见”的语言节点（`display != none`）
- 分节标题统一按 `h3` 识别

## 3. 分节提取规则

按标题文本匹配（英日双语）提取字段：

- 题目描述：`Problem Statement` / `問題文`
- 约束：`Constraints` / `制約`
- 输入格式：`Input` / `入力`
- 输出格式：`Output` / `出力`

样例标题匹配：

- 输入样例：`Sample Input {n}` / `入力例 {n}`
- 输出样例：`Sample Output {n}` / `出力例 {n}`

样例正文优先级：

1. `pre.source-code-for-copy`（兼容旧题 prettify 双 pre）
2. `pre[id^="pre-sample"]`
3. 第一个 `pre`

## 4. 兼容布局规则

AtCoder 题页存在两类常见结构，脚本均兼容：

- 新布局（多语言）：`#task-statement > span.lang > span.lang-en/.lang-ja > .part > section > h3`
- 旧布局（无 `span.lang`）：`#task-statement > .part > h3`，输入输出常在 `.io-style > .part`

若标题在 `section > h3` 内，则直接用该 `section` 作为分节范围；
若标题为裸 `h3`，则读取其后续兄弟节点直到下一个标题。

## 5. 文本清洗规则

- 删除：`.katex-mathml`（保留 `katex-html` 可读数学文本）
- 删除：`.btn-copy`、`.div-btn-copy`（去掉标题里的 `Copy`）
- 删除：`.MathJax`、`.MathJax_Preview`
- 换行标准化：`\r\n` -> `\n`
- 空白标准化：`\u00a0` -> 空格
- 连续空行压缩为最多 1 个

## 6. 字段映射（导入后端）

写入 `POST /api/problems/import` 的结构：

- `source`: 固定 `atcoder`
- `id`: 路径中的 `{taskId}`（例：`abc365_e`）
- `title`: 题目标题（去掉标题区按钮文本）
- `content`: 题目描述 + 样例拼接文本
- `input_format`: 输入格式分节文本
- `output_format`: 输出格式分节文本
- `constraints`: 按行拼接
  - `time limit: ...`
  - `memory limit: ...`
  - `Score : ... points` / `配点 : ... 点`（若存在）
  - `Constraints/制約` 分节文本
- `tags`: `[]`
- `difficulty`: `unknown`
- `status`: `unsolved`
- `my_ac_code`: `""`
- `my_ac_language`: `""`

## 7. 已验证页面

- `https://atcoder.jp/contests/abc365/tasks/abc365_e?lang=en`
- `https://atcoder.jp/contests/abc365/tasks/abc365_e?lang=ja`
- `https://atcoder.jp/contests/abc001/tasks/abc001_1?lang=en`（旧布局兼容）

