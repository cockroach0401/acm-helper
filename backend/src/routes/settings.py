from __future__ import annotations

import sys
import uuid
from pathlib import Path

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
from .shared import get_ai_client, get_file_manager, persist_storage_base_dir, resolve_storage_base_dir

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


def _enable_high_dpi_for_dialog() -> None:
    if sys.platform != "win32":
        return

    try:
        import ctypes
    except Exception:
        return

    try:
        user32 = ctypes.windll.user32
        # DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2
        if user32.SetProcessDpiAwarenessContext(ctypes.c_void_p(-4)):
            return
    except Exception:
        pass

    try:
        shcore = ctypes.windll.shcore
        # PROCESS_PER_MONITOR_DPI_AWARE
        if shcore.SetProcessDpiAwareness(2) == 0:
            return
    except Exception:
        pass

    try:
        user32 = ctypes.windll.user32
        user32.SetProcessDPIAware()
    except Exception:
        pass


def _apply_tk_scaling(root) -> None:
    try:
        dpi = float(root.winfo_fpixels("1i"))
        if dpi <= 0:
            return
        target_scaling = dpi / 72.0
        current_scaling = float(root.tk.call("tk", "scaling"))
        if abs(target_scaling - current_scaling) > 0.05:
            root.tk.call("tk", "scaling", target_scaling)
    except Exception:
        pass


def _pick_directory_from_system_dialog(initial_dir: str) -> tuple[bool, str]:
    _enable_high_dpi_for_dialog()

    try:
        import tkinter as tk
        from tkinter import filedialog
    except Exception as exc:  # pragma: no cover - platform/runtime dependent
        raise RuntimeError("tkinter is unavailable in current environment") from exc

    root = tk.Tk()
    _apply_tk_scaling(root)
    root.withdraw()
    try:
        root.attributes("-topmost", True)
    except Exception:
        pass
    try:
        selected = filedialog.askdirectory(
            initialdir=initial_dir or None,
            mustexist=False,
            title="Select ACM Helper Storage Directory",
        )
    finally:
        root.destroy()

    if not selected:
        return False, ""
    return True, str(Path(selected).expanduser().resolve())


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


@router.post("/storage/pick-directory")
async def pick_storage_directory(
    fm: FileManager = Depends(get_file_manager),
):
    initial_dir = fm.get_storage_base_dir()
    try:
        selected, path = _pick_directory_from_system_dialog(initial_dir)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"failed to open directory picker: {exc}") from exc
    return {"selected": selected, "path": path}


@router.put("/ui")
def update_ui_settings(
    req: UiSettingsUpdateRequest,
    fm: FileManager = Depends(get_file_manager),
):
    current = fm.get_settings()

    next_default_language = req.default_ac_language or current.ui.default_ac_language
    next_storage_base = fm.get_storage_base_dir()

    if req.storage_base_dir is not None:
        try:
            resolved_target = resolve_storage_base_dir(req.storage_base_dir)
        except (OSError, RuntimeError, ValueError) as exc:
            raise HTTPException(status_code=400, detail=f"invalid storage_base_dir: {exc}") from exc

        if str(resolved_target) != fm.get_storage_base_dir():
            if fm.has_active_solution_tasks():
                raise HTTPException(
                    status_code=409,
                    detail="cannot switch storage while solution tasks are queued or running",
                )
            try:
                fm.switch_storage_base(resolved_target, conflict_mode="rename")
            except ValueError as exc:
                raise HTTPException(status_code=400, detail=str(exc)) from exc
            except OSError as exc:
                raise HTTPException(status_code=500, detail=f"failed to migrate storage directory: {exc}") from exc

            try:
                persist_storage_base_dir(resolved_target)
            except OSError as exc:
                raise HTTPException(status_code=500, detail=f"failed to persist storage directory: {exc}") from exc

        next_storage_base = str(resolved_target)

    ui = UiSettings(
        default_ac_language=next_default_language,
        storage_base_dir=next_storage_base,
    )
    settings = fm.update_ui_settings(ui)
    return settings.model_dump(mode="json")


@router.delete("/ai/model/{model_name}")
def delete_model_option(
    model_name: str,
    fm: FileManager = Depends(get_file_manager),
):
    settings = fm.remove_model_option(model_name)
    return settings.model_dump(mode="json")
