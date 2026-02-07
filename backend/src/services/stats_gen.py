from __future__ import annotations

import json
from collections import Counter
from collections.abc import Callable
from datetime import UTC, date, datetime, timedelta

from ..models.problem import ProblemRecord, ProblemStatus
from ..models.settings import AISettings, PromptSettings, WeeklyPromptStyle
from ..models.stats import StatsPeriod, StatsPoint, StatsSeriesResponse
from .ai_client import AIClient
from .prompt_renderer import render_template


def resolve_weekly_style_injection(prompt_settings: PromptSettings) -> str:
    style = prompt_settings.weekly_prompt_style
    if style == WeeklyPromptStyle.rigorous:
        return prompt_settings.weekly_style_rigorous_injection
    if style == WeeklyPromptStyle.intuitive:
        return prompt_settings.weekly_style_intuitive_injection
    if style == WeeklyPromptStyle.concise:
        return prompt_settings.weekly_style_concise_injection
    return ""


def _to_utc_date(dt: datetime | None) -> date | None:
    if dt is None:
        return None
    return dt.astimezone(UTC).date()


def resolve_solved_date(record: ProblemRecord) -> date | None:
    solved_date = _to_utc_date(record.solved_at)
    if solved_date is not None:
        return solved_date
    if record.status == ProblemStatus.solved:
        return _to_utc_date(record.updated_at)
    return None


def _build_points(problems: list[ProblemRecord], period: StatsPeriod, from_date: date, to_date: date) -> list[StatsPoint]:
    by_bucket: dict[tuple[date, date], Counter[str]] = {}

    for record in problems:
        solved_date = resolve_solved_date(record)
        if solved_date is None:
            continue
        if solved_date < from_date or solved_date > to_date:
            continue

        if period == StatsPeriod.day:
            start = solved_date
            end = solved_date
        elif period == StatsPeriod.week:
            start = solved_date - timedelta(days=solved_date.weekday())
            end = start + timedelta(days=6)
        else:
            start = solved_date.replace(day=1)
            if start.month == 12:
                next_month = start.replace(year=start.year + 1, month=1, day=1)
            else:
                next_month = start.replace(month=start.month + 1, day=1)
            end = next_month - timedelta(days=1)

        key = (start, end)
        if key not in by_bucket:
            by_bucket[key] = Counter()
        by_bucket[key][record.status.value] += 1

    points: list[StatsPoint] = []
    for (start, end), counter in sorted(by_bucket.items(), key=lambda kv: kv[0][0]):
        solved = counter.get(ProblemStatus.solved.value, 0)
        attempted = counter.get(ProblemStatus.attempted.value, 0)
        unsolved = counter.get(ProblemStatus.unsolved.value, 0)
        points.append(
            StatsPoint(
                period_start=start.isoformat(),
                period_end=end.isoformat(),
                solved_count=solved,
                attempted_count=attempted,
                unsolved_count=unsolved,
                total_count=solved + attempted + unsolved,
            )
        )

    return points


def build_stats_series(
    problems: list[ProblemRecord],
    *,
    period: StatsPeriod,
    from_date: date,
    to_date: date,
) -> StatsSeriesResponse:
    if from_date > to_date:
        raise ValueError("from_date must be <= to_date")

    points = _build_points(problems, period, from_date, to_date)
    return StatsSeriesResponse(period=period, from_date=from_date, to_date=to_date, points=points)


def build_insight_prompt(
    *,
    insight_type: str,
    target: str,
    stats: StatsSeriesResponse,
    problems: list[ProblemRecord],
    template: str,
    prompt_settings: PromptSettings | None = None,
    solution_loader: Callable[[str, str], str] | None = None,
) -> str:
    problem_list = []
    for p in problems:
        solution_content = ""
        if solution_loader is not None:
            solution_content = solution_loader(p.source, p.id) or ""
        problem_list.append(
            {
                "source": p.source,
                "id": p.id,
                "title": p.title,
                "status": p.status.value,
                "content": p.content,
                "input_format": p.input_format,
                "output_format": p.output_format,
                "constraints": p.constraints,
                "tags": p.tags,
                "difficulty": p.difficulty,
                "my_ac_code": p.my_ac_code,
                "my_ac_language": p.my_ac_language,
                "solved_at": p.solved_at.isoformat() if p.solved_at else None,
                "reflection": p.reflection,
                "translated_title": p.translated_title,
                "translated_content": p.translated_content,
                "translated_input_format": p.translated_input_format,
                "translated_output_format": p.translated_output_format,
                "translated_constraints": p.translated_constraints,
                "translation_status": p.translation_status.value,
                "solution_status": p.solution_status.value,
                "solution_markdown": solution_content,
                "created_at": p.created_at.isoformat(),
                "updated_at": p.updated_at.isoformat(),
            }
        )

    selected_style = "none"
    style_prompt_injection = ""
    if prompt_settings is not None:
        selected_style = prompt_settings.weekly_prompt_style.value
        style_prompt_injection = resolve_weekly_style_injection(prompt_settings)

    values = {
        "insight_type": insight_type,
        "target": target,
        "month": target,
        "week": target,
        "prompt_style": selected_style,
        "style_prompt_injection": style_prompt_injection,
        "period": stats.period.value,
        "from_date": stats.from_date.isoformat(),
        "to_date": stats.to_date.isoformat(),
        "stats_json": json.dumps([p.model_dump(mode="json") for p in stats.points], ensure_ascii=False, indent=2),
        "problem_list_json": json.dumps(problem_list, ensure_ascii=False, indent=2),
        "stats_points_json": json.dumps([p.model_dump(mode="json") for p in stats.points], ensure_ascii=False, indent=2),
    }
    return render_template(template, values)


class InsightGenerator:
    def __init__(self, ai_client: AIClient):
        self.ai_client = ai_client

    async def generate(self, prompt: str, ai_settings: AISettings) -> str:
        return await self.ai_client.generate_text(prompt, ai_settings)
