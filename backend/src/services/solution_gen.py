from __future__ import annotations

from ..models.problem import ProblemRecord
from ..models.settings import AISettings, PromptSettings, WeeklyPromptStyle
from .ai_client import AIClient
from .prompt_renderer import render_template


def resolve_solution_style_injection(prompt_settings: PromptSettings) -> str:
    style = prompt_settings.weekly_prompt_style
    if style == WeeklyPromptStyle.custom:
        return prompt_settings.weekly_style_custom_injection
    if style == WeeklyPromptStyle.rigorous:
        return prompt_settings.weekly_style_rigorous_injection
    if style == WeeklyPromptStyle.intuitive:
        return prompt_settings.weekly_style_intuitive_injection
    if style == WeeklyPromptStyle.concise:
        return prompt_settings.weekly_style_concise_injection
    return ""


def build_solution_prompt(
    problem: ProblemRecord,
    template: str,
    *,
    default_ac_language: str = "",
    prompt_settings: PromptSettings | None = None,
) -> str:
    selected_style = "custom"
    style_prompt_injection = ""
    if prompt_settings is not None:
        selected_style = prompt_settings.weekly_prompt_style.value
        style_prompt_injection = resolve_solution_style_injection(prompt_settings)

    values = {
        "source": problem.source,
        "id": problem.id,
        "title": problem.title,
        "status": problem.status.value,
        "content": problem.content,
        "input_format": problem.input_format,
        "output_format": problem.output_format,
        "constraints": problem.constraints,
        "default_ac_language": default_ac_language,
        "prompt_style": selected_style,
        "style_prompt_injection": style_prompt_injection,
    }
    return render_template(template, values)


class SolutionGenerator:
    def __init__(self, ai_client: AIClient):
        self.ai_client = ai_client

    async def generate(
        self,
        problem: ProblemRecord,
        *,
        prompt_template: str,
        ai_settings: AISettings,
        default_ac_language: str = "",
        prompt_settings: PromptSettings | None = None,
    ) -> str:
        prompt = build_solution_prompt(
            problem,
            prompt_template,
            default_ac_language=default_ac_language,
            prompt_settings=prompt_settings,
        )
        return await self.ai_client.generate_solution(prompt, ai_settings)
