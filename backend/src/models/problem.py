from __future__ import annotations

from datetime import datetime, UTC
from enum import Enum

from pydantic import BaseModel, Field, field_validator


class SolutionImageMeta(BaseModel):
    """Metadata for a solution image attached to a problem."""
    id: str
    filename: str
    mime_type: str
    size_bytes: int
    relative_path: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class ProblemStatus(str, Enum):
    solved = "solved"
    attempted = "attempted"
    unsolved = "unsolved"


class SolutionStatus(str, Enum):
    none = "none"
    queued = "queued"
    running = "running"
    done = "done"
    failed = "failed"


class TranslationStatus(str, Enum):
    none = "none"
    running = "running"
    done = "done"
    failed = "failed"


def now_utc() -> datetime:
    return datetime.now(UTC)


class ProblemInput(BaseModel):
    source: str = Field(min_length=1)
    id: str = Field(min_length=1)
    title: str = Field(min_length=1)
    url: str = ""
    content: str = ""
    input_format: str = ""
    output_format: str = ""
    constraints: str = ""
    reflection: str = ""
    tags: list[str] = Field(default_factory=list)
    difficulty: int | None = None
    status: ProblemStatus = ProblemStatus.unsolved
    my_ac_code: str = ""
    my_ac_language: str = ""

    @field_validator("difficulty", mode="before")
    @classmethod
    def _normalize_difficulty(cls, value):
        if value is None:
            return None
        if isinstance(value, bool):
            return None
        if isinstance(value, int):
            return value if value >= 0 else None
        if isinstance(value, float):
            if value < 0:
                return None
            return int(value)

        text = str(value).strip()
        if not text:
            return None
        if text.lower() in {"unknown", "null", "none", "nan", "n/a"}:
            return None

        if text.isdigit():
            return int(text)

        digits = "".join(ch for ch in text if ch.isdigit())
        if digits:
            return int(digits)
        return None


class ProblemRecord(ProblemInput):
    solution_images: list[SolutionImageMeta] = Field(default_factory=list)
    needs_solution: bool = True
    solution_status: SolutionStatus = SolutionStatus.none
    solution_updated_at: datetime | None = None
    solved_at: datetime | None = None
    translated_title: str = ""
    translated_content: str = ""
    translated_input_format: str = ""
    translated_output_format: str = ""
    translated_constraints: str = ""
    translation_status: TranslationStatus = TranslationStatus.none
    translation_error: str | None = None
    translation_updated_at: datetime | None = None
    created_at: datetime = Field(default_factory=now_utc)
    updated_at: datetime = Field(default_factory=now_utc)

    def key(self) -> str:
        return f"{self.source}:{self.id}"


class ProblemImportRequest(BaseModel):
    problems: list[ProblemInput]


class ProblemImportResponse(BaseModel):
    imported: int
    updated: int
    records: list[ProblemRecord]


class ProblemStatusPatchRequest(BaseModel):
    status: ProblemStatus


class ProblemAcCodeUpdateRequest(BaseModel):
    code: str = ""
    language: str = ""
    mark_solved: bool = True


class ProblemReflectionUpdateRequest(BaseModel):
    reflection: str = ""


class ProblemDifficultyUpdateRequest(BaseModel):
    difficulty: int | None = Field(default=None, ge=0)


class ProblemInfoUpdateRequest(BaseModel):
    title: str | None = None
    content: str | None = None
    input_format: str | None = None
    output_format: str | None = None
    constraints: str | None = None
    reflection: str | None = None
    tags: list[str] | None = None
    difficulty: int | None = Field(default=None, ge=0)
    status: ProblemStatus | None = None


class ProblemTranslateRequest(BaseModel):
    force: bool = False


class ProblemTranslationPayload(BaseModel):
    title_zh: str = ""
    content_zh: str = ""
    input_format_zh: str = ""
    output_format_zh: str = ""
    constraints_zh: str = ""


class ProblemDeleteResponse(BaseModel):
    source: str
    id: str
    deleted: bool
    removed_markdown_files: int = 0
    removed_solution_files: int = 0
    removed_tasks: int = 0


class ProblemAutoTagResponse(BaseModel):
    record: ProblemRecord
    used_solution: bool = False
    notice: str | None = None


class ProblemListResponse(BaseModel):
    month: str | None = None
    source: str | None = None
    status: ProblemStatus | None = None
    keyword: str | None = None
    total: int
    items: list[ProblemRecord]
