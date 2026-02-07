from __future__ import annotations

from collections import Counter
from datetime import UTC, datetime

from fastapi import APIRouter, Depends

from ..models.problem import ProblemStatus, SolutionStatus
from ..storage.file_manager import FileManager
from .shared import get_file_manager

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


def _current_month() -> str:
    return datetime.now(UTC).strftime("%Y-%m")


@router.get("/overview")
def get_overview(
    month: str | None = None,
    fm: FileManager = Depends(get_file_manager),
):
    target_month = month or _current_month()
    problems = fm.list_problems(target_month)
    pending = fm.list_pending_problems(target_month)
    tasks = fm.list_tasks()[:50]
    insight = fm.get_insight_status("weekly", _current_week())
    settings = fm.get_settings()

    status_counter = Counter([p.status.value for p in problems])
    sol_counter = Counter([p.solution_status.value for p in problems])

    running_task_count = sum(1 for t in tasks if t.status.value in {"queued", "running"})
    failed_task_count = sum(1 for t in tasks if t.status.value == "failed")

    return {
        "month": target_month,
        "stats": {
            "total": len(problems),
            "solved": status_counter.get(ProblemStatus.solved.value, 0),
            "attempted": status_counter.get(ProblemStatus.attempted.value, 0),
            "unsolved": status_counter.get(ProblemStatus.unsolved.value, 0),
            "pending_solution": len(pending),
            "solution_done": sol_counter.get(SolutionStatus.done.value, 0),
            "solution_failed": sol_counter.get(SolutionStatus.failed.value, 0),
            "running_tasks": running_task_count,
            "failed_tasks": failed_task_count,
        },
        "pending": [p.model_dump(mode="json") for p in pending],
        "tasks": [t.model_dump(mode="json") for t in tasks],
        "insight": insight.model_dump(mode="json"),
        "ai": {
            "provider": settings.ai.provider.value,
            "model": settings.ai.model,
        },
    }


def _current_week() -> str:
    today = datetime.now(UTC).date()
    year, week, _ = today.isocalendar()
    return f"{year}-W{week:02d}"
