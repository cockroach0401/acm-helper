from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import ValidationError

from ..models.settings import (
    AIProfile,
    AIProfileCreateRequest,
    AIProfileUpdateRequest,
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


def _normalize_model_selection(model: str, model_options: list[str]) -> tuple[str, list[str]]:
    options: list[str] = []
    for raw in model_options:
        value = raw.strip()
        if value and value not in options:
            options.append(value)

    selected = (model or "").strip()
    if not selected:
        selected = options[0] if options else "gpt-4o-mini"

    if selected not in options:
        options.append(selected)
    return selected, options


def _validate_profile_name(name: str) -> str:
    normalized = (name or "").strip()
    if not normalized:
        raise HTTPException(status_code=400, detail="profile name cannot be empty")
    return normalized


@router.get("")
def get_settings(fm: FileManager = Depends(get_file_manager)):
    return fm.get_settings().model_dump(mode="json")


@router.get("/ai/profiles")
def list_ai_profiles(fm: FileManager = Depends(get_file_manager)):
    return fm.get_settings().ai.model_dump(mode="json")


@router.put("/ai")
def update_ai_settings(
    req: AISettingsUpdateRequest,
    fm: FileManager = Depends(get_file_manager),
):
    current = fm.get_settings()
    active = current.ai.resolve_active_profile()
    model, options = _normalize_model_selection(req.model, req.model_options)

    profile = AIProfile(
        id=active.id,
        name=active.name,
        provider=req.provider,
        api_base=req.api_base.strip(),
        api_key=req.api_key.strip(),
        model=model,
        model_options=options,
        temperature=req.temperature,
        timeout_seconds=req.timeout_seconds,
    )
    settings = fm.update_ai_settings(profile)
    return settings.model_dump(mode="json")


@router.post("/ai/profiles")
def create_ai_profile(
    req: AIProfileCreateRequest,
    fm: FileManager = Depends(get_file_manager),
):
    name = _validate_profile_name(req.name)
    model, options = _normalize_model_selection(req.model, req.model_options)
    profile = AIProfile(
        id=f"profile-{uuid.uuid4().hex[:8]}",
        name=name,
        provider=req.provider,
        api_base=req.api_base.strip(),
        api_key=req.api_key.strip(),
        model=model,
        model_options=options,
        temperature=req.temperature,
        timeout_seconds=req.timeout_seconds,
    )
    settings = fm.add_ai_profile(profile, set_active=req.set_active)
    return settings.model_dump(mode="json")


@router.put("/ai/profiles/{profile_id}")
def update_ai_profile(
    profile_id: str,
    req: AIProfileUpdateRequest,
    fm: FileManager = Depends(get_file_manager),
):
    name = _validate_profile_name(req.name)
    model, options = _normalize_model_selection(req.model, req.model_options)
    profile = AIProfile(
        id=profile_id,
        name=name,
        provider=req.provider,
        api_base=req.api_base.strip(),
        api_key=req.api_key.strip(),
        model=model,
        model_options=options,
        temperature=req.temperature,
        timeout_seconds=req.timeout_seconds,
    )
    try:
        settings = fm.update_ai_profile(profile_id, profile)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return settings.model_dump(mode="json")


@router.post("/ai/profiles/{profile_id}/activate")
def activate_ai_profile(
    profile_id: str,
    fm: FileManager = Depends(get_file_manager),
):
    try:
        settings = fm.activate_ai_profile(profile_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return settings.model_dump(mode="json")


@router.delete("/ai/profiles/{profile_id}")
def delete_ai_profile(
    profile_id: str,
    fm: FileManager = Depends(get_file_manager),
):
    try:
        settings = fm.delete_ai_profile(profile_id)
    except ValueError as exc:
        message = str(exc)
        status = 404 if message == "profile not found" else 400
        raise HTTPException(status_code=status, detail=message) from exc
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


@router.post("/ai/profiles/{profile_id}/test")
async def test_ai_connection_by_profile(
    profile_id: str,
    fm: FileManager = Depends(get_file_manager),
    ai_client: AIClient = Depends(get_ai_client),
):
    profile = fm.get_ai_profile(profile_id)
    if profile is None:
        raise HTTPException(status_code=404, detail="profile not found")

    ai_settings = AISettings(active_profile_id=profile.id, profiles=[profile])
    try:
        preview = await ai_client.test_connection(ai_settings)
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


@router.delete("/ai/model/{model_name}")
def delete_model_option(
    model_name: str,
    fm: FileManager = Depends(get_file_manager),
):
    settings = fm.remove_model_option(model_name)
    return settings.model_dump(mode="json")
