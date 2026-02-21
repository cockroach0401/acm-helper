from __future__ import annotations

import json
from datetime import UTC, date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException

from ..models.stats import InsightGenerateRequest, InsightGenerateResponse, StatsPeriod
from ..models.task import TaskStatus
from ..services.prompt_renderer import render_template
from ..services.stats_gen import InsightGenerator, build_insight_prompt, build_stats_series, resolve_solved_date
from ..storage.file_manager import FileManager
from .shared import get_file_manager, get_insight_generator

router = APIRouter(prefix="/api/stats", tags=["stats"])


def _today_utc() -> date:
    return datetime.now(UTC).date()


def _parse_week_target(target: str) -> tuple[date, date]:
    try:
        year_str, week_str = target.split("-W", maxsplit=1)
        year = int(year_str)
        week = int(week_str)
        start = date.fromisocalendar(year, week, 1)
        end = start + timedelta(days=6)
        return start, end
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid week target: {target}. expected YYYY-Www") from exc


def _week_target_from_date(d: date) -> str:
    year, week, _ = d.isocalendar()
    return f"{year}-W{week:02d}"


def _iter_week_targets(start: date, end: date) -> list[str]:
    if start > end:
        return []
    cursor = start
    targets: list[str] = []
    while cursor <= end:
        targets.append(_week_target_from_date(cursor))
        cursor = cursor + timedelta(days=7)
    return targets


def _parse_week_range(start_week: str, end_week: str) -> tuple[date, date, list[str]]:
    start, _ = _parse_week_target(start_week)
    end_start, end = _parse_week_target(end_week)
    if start > end_start:
        raise HTTPException(status_code=400, detail="start_week must be <= end_week")
    return start, end, _iter_week_targets(start, end)


@router.get("/series")
def get_series(
    period: StatsPeriod = StatsPeriod.day,
    from_date: date | None = None,
    to_date: date | None = None,
    fm: FileManager = Depends(get_file_manager),
):
    end = to_date or _today_utc()
    if from_date is None:
        if period == StatsPeriod.day:
            start = end - timedelta(days=29)
        elif period == StatsPeriod.week:
            start = end - timedelta(days=84)
        else:
            start = end - timedelta(days=365)
    else:
        start = from_date

    if start > end:
        raise HTTPException(status_code=400, detail="from_date must be <= to_date")

    problems = fm.list_problems()
    series = build_stats_series(problems, period=period, from_date=start, to_date=end)
    return series.model_dump(mode="json")


@router.get("/charts")
def get_chart_series(
    from_date: date | None = None,
    to_date: date | None = None,
    fm: FileManager = Depends(get_file_manager),
):
    end = to_date or _today_utc()
    start = from_date or (end - timedelta(days=365))
    if start > end:
        raise HTTPException(status_code=400, detail="from_date must be <= to_date")

    problems = fm.list_problems()
    daily = build_stats_series(problems, period=StatsPeriod.day, from_date=start, to_date=end)
    weekly = build_stats_series(problems, period=StatsPeriod.week, from_date=start, to_date=end)
    monthly = build_stats_series(problems, period=StatsPeriod.month, from_date=start, to_date=end)

    return {
        "from_date": start,
        "to_date": end,
        "daily": daily.points,
        "weekly": weekly.points,
        "monthly": monthly.points,
    }


@router.post("/insights/generate", response_model=InsightGenerateResponse)
async def generate_insight(
    req: InsightGenerateRequest,
    fm: FileManager = Depends(get_file_manager),
    insight_generator: InsightGenerator = Depends(get_insight_generator),
) -> InsightGenerateResponse:
    insight_type = req.type.value
    target = req.target

    if req.type.value == "weekly":
        start, end = _parse_week_target(target)
    elif req.type.value == "phased":
        parts = target.split("__", maxsplit=1)
        if len(parts) != 2:
            raise HTTPException(status_code=400, detail="phased target must be startWeek__endWeek")
        start, end, _ = _parse_week_range(parts[0], parts[1])
    else:
        raise HTTPException(status_code=400, detail="unsupported insight type")

    period = StatsPeriod.day
    settings = fm.get_settings()
    active_profile = settings.ai.resolve_active_profile()
    report_task = fm.create_report_task(insight_type, target, provider_name=active_profile.name)
    fm.update_task(report_task.task_id, status=TaskStatus.running, started=True)

    fm.update_insight_status(insight_type, target, "generating")
    try:
        all_problems = fm.list_problems()
        stats = build_stats_series(all_problems, period=period, from_date=start, to_date=end)

        selected = []
        for p in all_problems:
            solved_date = resolve_solved_date(p)
            updated_date = p.updated_at.astimezone(UTC).date() if p.updated_at else None

            in_range_by_solved = solved_date is not None and start <= solved_date <= end
            in_range_by_updated = updated_date is not None and start <= updated_date <= end

            if in_range_by_solved or in_range_by_updated:
                selected.append(p)

        if req.type.value == "phased":
            parts = target.split("__", maxsplit=1)
            _, _, week_targets = _parse_week_range(parts[0], parts[1])
            weekly_reports: list[dict[str, str]] = []
            missing_weeks: list[str] = []
            for wk in week_targets:
                content = fm.read_insight("weekly", wk)
                if content is None:
                    missing_weeks.append(wk)
                else:
                    weekly_reports.append({"week": wk, "content": content})

            if missing_weeks:
                msg = f"Missing weekly reports: {', '.join(missing_weeks)}"
                fm.update_task(report_task.task_id, status=TaskStatus.failed, error_message=msg, finished=True)
                fm.update_insight_status(insight_type, target, "failed", error_message=msg)
                raise HTTPException(status_code=400, detail=msg)

            stats_points_json = json.dumps([p.model_dump(mode="json") for p in stats.points], ensure_ascii=False, indent=2)
            prompt = render_template(
                settings.prompts.insight_template,
                {
                    "insight_type": insight_type,
                    "target": target,
                    "month": target,
                    "week": target,
                    "period": stats.period.value,
                    "from_date": stats.from_date.isoformat(),
                    "to_date": stats.to_date.isoformat(),
                    "stats_json": stats_points_json,
                    "stats_points_json": stats_points_json,
                    "problem_list_json": json.dumps(weekly_reports, ensure_ascii=False, indent=2),
                },
            )
        else:
            prompt = build_insight_prompt(
                insight_type=insight_type,
                target=target,
                stats=stats,
                problems=selected,
                template=settings.prompts.insight_template,
                solution_loader=fm.read_solution_file,
            )

        content = await insight_generator.generate(prompt, settings.ai)
        path = fm.save_insight(insight_type, target, content)
        fm.update_task(
            report_task.task_id,
            status=TaskStatus.succeeded,
            output_path=path,
            error_message="",
            finished=True,
        )
        fm.update_insight_status(insight_type, target, "ready", report_path=path)
        return InsightGenerateResponse(type=req.type, target=target, path=path, content=content)
    except HTTPException:
        raise
    except Exception as exc:
        fm.update_task(report_task.task_id, status=TaskStatus.failed, error_message=str(exc), finished=True)
        fm.update_insight_status(insight_type, target, "failed", error_message=str(exc))
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/insights/{insight_type}/{target}/status")
def get_insight_status(
    insight_type: str,
    target: str,
    fm: FileManager = Depends(get_file_manager),
):
    if insight_type not in {"weekly", "phased"}:
        raise HTTPException(status_code=400, detail="insight_type must be weekly or phased")
    return fm.get_insight_status(insight_type, target).model_dump(mode="json")


@router.get("/insights/{insight_type}/{target}")
def get_insight_content(
    insight_type: str,
    target: str,
    fm: FileManager = Depends(get_file_manager),
):
    if insight_type not in {"weekly", "phased"}:
        raise HTTPException(status_code=400, detail="insight_type must be weekly or phased")
    content = fm.read_insight(insight_type, target)
    if content is None:
        raise HTTPException(status_code=404, detail="Insight not found")
    return {"type": insight_type, "target": target, "content": content}
