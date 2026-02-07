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
    none = "none"
    rigorous = "rigorous"
    intuitive = "intuitive"
    concise = "concise"


DEFAULT_SOLUTION_TEMPLATE = """You are an ACM solution assistant.

Please generate a high-quality solution for this problem.

source: {{source}}
id: {{id}}
title: {{title}}
status: {{status}}
default_ac_language: {{default_ac_language}}

content:
{{content}}

input_format:
{{input_format}}

output_format:
{{output_format}}

constraints:
{{constraints}}

Requirements:
1) Explain key observations and algorithm choice.
2) Provide correctness reasoning.
3) Provide both C++ and Python implementations.
4) Include time and space complexity.
""".strip()


DEFAULT_INSIGHT_TEMPLATE = """You are an ACM training analysis assistant.

Generate a {{insight_type}} insight for target {{target}}.

Week target:
- week: {{week}}

Prompt style:
- selected: {{prompt_style}}
- style prompt injection:
{{style_prompt_injection}}

Period:
- granularity: {{period}}
- from: {{from_date}}
- to: {{to_date}}

Solved-count series (for chart interpretation):
{{stats_points_json}}

Problem records:
{{problem_list_json}}

Output requirements:
1) Data summary (highlights and anomalies)
2) Topic mastery / weakness diagnosis
3) Reflection synthesis (based on reflection field)
4) Actionable next-step plan
""".strip()


DEFAULT_WEEKLY_STYLE_RIGOROUS_INJECTION = ""
DEFAULT_WEEKLY_STYLE_INTUITIVE_INJECTION = ""
DEFAULT_WEEKLY_STYLE_CONCISE_INJECTION = ""

DEFAULT_WEEKLY_STYLE_RIGOROUS_DESC = ""
DEFAULT_WEEKLY_STYLE_INTUITIVE_DESC = ""
DEFAULT_WEEKLY_STYLE_CONCISE_DESC = ""


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
    weekly_prompt_style: WeeklyPromptStyle = WeeklyPromptStyle.none
    weekly_style_rigorous_injection: str = Field(default=DEFAULT_WEEKLY_STYLE_RIGOROUS_INJECTION)
    weekly_style_intuitive_injection: str = Field(default=DEFAULT_WEEKLY_STYLE_INTUITIVE_INJECTION)
    weekly_style_concise_injection: str = Field(default=DEFAULT_WEEKLY_STYLE_CONCISE_INJECTION)
    weekly_style_rigorous_desc: str = Field(default=DEFAULT_WEEKLY_STYLE_RIGOROUS_DESC)
    weekly_style_intuitive_desc: str = Field(default=DEFAULT_WEEKLY_STYLE_INTUITIVE_DESC)
    weekly_style_concise_desc: str = Field(default=DEFAULT_WEEKLY_STYLE_CONCISE_DESC)


class PromptSettingsUpdateRequest(BaseModel):
    solution_template: str
    insight_template: str | None = None
    weekly_prompt_style: WeeklyPromptStyle | None = None
    weekly_style_rigorous_injection: str | None = None
    weekly_style_intuitive_injection: str | None = None
    weekly_style_concise_injection: str | None = None
    weekly_style_rigorous_desc: str | None = None
    weekly_style_intuitive_desc: str | None = None
    weekly_style_concise_desc: str | None = None


class UiSettings(BaseModel):
    default_ac_language: AcLanguage = AcLanguage.cpp


class UiSettingsUpdateRequest(BaseModel):
    default_ac_language: AcLanguage


class SettingsBundle(BaseModel):
    ai: AISettings = Field(default_factory=AISettings)
    prompts: PromptSettings = Field(default_factory=PromptSettings)
    ui: UiSettings = Field(default_factory=UiSettings)
