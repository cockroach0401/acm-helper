from __future__ import annotations

from datetime import datetime, UTC

from pydantic import BaseModel, Field


def now_utc() -> datetime:
    return datetime.now(UTC)


class SolutionRecord(BaseModel):
    source: str
    id: str
    content: str
    created_at: datetime = Field(default_factory=now_utc)
    provider: str = "mock"


class ReportStatusResponse(BaseModel):
    target: str
    status: str
    updated_at: datetime | None = None
    report_path: str | None = None
    error_message: str | None = None

