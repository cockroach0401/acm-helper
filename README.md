# ACM Helper (V3.4.0) 🚀

> 专为 ACMer 打造的智能做题助手：自动记录、AI 题解生成、数据可视化一站式解决方案。

## 📖 简介

**ACM Helper** 是一款集成了 **浏览器插件** 与 **本地后端服务** 的辅助工具。它旨在帮助算法竞赛选手（ACMer）高效管理做题进度，构建个人知识库。

通过本工具，你可以：
- 🤖 **AI 辅助解题**：一键调用 AI 模型（如 GPT-5.2, Claude 等）生成解题思路或代码框架。
- 📝 **自动归档**：将题目描述、样例及你的 AC 代码自动保存为 Markdown 文件，按整理，方便复习。
- 📊 **数据可视化**：提供类似 GitHub 的做题热力图（Heatmap），直观展示每日刷题成就，支持“贴瓷砖”哦。
- 🧩 **多平台支持**：完美支持 **Codeforces**、**洛谷 (Luogu)**、**牛客网 (Nowcoder)** 等主流 OJ 平台。

---

## ✨ 核心功能

### 1. 题目与代码归档
- **智能抓取**：自动提取网页中的题目描述、输入输出样例。
- **结构化存储**：
  - 默认路径：`backend/data/{YYYY-MM}/problems/{source}_{id}.md`
  - 例如：`backend/data/2023-10/problems/codeforces_1800A.md`

### 2. 交互式仪表盘 (Dashboard)
- **热力图**：统计每日做题数量，生成热力图，激励自己保持手感。
- **数据统计**：查看总做题数、近期活跃度等关键指标。

### 3. AI 深度集成
- 支持所有兼容 **OpenAI 格式** 的 API（如 OpenAI, DeepSeek, Claude等）。
- 自定义提示词模板（Prompt Template），打造专属的 AI 教练。

---

## 🛠️ 安装指南

### 第一步：启动后端服务
1. 下载并解压最新版本的 ACM Helper。
   -推荐下载[release](https://github.com/cockroach0401/acm-helper/releases)中的第一个和第三个(安装包),第二个为便携版,无法配置开机自启动。
2. 运行安装包,推荐在设置中开启**静默开机自启**，以便随时记录）。
   - *注：后端服务安装好静默启动后会最小化到系统托盘，右键托盘图标可进行相关操作。*

### 第二步：安装浏览器插件
1. 打开 Chrome 或 Edge 浏览器，访问扩展程序管理页面：
   - Chrome: `chrome://extensions`
   - Edge: `edge://extensions`
2. 开启右上角的 **"开发者模式" (Developer mode)**。
3. 点击 **"加载已解压的扩展程序" (Load unpacked)**。
4. 解压并选择选择本项目中的 `acm-helper-extension.zip` 文件夹。
5. 安装完成后，建议将 **ACM Helper** 插件固定到浏览器工具栏。

---

## ⚙️ 配置说明

首次使用请点击浏览器右上角的插件图标，进入设置页面完成以下配置：
### 1.存储目录设置
- 初次使用时建议自行更改目录，方便通过 Typora、Obsidian 等笔记软件直接管理
### 2. 基础设置
- **AI 接口地址 (API Base)**: 例如 `https://api.openai.com/` 或其他中转服务地址。
- **API Key**: 你的 API 密钥。
- **模型名称**: 例如 `gpt-5.2`, `gemini-3-pro` 等。
### 3.获取APIkey的方法
可以前往deepseek,豆包火山引擎,智普z.ai等购买,也可以[白嫖英伟达](NVIDIA-API.md)的API.

#### API 接口示例 (OpenAI Compatible)
| 配置项 | 示例值 | 说明 |
| :--- | :--- | :--- |
| **Provider** | `openai_compatible` | 接口类型 |
| **API Base** | `https://api.openai.com` | 接口基础地址 |
| **API Key** | `sk-xxxxxxxx` | 你的密钥 |
| **模型列表** | `gpt-5.2` | 可用模型名称 |

*配置完成后，点击“测试连接”按钮验证是否成功。*

---

## 📂 数据存储结构

你的做题记录将按以下目录结构保存在本地 `backend/data` 目录下(建议自行更改目录)，方便通过 Typora、Obsidian 等笔记软件直接管理：

```text
backend/
  └── data/
      ├── 2023-10/              # 按年月归档
      │   └── problems/
      │       ├── codeforces_1833A.md
      │       └── luogu_P1001.md
      └── 2023-11/
          └── ...
```

---
## 题解生成
- 控制面板「待生成题解」中显示当前**未完成**和**尝试过**的题目
- 在 **题目列表** 页选中题目，点击 **生成** 即可强制生成该题题解。
- 生成时会参考题目内容，以及你填写的「心得体会」,「AC 代码」和上传的题解参考图片。
- 如果你想让题解更符合个人习惯，可以在设置中调整题解生成的提示词模板风格。

---
## 🔄 支持平台

目前已适配以下平台（更多平台持续适配中）：
- ✅ **Codeforces** (包括 Gym, Contest)
- ✅ **洛谷 (Luogu)**
- ✅ **牛客网 (Nowcoder)** (包括练习、tracker、比赛)

---

## 🤝 贡献与反馈

如果你在使用过程中遇到问题，或有新的功能建议，欢迎提交 Issue 或 Pull Request。

祝各位rating++!!!

[关注我的牛客](https://ac.nowcoder.com/acm/contest/profile/360471005)
[关注我的CF](https://codeforces.com/profile/rockcoach)


