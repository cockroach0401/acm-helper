from __future__ import annotations

from datetime import UTC, date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException

from ..models.stats import InsightGenerateRequest, InsightGenerateResponse, StatsPeriod
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

    start, end = _parse_week_target(target)
    period = StatsPeriod.day

    fm.update_insight_status(insight_type, target, "generating")
    try:
        all_problems = fm.list_problems()
        stats = build_stats_series(all_problems, period=period, from_date=start, to_date=end)

        selected = []
        for p in all_problems:
            solved_date = resolve_solved_date(p)
            if solved_date is None:
                continue
            if start <= solved_date <= end:
                selected.append(p)

        settings = fm.get_settings()
        prompt = build_insight_prompt(
            insight_type=insight_type,
            target=target,
            stats=stats,
            problems=selected,
            template=settings.prompts.insight_template,
            prompt_settings=settings.prompts,
            solution_loader=fm.read_solution_file,
        )
        content = await insight_generator.generate(prompt, settings.ai)
        path = fm.save_insight(insight_type, target, content)
        fm.update_insight_status(insight_type, target, "ready", report_path=path)
        return InsightGenerateResponse(type=req.type, target=target, path=path, content=content)
    except Exception as exc:
        fm.update_insight_status(insight_type, target, "failed", error_message=str(exc))
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/insights/{insight_type}/{target}/status")
def get_insight_status(
    insight_type: str,
    target: str,
    fm: FileManager = Depends(get_file_manager),
):
    if insight_type not in {"weekly"}:
        raise HTTPException(status_code=400, detail="insight_type must be weekly")
    return fm.get_insight_status(insight_type, target).model_dump(mode="json")


@router.get("/insights/{insight_type}/{target}")
def get_insight_content(
    insight_type: str,
    target: str,
    fm: FileManager = Depends(get_file_manager),
):
    if insight_type not in {"weekly"}:
        raise HTTPException(status_code=400, detail="insight_type must be weekly")
    content = fm.read_insight(insight_type, target)
    if content is None:
        raise HTTPException(status_code=404, detail="Insight not found")
    return {"type": insight_type, "target": target, "content": content}
