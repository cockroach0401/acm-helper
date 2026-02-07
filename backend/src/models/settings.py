from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, Field


class AIProvider(str, Enum):
    mock = "mock"
    openai_compatible = "openai_compatible"
    anthropic = "anthropic"


class AcLanguage(str, Enum):
    c = "c"
    cpp = "cpp"
    python = "python"
    java = "java"


class WeeklyPromptStyle(str, Enum):
    custom = "custom"
    none = "none"
    rigorous = "rigorous"
    intuitive = "intuitive"
    concise = "concise"


DEFAULT_SOLUTION_TEMPLATE = """你是一位经验丰富的竞赛程序员，精通算法与数据结构，擅长撰写清晰、严谨的 ACM/ICPC 风格题解。请按照以下结构为给定题目生成题解：

## 输入格式（系统注入变量）
- 题目来源：{{source}}
- 题目编号：{{id}}
- 题目标题：{{title}}
- 当前状态：{{status}}
- 题目描述（包含原文或概述）：
{{content}}
- 输入格式：{{input_format}}
- 输出格式：{{output_format}}
- 数据范围与约束条件：
{{constraints}}
- 样例输入输出：若题面中提供样例，请从题目描述中提取并在题解中引用。

## 输出要求

### 1. 题意概述
用简洁的语言重新表述问题的核心目标，剥离题目背景故事，提炼出纯粹的数学或算法模型。

### 2. 思路分析
从最直观的暴力解法出发，逐步分析其时间复杂度瓶颈所在，然后阐述优化思路的推导过程，说明为何选择特定的算法或数据结构，以及关键性质或引理的证明（若有）。

### 3. 算法设计
详细描述最终采用的算法流程，包括状态定义（若为动态规划）、转移方程、边界条件处理、以及任何需要特别注意的实现细节。

### 4. 复杂度分析
给出时间复杂度和空间复杂度的精确分析，说明各部分操作的代价及其累加方式。

### 5. 代码实现
提供完整、可直接提交的代码，要求：
- 使用 {{default_ac_language}}
- 包含必要的注释，标注关键步骤对应的算法逻辑
- 变量命名简洁，符合竞赛风格
- 处理好边界情况和潜在的溢出问题

### 6. 常见错误与调试建议（可选）
列举此类题目中容易犯的错误，如边界遗漏、取模时机、数据类型选择等。

## 风格注入（系统可选）
- 当前风格：{{prompt_style}}
- 个性化提示词（优先级最高）：
{{style_prompt_injection}}
- 若个性化提示词与通用要求冲突，以个性化提示词为准。

## 通用要求（优先级低于个性化提示词）
- 若题目存在多种解法，可简要提及替代方案及其优劣对比
- 数学公式必须使用 Markdown 数学语法包裹：行内公式用 `$...$`，单行公式可用 `$$...$$`，以确保渲染正确
""".strip()


DEFAULT_INSIGHT_TEMPLATE = """你是一位资深的 ACM 竞赛教练与数据分析师，负责为训练者生成专业、精准且具有可操作性的周期性训练分析报告。请基于以下输入数据，生成一份结构完整的训练洞察报告。

---

## 元信息

**分析对象**: {{target}}
**统计周期**: {{period}}（{{from_date}} 至 {{to_date}}）

---

## 输出风格

采用专业简洁的技术分析风格，避免空泛鼓励，侧重事实陈述与逻辑推断。

---

## 输入数据

### 做题量时序数据
用于趋势分析与异常检测：
```json
{{stats_points_json}}
```

### 题目明细记录
包含题目难度、所属专题、用时、提交次数、个人反思、题解等：
```json
{{problem_list_json}}
```

---

## 报告结构要求

### 1. 数据概览与趋势诊断
从时序数据中进行总结

### 2. 专题掌握度分析
依据题目记录中的专题标签与通过情况，量化各专题的覆盖率与正确率。明确指出：哪些专题已形成稳定能力、哪些专题处于突破边缘、哪些专题存在系统性短板。若数据支持，可计算各专题的平均尝试次数与耗时，作为难度感知的辅助指标。

### 3. 反思内容综合
提取题目记录中的 reflection 字段，归纳训练者自述的主要困难类型（如思路卡点、实现细节、边界遗漏、TLE 调优等）。识别反复出现的模式性问题，区分偶发失误与能力缺口。

### 4. 下阶段行动建议
基于上述分析，给出具体、可量化、有优先级的训练建议。建议应包含：推荐强化的专题及对应题单来源（如 Codeforces tag、洛谷题单等）、建议的每日训练节奏、以及针对反思中高频问题的专项练习策略。避免泛泛而谈的“多练习”“多思考”式建议。

---

## 附加约束

- 所有百分比与统计量需注明计算口径
- 若输入数据存在缺失或异常格式，在报告开头予以说明并标注受影响的分析模块
- 涉及专题名称时使用标准 ACM 术语（如 DP、Graph Theory、Number Theory、Data Structure 等）
- 可使用 Markdown 表格呈现量化对比结果
""".strip()


DEFAULT_WEEKLY_STYLE_CUSTOM_INJECTION = """
Follow the custom style guidance strictly.
""".strip()
DEFAULT_WEEKLY_STYLE_RIGOROUS_INJECTION = """
以数学证明的标准呈现题解。文字部分需完整论证算法正确性：明确陈述引理或性质，给出必要且充分的证明，对贪心策略需说明交换论证或反证细节，对动态规划需证明最优子结构与无后效性，对图论算法需说明不变量的维护。代码部分要求逻辑结构清晰，每个函数职责单一，关键断言处可加 assert 辅助验证。样例部分需附带逐步解释：展示输入如何经过算法各阶段变换，中间变量取值如何演变，最终如何得出输出，使读者能够手动模拟验证。
""".strip()
DEFAULT_WEEKLY_STYLE_INTUITIVE_INJECTION = """
以启发式思维路径呈现题解。从拿到题目的第一直觉出发，描述观察到了哪些特殊结构、对称性或反常规律，如何从样例中捕捉到模式，如何通过手玩小数据建立猜想。强调“为什么会想到这个方法”而非“这个方法为什么对”，侧重类比、联想与经验迁移，例如“这个结构让人想起某类经典问题”或“如果把约束放宽会发生什么”。证明可以非形式化，用图示或极端情况验证来建立信心。代码部分保持正常可读性即可。
""".strip()
DEFAULT_WEEKLY_STYLE_CONCISE_INJECTION = """
以极简主义方式呈现题解。文字部分直接切入问题本质，用一到两段连贯的文字说明核心思路与关键结论，必要时给出一句话证明，省略冗余的背景铺垫与分步小标题。代码部分追求竞赛选手的实战风格：单字母或极短变量名，删除一切可从上下文推断的注释，仅在非显然的技巧处保留一行极简注释，整体代码行数压缩到最少。不输出复杂度分析，除非复杂度本身是题目考点。
""".strip()


class AISettings(BaseModel):
    provider: AIProvider = AIProvider.mock
    api_base: str = ""
    api_key: str = ""
    model: str = "gpt-4o-mini"
    model_options: list[str] = Field(default_factory=lambda: ["gpt-4o-mini"])
    temperature: float = 0.2
    timeout_seconds: int = 120


class AISettingsUpdateRequest(BaseModel):
    provider: AIProvider
    api_base: str = ""
    api_key: str = ""
    model: str = "gpt-4o-mini"
    model_options: list[str] = Field(default_factory=lambda: ["gpt-4o-mini"])
    temperature: float = 0.2
    timeout_seconds: int = 120


class PromptSettings(BaseModel):
    solution_template: str = Field(default=DEFAULT_SOLUTION_TEMPLATE)
    insight_template: str = Field(default=DEFAULT_INSIGHT_TEMPLATE)
    weekly_prompt_style: WeeklyPromptStyle = WeeklyPromptStyle.custom
    weekly_style_custom_injection: str = Field(default=DEFAULT_WEEKLY_STYLE_CUSTOM_INJECTION)
    weekly_style_rigorous_injection: str = Field(default=DEFAULT_WEEKLY_STYLE_RIGOROUS_INJECTION)
    weekly_style_intuitive_injection: str = Field(default=DEFAULT_WEEKLY_STYLE_INTUITIVE_INJECTION)
    weekly_style_concise_injection: str = Field(default=DEFAULT_WEEKLY_STYLE_CONCISE_INJECTION)


class PromptSettingsUpdateRequest(BaseModel):
    solution_template: str
    insight_template: str | None = None
    weekly_prompt_style: WeeklyPromptStyle | None = None
    weekly_style_custom_injection: str | None = None
    weekly_style_rigorous_injection: str | None = None
    weekly_style_intuitive_injection: str | None = None
    weekly_style_concise_injection: str | None = None


class UiSettings(BaseModel):
    default_ac_language: AcLanguage = AcLanguage.cpp


class UiSettingsUpdateRequest(BaseModel):
    default_ac_language: AcLanguage


class SettingsBundle(BaseModel):
    ai: AISettings = Field(default_factory=AISettings)
    prompts: PromptSettings = Field(default_factory=PromptSettings)
    ui: UiSettings = Field(default_factory=UiSettings)
