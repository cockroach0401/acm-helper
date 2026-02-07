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
- 详细提示词：
{{style_prompt_injection}}

## 风格要求
- 若题目存在多种解法，可简要提及替代方案及其优劣对比
- 使用 LaTeX 格式书写数学公式
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
Use rigorous derivation and proof.
State assumptions clearly, define invariants if needed, and provide a step-by-step correctness argument.
Prioritize formal reasoning over storytelling.
If there are formulas, derive them explicitly and explain why each step is valid.
Prefer theorem/lemma style structure when appropriate.
""".strip()
DEFAULT_WEEKLY_STYLE_INTUITIVE_INJECTION = """
Start with an intuitive picture first, then reveal the exact method.
You may use a "Ramanujan stare" style metaphor for sudden insight, but still keep the final algorithm executable and precise.
After intuition, provide a compact correctness explanation and implementation details.
Use small examples to bridge intuition to formal method.
Highlight the turning point from brute force thinking to the key insight.
""".strip()
DEFAULT_WEEKLY_STYLE_CONCISE_INJECTION = """
Be concise.
Avoid long prose and keep each section short.
Prefer bullet points and direct conclusions.
Keep only essential proofs and skip repetitive explanations.
Use compact section headers and prioritize actionable takeaways.
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
