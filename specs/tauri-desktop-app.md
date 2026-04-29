# ACM Helper Tauri 桌面应用 Spec

## 1. 概述

在现有「浏览器插件 + 独立后端」架构基础上，新增 Tauri 桌面层，形成三层架构：
- **浏览器插件**（保留）：负责 OJ 平台题目抓取、题目列表展示、状态管理
- **FastAPI 后端**（保留）：数据存储、AI 题解生成、API 服务
- **Tauri 桌面应用**（新增）：Sidecar 模式启动后端、桌面看板娘、AI 聊天、Agent 工具调用

核心改进：
- **Sidecar 模式**：Tauri 启动时自动拉起 FastAPI 后端，退出时自动清理
- **桌面看板娘**：常驻桌面的二次元角色，提供快捷入口和状态提示
- **聊天功能**：内置 AI 聊天窗口，支持模板总结、日常问答、Agent 工具调用

## 2. 架构设计

```
┌─────────────────────────────────────────────────────────────────────┐
│                           用户层                                     │
│                                                                     │
│  ┌─────────────────────┐    ┌─────────────────────────────────────┐ │
│  │   浏览器插件 (保留)    │    │        Tauri 桌面应用 (新增)         │ │
│  │  ┌───────────────┐  │    │  ┌──────────────┐  ┌──────────────┐ │ │
│  │  │  Content Script│  │    │  │   看板娘窗口   │  │   聊天窗口    │ │ │
│  │  │  (OJ 抓取)     │  │    │  │  (WebView)    │  │  (WebView)   │ │ │
│  │  └───────────────┘  │    │  └──────────────┘  └──────────────┘ │ │
│  │  ┌───────────────┐  │    │  ┌──────────────────────────────┐   │ │
│  │  │  Dashboard     │  │    │  │         设置窗口              │   │ │
│  │  │  (题目列表)     │  │    │  │         (WebView)            │   │ │
│  │  └───────────────┘  │    │  └──────────────────────────────┘   │ │
│  └──────────┬──────────┘    │  ┌──────────────────────────────┐   │ │
│             │               │  │       Tauri Rust Core         │   │ │
│             │               │  │  - 窗口管理 (多窗口协调)        │   │ │
│             │               │  │  - Sidecar 进程管理            │   │ │
│             │               │  │  - 系统托盘集成                │   │ │
│             │               │  │  - IPC 命令 (前端 ↔ Rust)      │   │ │
│             │               │  └──────────────┬───────────────┘   │ │
│             │               │                 │                   │ │
│             │               └─────────────────┼───────────────────┘ │
│             │                                 │                     │
└─────────────┼─────────────────────────────────┼─────────────────────┘
              │ HTTP                            │ HTTP
              ▼                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      FastAPI Backend (Sidecar)                       │
│                         localhost:8000                               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌───────────┐  │
│  │   Problems   │  │  Solutions  │  │   Reports   │  │   Chat    │  │
│  │   Router     │  │   Router    │  │   Router    │  │   Router  │  │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────┬─────┘  │
│                                                           │         │
│  ┌─────────────────────────────────────────────────────────┘         │
│  │                                                                 │
│  ▼                                                                 │
│  ┌───────────────────────┐                                         │
│  │   LangGraph Agent      │                                         │
│  │   - 工具调用            │                                         │
│  │   - 记忆系统            │                                         │
│  │   - 多步推理            │                                         │
│  └───────────────────────┘                                         │
└─────────────────────────────────────────────────────────────────────┘
```

## 3. 组件拆分

### 3.0 浏览器插件（保留，核心功能）

**职责**：
- OJ 平台题目抓取（Codeforces、AtCoder、洛谷、牛客）
- 题目列表展示与状态管理
- 题解生成触发
- 统计面板展示

**抓取流程**：
```
用户在 OJ 页面点击插件
    ↓
Content Script 检测站点
    ↓
抓取题目信息（标题、内容、样例）
    ↓
POST /api/problems/import
    ↓
后端存储 + 返回结果
    ↓
插件显示成功/失败提示
```

**支持的平台**：
- ✅ Codeforces (包括 Gym, Contest)
- ✅ AtCoder (Contest Tasks)
- ✅ 洛谷 (Luogu)
- ✅ 牛客网 (Nowcoder) (包括练习、tracker、比赛)

**关键文件**：
```
browser-extension/
├── manifest.json           # 插件配置
├── content/               # 各站点抓取脚本
│   ├── codeforces.js
│   ├── atcoder.js
│   ├── luogu.js
│   └── nowcoder.js
├── background/            # 后台脚本
├── popup/                 # 弹出窗口
├── dashboard/             # 统计面板
└── utils/                 # 工具函数
    └── api.js             # 后端 API 封装
```

**与 Tauri 应用的关系**：
- 浏览器插件负责「抓取」，Tauri 应用负责「交互」
- 共享同一个 FastAPI 后端
- 抓取的数据在 Tauri 聊天窗口中可通过 Agent 查询

### 3.1 Tauri Rust Core (`src-tauri/`)

**职责**：
- 应用生命周期管理
- Sidecar 进程管理（启动 FastAPI）
- 系统托盘菜单
- 多窗口协调（看板娘、聊天、设置）
- IPC 命令桥接

**关键模块**：
```
src-tauri/
├── Cargo.toml
├── tauri.conf.json          # 应用配置（窗口、权限、sidecar）
├── src/
│   ├── main.rs              # 入口，注册命令
│   ├── lib.rs               # 模块导出
│   ├── sidecar.rs           # FastAPI 进程管理
│   ├── tray.rs              # 系统托盘
│   ├── commands.rs          # IPC 命令定义
│   └── window_manager.rs    # 多窗口协调
```

**Sidecar 配置** (`tauri.conf.json`)：
```json
{
  "bundle": {
    "externalBin": ["backend/run_server"]
  },
  "tauri": {
    "allowlist": {
      "shell": {
        "sidecar": true,
        "scope": [
          { "name": "backend/run_server", "sidecar": true }
        ]
      }
    }
  }
}
```

### 3.2 看板娘窗口 (`mascot/`)

**职责**：
- 桌面常驻的二次元角色
- 拖拽移动、右键菜单
- 点击触发聊天窗口
- 快捷操作入口（打开设置、查看统计）

**技术方案**：
- 使用透明窗口（`transparent: true`, `decorations: false`）
- 角色图片使用 PNG/WebP，支持动画（Lottie 或 CSS Animation）
- 始终置顶（`alwaysOnTop: true`）
- 点击穿透（`setIgnoreCursorEvents`）

**交互设计**：
```
┌─────────────────────┐
│   ┌─────────────┐   │
│   │   看板娘     │   │  ← 点击打开聊天
│   │   (动画)     │   │  ← 右键菜单
│   └─────────────┘   │
│   ● 今天AC了x题!      │  ← 状态指示器
└─────────────────────┘
```

右键菜单：
- 打开聊天
- 打开设置
- 查看统计
- 重启后端
- 退出应用

### 3.3 聊天窗口 (`chat/`)

**职责**：
- AI 聊天界面
- 支持模板总结（输入模板 → 生成摘要）
- 日常聊天（问答、闲聊）
- 调用后端 AI API（复用现有配置）
- 消息历史记录（本地存储）
- 设计agent
**UI 布局**：
```
┌─────────────────────────────────────┐
│  ACM Helper 聊天            [─] [×] │
├─────────────────────────────────────┤
│                                     │
│  看板娘: 你好！有什么可以帮你的？     │
│                                     │
│                    用户: 总结一下这个模板 │
│                                     │
│  看板娘: 好的，这个模板主要包含...    │
│                                     │
├─────────────────────────────────────┤
│  [输入消息...]                [发送] │
└─────────────────────────────────────┘
```

**功能点**：
- 消息列表（用户/AI 双方）
- 输入框 + 发送按钮
- 快捷命令（`/summary`, `/help`）
- 历史记录（本地存储）
- 加载状态、错误处理

### 3.4 前端技术栈

```
mascot/  →  React + Vite + Tauri API + Framer Motion (动画)
chat/    →  React + Vite + Tauri API + Markdown 渲染
settings/ → React + Vite + Tauri API
```

**共用模块**：
- `shared/` - 公共组件、API 封装、类型定义
- `shared/api.ts` - 封装与后端的 HTTP 通信
- `shared/tauri-commands.ts` - 封装 IPC 命令调用

## 4. 数据流

### 4.1 题目抓取流程（浏览器插件）

```
用户在 OJ 页面做题
    ↓
点击浏览器插件图标
    ↓
Content Script 抓取题目信息
    ↓
POST /api/problems/import
    ↓
FastAPI 存储到 data/ 目录
    ↓
返回成功/失败
    ↓
插件显示通知
```

### 4.2 启动流程（Tauri 应用）

```
用户双击应用
    ↓
Tauri 启动
    ↓
Rust Core 初始化
    ↓
启动 Sidecar (FastAPI)
    ↓
等待 /health 返回 200
    ↓
创建看板娘窗口 (透明、置顶)
    ↓
创建系统托盘
    ↓
应用就绪
```

### 4.3 聊天流程

```
用户输入消息
    ↓
前端调用 Tauri IPC 命令
    ↓
Rust Core 转发到 FastAPI /api/chat
    ↓
判断 mode
    ├─ chat/summary → FastAPI 直接调用 AI API
    └─ agent → FastAPI 调用 LangGraph Agent
                  ↓
              Agent 推理 + 工具调用
                  ↓
              返回结果
    ↓
返回响应（含 tool_calls 记录）
    ↓
前端渲染消息
```

### 4.4 模板总结流程

```
用户粘贴模板内容
    ↓
前端调用 /api/chat，system prompt 指定"总结模板"
    ↓
FastAPI 调用 AI API
    ↓
返回结构化总结
    ↓
前端渲染 Markdown
```

## 5. 后端扩展

### 5.1 新增 API 端点

```python
# POST /api/chat
# 用途：通用聊天接口
{
    "message": "用户输入",
    "context": "optional - 模板内容或其他上下文",
    "mode": "chat | summary | agent"  # 聊天/总结/Agent模式
}

# Response
{
    "reply": "AI 回复内容",
    "mode": "chat | summary | agent",
    "tool_calls": [...]  # agent模式下的工具调用记录
}
```

### 5.2 实现要点

- 复用现有 `ai_client.py` 的 AI 调用逻辑
- 新增 `chat` 路由模块
- 聊天模式：通用 system prompt
- 总结模式：专用 system prompt（强调提取关键信息）
- Agent 模式：调用 LangGraph Agent，支持工具调用

## 5.3 LangGraph Agent 层

### 架构

```
┌─────────────────────────────────────────────────────────┐
│                    LangGraph Agent                       │
│                                                         │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐  │
│  │   Agent      │───▶│   Tools     │───▶│   Memory    │  │
│  │   (LLM)     │    │   Router    │    │   Store     │  │
│  └─────────────┘    └─────────────┘    └─────────────┘  │
│         │                  │                  │          │
│         ▼                  ▼                  ▼          │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐  │
│  │  推理决策    │    │  工具执行    │    │  记忆读写    │  │
│  └─────────────┘    └─────────────┘    └─────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### 核心组件

| 组件 | 职责 |
|------|------|
| Agent | LLM 推理决策，选择工具或直接回复 |
| Tools Router | 根据 Agent 决策调用对应工具 |
| Memory Store | 题目记忆、用户偏好、对话历史 |

### 工具清单（初始草稿）

| 工具 | 功能 | 状态 |
|------|------|------|
| `search_problems` | 搜索题目库 | 待实现 |
| `get_problem_detail` | 获取题目详情 | 待实现 |
| `get_solution` | 获取题解 | 待实现 |
| `search_memory` | 搜索记忆 | 待实现 |
| `save_memory` | 保存记忆 | 待实现 |

### 记忆系统设计(草稿)

```
记忆类型：
├── 题目记忆 (Problem Memory)
│   ├── 题目特征
│   ├── 解题思路
│   ├── 对应标签
│   └── 相关题目
    
├── 用户偏好 (User Preference)
│   ├── 常用算法
│   ├── 代码风格
│   └── 学习习惯
└── 对话历史 (Chat History)
    └── 最近N轮对话
```

### 工具接口规范

```python
from langchain_core.tools import tool

@tool
def search_problems(query: str, limit: int = 5) -> list[dict]:
    """搜索题目库，返回匹配的题目列表"""
    # 实现：调用 FileManager 或数据库
    pass

@tool
def get_problem_detail(source: str, problem_id: str) -> dict:
    """获取题目详细信息，包括内容、状态、题解"""
    # 实现：读取 markdown 文件
    pass

@tool
def save_memory(key: str, value: str, memory_type: str) -> str:
    """保存记忆到本地存储"""
    # 实现：写入 JSON 文件
    pass

@tool
def search_memory(query: str, memory_type: str = "all") -> list[dict]:
    """搜索记忆库"""
    # 实现：读取 JSON 文件并过滤
    pass
```

### Agent 工作流

```
用户输入
    ↓
Agent 推理 (LLM)
    ↓
是否需要工具？
    ├─ 否 → 直接回复
    └─ 是 → 选择工具
              ↓
          执行工具
              ↓
          返回结果给 Agent
              ↓
          Agent 继续推理
              ↓
          最终回复用户
```

### 后续扩展方向

- 做题记忆单调设计工具
- 自动关联相似题目
- 生成个性化学习计划
- 代码风格分析与建议

## 6. 窗口管理

### 6.1 窗口配置

| 窗口 | 尺寸 | 特性 |
|------|------|------|
| 看板娘 | 200x300 | 透明、置顶、无边框、可拖拽 |
| 聊天 | 400x600 | 标准窗口、可调整大小 |
| 设置 | 500x400 | 模态窗口 |

### 6.2 窗口通信

```
看板娘 ──IPC──→ Rust Core ──IPC──→ 聊天窗口
看板娘 ──IPC──→ Rust Core ──IPC──→ 设置窗口
```

Rust Core 负责路由 IPC 消息到正确的窗口。

## 7. 系统托盘

**菜单项**：
- 显示/隐藏看板娘
- 打开聊天
- 打开设置
- 查看统计（打开浏览器）
- 重启后端
- 退出

**图标**：
- 正常状态：应用图标
- 后端错误：带红点图标

## 8. 开发阶段

### Phase 1: 基础框架
- [ ] Tauri 项目初始化
- [ ] Sidecar 进程管理
- [ ] 系统托盘
- [ ] 单窗口测试

### Phase 2: 看板娘
- [ ] 透明窗口实现
- [ ] 角色图片/动画
- [ ] 状态指示器
- [ ] 右键菜单
- [ ] 拖拽移动

### Phase 3: 聊天功能
- [ ] 聊天 UI
- [ ] 后端 /api/chat 端点
- [ ] 消息渲染
- [ ] 历史记录

### Phase 4: LangGraph Agent
- [ ] Agent 框架搭建
- [ ] 基础工具实现（search_problems, get_problem_detail）
- [ ] 记忆系统（save_memory, search_memory）
- [ ] Agent 工作流调试
- [ ] 工具调用 UI 展示

### Phase 5: 集成优化
- [ ] 多窗口协调
- [ ] 错误处理
- [ ] 打包分发

## 9. 技术选型

| 组件 | 选择 | 理由 |
|------|------|------|
| 桌面框架 | Tauri 2.x | 轻量、安全、跨平台 |
| 前端框架 | React + Vite | 现有技能栈、生态成熟 |
| 动画库 | Framer Motion | React 生态、性能好 |
| Markdown | react-markdown | 聊天消息渲染 |
| 状态管理 | Zustand | 轻量、简单 |
| 样式 | Tailwind CSS | 快速开发 |
| Agent 框架 | LangGraph | 工具调用、多步推理、状态管理 |
| 记忆存储 | JSON 文件 | 简单、易调试、无需额外依赖 |

## 10. 依赖关系

```
浏览器插件 ──────┐
                  │ HTTP
                  ▼
Tauri App ──────▶ FastAPI Backend (Sidecar) ◀────── 浏览器插件
    │                 │
    │                 ├─ 现有 AI Client、Settings、FileManager
    │                 │
    │                 └─ 新增 LangGraph Agent + Tools + Memory
    │
    └─ 看板娘、聊天窗口、设置窗口
```

## 11. 风险与对策

| 风险 | 对策 |
|------|------|
| Sidecar 进程管理复杂 | 详细日志、健康检查、自动重启 |
| 透明窗口兼容性 | 降级方案（非透明模式） |
| 多窗口状态同步 | Rust Core 统一管理状态 |
| AI API 调用超时 | 超时设置、错误提示 |

## 12. 验收标准

1. 应用启动后自动拉起 FastAPI 后端
2. 看板娘常驻桌面，可拖拽、右键菜单正常
3. 点击看板娘打开聊天窗口
4. 聊天窗口可发送消息并接收 AI 回复
5. 模板总结功能正常工作
6. 系统托盘菜单功能完整
7. 应用退出时自动清理 Sidecar 进程
8. Agent 模式可调用工具搜索题目、获取详情
9. 记忆系统可保存和读取用户记忆
10. 工具调用过程在 UI 中可见
