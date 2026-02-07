from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import ValidationError

from ..models.settings import (
    AIProvider,
    AISettings,
    AISettingsUpdateRequest,
    DEFAULT_INSIGHT_TEMPLATE,
    PromptSettings,
    PromptSettingsUpdateRequest,
    UiSettings,
    UiSettingsUpdateRequest,
    WeeklyPromptStyle,
)
from ..services.ai_client import AIClient
from ..storage.file_manager import FileManager
from .shared import get_ai_client, get_file_manager

router = APIRouter(prefix="/api/settings", tags=["settings"])


@router.get("")
def get_settings(fm: FileManager = Depends(get_file_manager)):
    return fm.get_settings().model_dump(mode="json")


@router.put("/ai")
def update_ai_settings(
    req: AISettingsUpdateRequest,
    fm: FileManager = Depends(get_file_manager),
):
    if req.provider != AIProvider.mock:
        if not req.api_base.strip():
            raise HTTPException(status_code=400, detail="api_base cannot be empty for non-mock provider")
        if not req.api_key.strip():
            raise HTTPException(status_code=400, detail="api_key cannot be empty for non-mock provider")

    options = [m.strip() for m in req.model_options if m.strip()]
    if not options:
        options = [req.model.strip() or "gpt-4o-mini"]
    model = req.model.strip() or options[0]
    if model not in options:
        options.append(model)

    payload = req.model_dump()
    payload["model"] = model
    payload["model_options"] = options
    ai = AISettings(**payload)
    settings = fm.update_ai_settings(ai)
    return settings.model_dump(mode="json")


@router.put("/prompts")
def update_prompt_settings(
    req: PromptSettingsUpdateRequest,
    fm: FileManager = Depends(get_file_manager),
):
    if not req.solution_template.strip():
        raise HTTPException(status_code=400, detail="solution_template cannot be empty")

    current = fm.get_settings()

    insight_template = req.insight_template
    if insight_template is None:
        insight_template = current.prompts.insight_template or DEFAULT_INSIGHT_TEMPLATE
    if not insight_template.strip():
        raise HTTPException(status_code=400, detail="insight_template cannot be empty")

    weekly_prompt_style = req.weekly_prompt_style
    if weekly_prompt_style is None:
        weekly_prompt_style = current.prompts.weekly_prompt_style or WeeklyPromptStyle.custom

    payload = {
        "solution_template": req.solution_template,
        "insight_template": insight_template,
        "weekly_prompt_style": weekly_prompt_style,
        "weekly_style_custom_injection": req.weekly_style_custom_injection
        if req.weekly_style_custom_injection is not None
        else current.prompts.weekly_style_custom_injection,
        "weekly_style_rigorous_injection": req.weekly_style_rigorous_injection
        if req.weekly_style_rigorous_injection is not None
        else current.prompts.weekly_style_rigorous_injection,
        "weekly_style_intuitive_injection": req.weekly_style_intuitive_injection
        if req.weekly_style_intuitive_injection is not None
        else current.prompts.weekly_style_intuitive_injection,
        "weekly_style_concise_injection": req.weekly_style_concise_injection
        if req.weekly_style_concise_injection is not None
        else current.prompts.weekly_style_concise_injection,
    }

    try:
        prompts = PromptSettings(**payload)
    except ValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    settings = fm.update_prompt_settings(prompts)
    return settings.model_dump(mode="json")


@router.post("/ai/test")
async def test_ai_connection(
    fm: FileManager = Depends(get_file_manager),
    ai_client: AIClient = Depends(get_ai_client),
):
    settings = fm.get_settings()
    try:
        preview = await ai_client.test_connection(settings.ai)
        return {"ok": True, "preview": preview}
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.put("/ui")
def update_ui_settings(
    req: UiSettingsUpdateRequest,
    fm: FileManager = Depends(get_file_manager),
):
    ui = UiSettings(**req.model_dump())
    settings = fm.update_ui_settings(ui)
    return settings.model_dump(mode="json")
