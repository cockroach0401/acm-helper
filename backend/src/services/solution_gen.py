from __future__ import annotations

from ..models.problem import ProblemRecord
from ..models.settings import AISettings
from .ai_client import AIClient
from .prompt_renderer import render_template


def build_solution_prompt(problem: ProblemRecord, template: str, *, default_ac_language: str = "") -> str:
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
    ) -> str:
        prompt = build_solution_prompt(
            problem,
            prompt_template,
            default_ac_language=default_ac_language,
        )
        return await self.ai_client.generate_solution(prompt, ai_settings)
