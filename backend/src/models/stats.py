from __future__ import annotations

from datetime import date
from enum import Enum

from pydantic import BaseModel, Field


class StatsPeriod(str, Enum):
    day = "day"
    week = "week"
    month = "month"


class StatsPoint(BaseModel):
    period_start: str
    period_end: str
    solved_count: int = 0
    attempted_count: int = 0
    unsolved_count: int = 0
    total_count: int = 0


class StatsSeriesResponse(BaseModel):
    period: StatsPeriod
    from_date: date
    to_date: date
    points: list[StatsPoint] = Field(default_factory=list)


class InsightType(str, Enum):
    weekly = "weekly"
    phased = "phased"


class InsightGenerateRequest(BaseModel):
    type: InsightType
    target: str


class InsightGenerateResponse(BaseModel):
    type: InsightType
    target: str
    path: str
    content: str
