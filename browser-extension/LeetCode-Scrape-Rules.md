# LeetCode 抓取规则（浏览器插件）

本文记录 `https://leetcode.cn/problems/{slug}/description/` 这类页面的抓取规则，已实现于：

- `browser-extension/content/leetcode_scraper.js`
- `browser-extension/popup/popup.js`
- `browser-extension/manifest.json`
- `browser-extension/dashboard/dashboard.html`

## 1. URL 识别规则

插件在以下 URL 触发内容脚本：

- `https://leetcode.cn/problems/*`

Popup 层对当前标签页 URL 做二次校验，规则为：

- `https://leetcode.cn/problems/{slug}`
- `https://leetcode.cn/problems/{slug}/description/`
- 以上两种形式均兼容 query 参数

匹配后发送消息：`ACM_HELPER_LEETCODE_SCRAPE`。

## 2. 主体 DOM 规则

- 题面根节点（按优先级兜底）：
  - `[data-track-load="description_content"]`
  - `div[data-key="description-content"]`
  - `article`
  - `[class*="description"]`
- 标题（按优先级兜底）：
  - `div[data-cy="question-title"]`
  - `h1`
  - `[class*="title"]`
  - `document.title`
- 难度（按优先级兜底）：
  - `.text-difficulty-easy`
  - `.text-difficulty-medium`
  - `.text-difficulty-hard`
  - `[class*="difficulty"]`
  - `[data-difficulty]`
- 示例：扫描题面内全部 `pre`，从文本中匹配 `输入/Input` 与 `输出/Output` 段落
- 约束：从整段题面文本中截取 `提示/Constraints` 小节
- 标签：`a[href*="/tag/"]`

若题面根节点不存在，会返回失败提示：`leetcode description root not found`。

## 3. 文本清洗规则

- 复制节点后移除：`.katex-mathml`、`.MathJax`、`.MathJax_Preview`、`script`、`style`
- 换行标准化：`\r\n` -> `\n`
- 空白标准化：`\u00a0` -> 空格
- 行尾空白清理：`[ \t]+\n` -> `\n`
- 连续空行压缩为最多 1 个

## 4. 字段映射（导入后端）

写入 `POST /api/problems/import` 的结构：

- `source`: 固定 `leetcode`
- `id`: URL 中的 `{slug}`（例：`two-sum`）
- `title`: 去掉编号前缀后的标题（例：`1. 两数之和` -> `两数之和`）
- `content`: 题目描述 + 样例拼接文本
- `input_format`: `""`（LeetCode 题面通常不单独维护该区）
- `output_format`: `""`
- `constraints`: 从 `提示/Constraints` 小节抽取
- `tags`: 从题面标签链接抽取，去重
- `difficulty`: `easy | medium | hard | unknown`
- `status`: 默认 `unsolved`
- `my_ac_code`: `""`
- `my_ac_language`: `""`

## 5. Dashboard 筛选适配

在题目列表 `Source` 过滤器中新增：

- `leetcode`

对应界面项：`LeetCode`，可直接筛选该来源题目。

## 6. 已验证页面

- `https://leetcode.cn/problems/two-sum/description/`
