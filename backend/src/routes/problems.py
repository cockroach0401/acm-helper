from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from ..models.problem import (
    ProblemAcCodeUpdateRequest,
    ProblemDeleteResponse,
    ProblemDifficultyUpdateRequest,
    ProblemInfoUpdateRequest,
    ProblemImportRequest,
    ProblemImportResponse,
    ProblemListResponse,
    ProblemReflectionUpdateRequest,
    ProblemStatusPatchRequest,
    ProblemStatus,
    ProblemRecord,
    ProblemTranslateRequest,
    TranslationStatus,
)
from ..services.translator import ProblemTranslator
from ..storage.file_manager import FileManager
from .shared import get_file_manager, get_problem_translator

router = APIRouter(prefix="/api/problems", tags=["problems"])


@router.post("/import", response_model=ProblemImportResponse)
def import_problems(
    req: ProblemImportRequest,
    fm: FileManager = Depends(get_file_manager),
) -> ProblemImportResponse:
    imported, updated, records = fm.upsert_problems(req.problems)
    return ProblemImportResponse(imported=imported, updated=updated, records=records)


@router.get("/{source}/{problem_id}", response_model=ProblemRecord)
def get_problem(
    source: str,
    problem_id: str,
    fm: FileManager = Depends(get_file_manager),
) -> ProblemRecord:
    record = fm.get_problem(source, problem_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Problem not found")
    return record


@router.put("/{source}/{problem_id}", response_model=ProblemRecord)
def update_problem_info(
    source: str,
    problem_id: str,
    req: ProblemInfoUpdateRequest,
    fm: FileManager = Depends(get_file_manager),
) -> ProblemRecord:
    payload = req.model_dump(exclude_unset=True)
    record = fm.update_problem_info(
        source,
        problem_id,
        title=payload.get("title"),
        content=payload.get("content"),
        input_format=payload.get("input_format"),
        output_format=payload.get("output_format"),
        constraints=payload.get("constraints"),
        reflection=payload.get("reflection"),
        tags=payload.get("tags"),
        difficulty=payload.get("difficulty"),
        difficulty_set="difficulty" in payload,
        status=payload.get("status"),
    )
    if record is None:
        raise HTTPException(status_code=404, detail="Problem not found")
    return record


@router.patch("/{source}/{problem_id}/status", response_model=ProblemRecord)
@router.put("/{source}/{problem_id}/status", response_model=ProblemRecord)
def patch_problem_status(
    source: str,
    problem_id: str,
    req: ProblemStatusPatchRequest,
    fm: FileManager = Depends(get_file_manager),
) -> ProblemRecord:
    record = fm.patch_problem_status(source, problem_id, req.status)
    if record is None:
        raise HTTPException(status_code=404, detail="Problem not found")
    return record


@router.put("/{source}/{problem_id}/ac-code", response_model=ProblemRecord)
def update_problem_ac_code(
    source: str,
    problem_id: str,
    req: ProblemAcCodeUpdateRequest,
    fm: FileManager = Depends(get_file_manager),
) -> ProblemRecord:
    record = fm.update_problem_ac_code(
        source,
        problem_id,
        code=req.code,
        language=req.language,
        mark_solved=req.mark_solved,
    )
    if record is None:
        raise HTTPException(status_code=404, detail="Problem not found")
    return record


@router.get("/{source}/{problem_id}/markdown")
def get_problem_markdown(
    source: str,
    problem_id: str,
    fm: FileManager = Depends(get_file_manager),
):
    content = fm.get_problem_markdown(source, problem_id)
    if content is None:
        raise HTTPException(status_code=404, detail="Problem not found")
    return {"source": source, "id": problem_id, "content": content}


@router.get("", response_model=ProblemListResponse)
def list_problems(
    month: str | None = None,
    source: str | None = None,
    status: ProblemStatus | None = None,
    keyword: str | None = None,
    fm: FileManager = Depends(get_file_manager),
) -> ProblemListResponse:
    records = fm.list_problems_filtered(month=month, source=source, status=status, keyword=keyword)
    return ProblemListResponse(
        month=month,
        source=source,
        status=status,
        keyword=keyword,
        total=len(records),
        items=records,
    )


@router.delete("/{source}/{problem_id}", response_model=ProblemDeleteResponse)
def delete_problem(
    source: str,
    problem_id: str,
    fm: FileManager = Depends(get_file_manager),
) -> ProblemDeleteResponse:
    result = fm.delete_problem(source, problem_id)
    if not result.deleted:
        raise HTTPException(status_code=404, detail="Problem not found")
    return result


@router.post("/{source}/{problem_id}/translate", response_model=ProblemRecord)
async def translate_problem(
    source: str,
    problem_id: str,
    req: ProblemTranslateRequest | None = None,
    fm: FileManager = Depends(get_file_manager),
    translator: ProblemTranslator = Depends(get_problem_translator),
) -> ProblemRecord:
    record = fm.get_problem(source, problem_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Problem not found")
    if record.source.lower() != "codeforces":
        raise HTTPException(status_code=400, detail="Only codeforces problems support translation")

    force_retranslate = req.force if req is not None else False

    if not force_retranslate and record.translation_status == TranslationStatus.done and record.translated_content.strip():
        return record

    running = fm.mark_problem_translation_running(source, problem_id)
    if running is None:
        raise HTTPException(status_code=404, detail="Problem not found")

    try:
        settings = fm.get_settings()
        payload = await translator.translate_to_zh(running, settings.ai)
        updated = fm.set_problem_translation(source, problem_id, payload)
        if updated is None:
            raise HTTPException(status_code=404, detail="Problem not found")
        return updated
    except HTTPException:
        raise
    except Exception as exc:
        fm.mark_problem_translation_failed(source, problem_id, str(exc))
        raise HTTPException(status_code=500, detail=f"Translation failed: {exc}")


@router.put("/{source}/{problem_id}/reflection", response_model=ProblemRecord)
def update_problem_reflection(
    source: str,
    problem_id: str,
    req: ProblemReflectionUpdateRequest,
    fm: FileManager = Depends(get_file_manager),
) -> ProblemRecord:
    record = fm.update_problem_reflection(source, problem_id, req.reflection)
    if record is None:
        raise HTTPException(status_code=404, detail="Problem not found")
    return record


@router.put("/{source}/{problem_id}/difficulty", response_model=ProblemRecord)
def update_problem_difficulty(
    source: str,
    problem_id: str,
    req: ProblemDifficultyUpdateRequest,
    fm: FileManager = Depends(get_file_manager),
) -> ProblemRecord:
    record = fm.update_problem_difficulty(source, problem_id, req.difficulty)
    if record is None:
        raise HTTPException(status_code=404, detail="Problem not found")
    return record
