from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException

from ..models.task import CreateTaskRequest, CreateTaskResponse, SolutionTaskRecord
from ..services.task_runner import TaskRunner
from ..storage.file_manager import FileManager
from .shared import get_file_manager, get_task_runner

router = APIRouter(prefix="/api/solutions", tags=["solutions"])


def _current_month() -> str:
    return datetime.now(UTC).strftime("%Y-%m")


@router.post("/tasks", response_model=CreateTaskResponse)
async def create_solution_tasks(
    req: CreateTaskRequest,
    fm: FileManager = Depends(get_file_manager),
    task_runner: TaskRunner = Depends(get_task_runner),
) -> CreateTaskResponse:
    keys = req.problem_keys
    if not keys:
        pending = fm.list_pending_problems(_current_month())
        keys = [p.key() for p in pending]

    if not keys:
        raise HTTPException(status_code=400, detail="No problem keys provided and no pending problems found")

    task_ids: list[str] = []
    for key in keys:
        if fm.get_problem_by_key(key) is None:
            continue
        task_ids.append(await task_runner.enqueue_solution_task(key))

    if not task_ids:
        raise HTTPException(status_code=404, detail="No valid problems found for task creation")

    return CreateTaskResponse(task_ids=task_ids)


@router.get("/tasks/{task_id}", response_model=SolutionTaskRecord)
def get_task_status(task_id: str, fm: FileManager = Depends(get_file_manager)) -> SolutionTaskRecord:
    task = fm.get_task(task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@router.get("/pending")
def list_pending(month: str | None = None, fm: FileManager = Depends(get_file_manager)):
    records = fm.list_pending_problems(month)
    return {
        "month": month,
        "total": len(records),
        "items": [r.model_dump(mode="json") for r in records],
    }

