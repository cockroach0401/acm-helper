from __future__ import annotations

from datetime import datetime, UTC
from enum import Enum

from pydantic import BaseModel, Field


def now_utc() -> datetime:
    return datetime.now(UTC)


class TaskStatus(str, Enum):
    queued = "queued"
    running = "running"
    succeeded = "succeeded"
    failed = "failed"


class TaskType(str, Enum):
    solution = "solution"
    ai_tag = "ai_tag"
    weekly_report = "weekly_report"
    phased_report = "phased_report"


class SolutionTaskRecord(BaseModel):
    task_id: str
    task_type: TaskType = TaskType.solution
    problem_key: str = ""
    report_type: str | None = None
    report_target: str | None = None
    provider_name: str | None = None
    status: TaskStatus = TaskStatus.queued
    error_message: str | None = None
    output_path: str | None = None
    created_at: datetime = Field(default_factory=now_utc)
    started_at: datetime | None = None
    finished_at: datetime | None = None


class CreateTaskRequest(BaseModel):
    problem_keys: list[str] = Field(default_factory=list)


class CreateTaskResponse(BaseModel):
    task_ids: list[str]

