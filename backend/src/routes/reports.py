from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from ..models.stats import InsightGenerateRequest, InsightType
from ..routes.stats import generate_insight
from ..storage.file_manager import FileManager
from ..services.stats_gen import InsightGenerator
from .shared import get_file_manager, get_insight_generator

router = APIRouter(prefix="/api/reports", tags=["reports"])


def _phased_target(start_week: str, end_week: str) -> str:
    return f"{start_week}__{end_week}"


@router.post("/weekly/{week}/generate")
async def generate_weekly_report(
    week: str,
    fm: FileManager = Depends(get_file_manager),
    insight_generator: InsightGenerator = Depends(get_insight_generator),
):
    req = InsightGenerateRequest(type=InsightType.weekly, target=week)
    return await generate_insight(req, fm=fm, insight_generator=insight_generator)


@router.get("/weekly/{week}/status")
def weekly_report_status(week: str, fm: FileManager = Depends(get_file_manager)):
    return fm.get_insight_status("weekly", week).model_dump(mode="json")


@router.get("/weekly/{week}")
def get_weekly_report(week: str, fm: FileManager = Depends(get_file_manager)):
    content = fm.read_insight("weekly", week)
    if content is None:
        raise HTTPException(status_code=404, detail="Weekly report not found")
    return {"type": "weekly", "target": week, "content": content}


@router.post("/phased/{start_week}/{end_week}/generate")
async def generate_phased_report(
    start_week: str,
    end_week: str,
    fm: FileManager = Depends(get_file_manager),
    insight_generator: InsightGenerator = Depends(get_insight_generator),
):
    target = _phased_target(start_week, end_week)
    req = InsightGenerateRequest(type=InsightType.phased, target=target)
    return await generate_insight(req, fm=fm, insight_generator=insight_generator)


@router.get("/phased/{start_week}/{end_week}/status")
def phased_report_status(
    start_week: str,
    end_week: str,
    fm: FileManager = Depends(get_file_manager),
):
    target = _phased_target(start_week, end_week)
    return fm.get_insight_status("phased", target).model_dump(mode="json")


@router.get("/phased/{start_week}/{end_week}")
def get_phased_report(
    start_week: str,
    end_week: str,
    fm: FileManager = Depends(get_file_manager),
):
    target = _phased_target(start_week, end_week)
    content = fm.read_insight("phased", target)
    if content is None:
        raise HTTPException(status_code=404, detail="Phased report not found")
    return {"type": "phased", "target": target, "content": content}
