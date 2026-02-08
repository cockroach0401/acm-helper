from __future__ import annotations

import json
import os
import threading
import uuid
from datetime import datetime, UTC
from pathlib import Path

from pydantic import ValidationError

from ..models.problem import (
    ProblemDeleteResponse,
    ProblemInput,
    ProblemRecord,
    ProblemStatus,
    ProblemTranslationPayload,
    SolutionStatus,
    TranslationStatus,
)
from ..models.settings import AIProfile, AIProvider, AISettings, PromptSettings, SettingsBundle, UiSettings
from ..models.solution import ReportStatusResponse
from ..models.task import SolutionTaskRecord, TaskStatus


def now_utc() -> datetime:
    return datetime.now(UTC)


def current_month() -> str:
    return now_utc().strftime("%Y-%m")


def month_from_dt(dt: datetime) -> str:
    return dt.astimezone(UTC).strftime("%Y-%m")


def problem_key(source: str, problem_id: str) -> str:
    return f"{source}:{problem_id}"


class FileManager:
    def __init__(self, base_dir: Path):
        self.base = base_dir
        self.base.mkdir(parents=True, exist_ok=True)
        self.problems_file = self.base / "problems.json"
        self.tasks_file = self.base / "tasks.json"
        self.reports_file = self.base / "reports.json"
        self.settings_file = self.base / "settings.json"
        self._lock = threading.RLock()
        self._ensure_json_file(self.problems_file, {})
        self._ensure_json_file(self.tasks_file, {})
        self._ensure_json_file(self.reports_file, {})
        self._ensure_json_file(self.settings_file, self._build_default_settings().model_dump(mode="json"))

    def _problem_md_path(self, record: ProblemRecord) -> Path:
        month = month_from_dt(record.created_at)
        problem_dir = self.base / month / "problems"
        problem_dir.mkdir(parents=True, exist_ok=True)
        return problem_dir / f"{record.source}_{record.id}.md"

    def _iter_problem_markdown_paths(self, source: str, problem_id: str) -> list[Path]:
        filename = f"{source}_{problem_id}.md"
        return sorted(self.base.glob(f"*/problems/{filename}"))

    def _iter_solution_markdown_paths(self, source: str, problem_id: str) -> list[Path]:
        filename = f"{source}_{problem_id}.md"
        return sorted(self.base.glob(f"*/solutions/{filename}"))

    def _build_problem_markdown(self, record: ProblemRecord) -> str:
        tags = ", ".join(record.tags) if record.tags else ""
        lines = [
            "# Problem",
            "",
            f"- source: {record.source}",
            f"- id: {record.id}",
            f"- title: {record.title}",
            f"- status: {record.status.value}",
            f"- needs_solution: {str(record.needs_solution).lower()}",
            f"- solution_status: {record.solution_status.value}",
            f"- solved_at: {record.solved_at.isoformat() if record.solved_at else ''}",
            f"- difficulty: {record.difficulty or ''}",
            f"- tags: {tags}",
            f"- created_at: {record.created_at.isoformat()}",
            f"- updated_at: {record.updated_at.isoformat()}",
            "",
            "## Description",
            record.content or "",
            "",
            "## Input Format",
            record.input_format or "",
            "",
            "## Output Format",
            record.output_format or "",
            "",
            "## Constraints",
            record.constraints or "",
            "",
            "## Reflection",
            record.reflection or "",
            "",
        ]

        if record.source.lower() == "codeforces":
            lines.extend(
                [
                    "## Chinese Translation",
                    f"- translation_status: {record.translation_status.value}",
                    f"- translation_updated_at: {record.translation_updated_at.isoformat() if record.translation_updated_at else ''}",
                    f"- translation_error: {record.translation_error or ''}",
                    "",
                    "### Title (ZH)",
                    record.translated_title or "(empty)",
                    "",
                    "### Description (ZH)",
                    record.translated_content or "(empty)",
                    "",
                    "### Input Format (ZH)",
                    record.translated_input_format or "(empty)",
                    "",
                    "### Output Format (ZH)",
                    record.translated_output_format or "(empty)",
                    "",
                    "### Constraints (ZH)",
                    record.translated_constraints or "(empty)",
                    "",
                ]
            )

        lines.append("## My AC Code")

        if record.my_ac_code.strip():
            language = record.my_ac_language.strip() or "text"
            lines.extend(
                [
                    f"```{language}",
                    record.my_ac_code.rstrip(),
                    "```",
                ]
            )
        else:
            lines.append("(empty)")

        lines.extend(
            [
                "",
                "<!-- TODO(scraper): after future scraping flow completes, prompt user to submit AC code immediately. -->",
                "<!-- TODO(scraper): reuse /api/problems/{source}/{id}/ac-code endpoint for popup submit action. -->",
            ]
        )
        return "\n".join(lines).rstrip() + "\n"

    def _normalize_ac_language(self, language: str, default_language: str = "cpp") -> str:
        value = (language or "").strip().lower()
        if value in {"c", "gnu c", "gcc"}:
            return "c"
        if value in {"cpp", "c++", "cc", "cxx"}:
            return "cpp"
        if value in {"python", "py", "python3"}:
            return "python"
        if value in {"java", "jdk"}:
            return "java"
        return default_language

    def _save_problem_markdown(self, record: ProblemRecord) -> str:
        md_path = self._problem_md_path(record)
        md_path.write_text(self._build_problem_markdown(record), encoding="utf-8")
        return str(md_path)

    def _ensure_json_file(self, path: Path, default_obj: dict) -> None:
        if not path.exists():
            path.write_text(json.dumps(default_obj, ensure_ascii=False, indent=2), encoding="utf-8")

    def _read_json(self, path: Path) -> dict:
        if not path.exists():
            return {}
        text = path.read_text(encoding="utf-8").strip()
        if not text:
            return {}
        try:
            obj = json.loads(text)
            if isinstance(obj, dict):
                return obj
            return {}
        except json.JSONDecodeError:
            return {}

    def _write_json(self, path: Path, obj: dict) -> None:
        path.write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding="utf-8")

    def _status_to_needs(self, status: ProblemStatus) -> bool:
        return status in {ProblemStatus.unsolved, ProblemStatus.attempted}

    def _build_default_settings(self) -> SettingsBundle:
        profile = self._build_default_ai_profile()
        ai = AISettings(active_profile_id=profile.id, profiles=[profile])
        return SettingsBundle(ai=ai, prompts=PromptSettings())

    def _build_default_ai_profile(self) -> AIProfile:
        provider_raw = os.getenv("AI_PROVIDER", "").strip().lower()
        provider = AIProvider.openai_compatible
        if provider_raw in {"anthropic", "claude"}:
            provider = AIProvider.anthropic

        model = os.getenv("AI_MODEL", "gpt-4o-mini").strip() or "gpt-4o-mini"
        return AIProfile(
            id="default-1",
            name="Default",
            provider=provider,
            api_base=os.getenv("AI_API_BASE", "").strip(),
            api_key=os.getenv("AI_API_KEY", "").strip(),
            model=model,
            model_options=[model],
            temperature=float(os.getenv("AI_TEMPERATURE", "0.2")),
            timeout_seconds=int(os.getenv("AI_TIMEOUT_SECONDS", "120")),
        )

    def upsert_problems(self, items: list[ProblemInput]) -> tuple[int, int, list[ProblemRecord]]:
        with self._lock:
            data = self._read_json(self.problems_file)
            settings = self.get_settings()
            default_lang = settings.ui.default_ac_language.value
            imported = 0
            updated = 0
            result: list[ProblemRecord] = []

            for item in items:
                key = problem_key(item.source, item.id)
                now = now_utc()
                existing_raw = data.get(key)
                if existing_raw:
                    try:
                        existing = ProblemRecord.model_validate(existing_raw)
                    except ValidationError:
                        existing = None
                else:
                    existing = None

                default_needs_solution = self._status_to_needs(item.status)

                if existing is None:
                    payload = item.model_dump()
                    payload["my_ac_language"] = self._normalize_ac_language(
                        item.my_ac_language,
                        default_language=default_lang,
                    )
                    record = ProblemRecord(
                        **payload,
                        needs_solution=default_needs_solution,
                        solution_status=SolutionStatus.none,
                        solved_at=now if item.status == ProblemStatus.solved else None,
                        translation_status=TranslationStatus.none,
                        translation_error=None,
                        translation_updated_at=None,
                        created_at=now,
                        updated_at=now,
                    )
                    imported += 1
                else:
                    current_solution_status = existing.solution_status
                    has_done_solution = current_solution_status == SolutionStatus.done
                    payload = item.model_dump()
                    payload.pop("my_ac_code", None)
                    payload.pop("my_ac_language", None)
                    payload.pop("reflection", None)
                    keep_code = existing.my_ac_code if not item.my_ac_code.strip() else item.my_ac_code
                    keep_language = existing.my_ac_language if not item.my_ac_language.strip() else item.my_ac_language
                    keep_language = self._normalize_ac_language(keep_language, default_language=default_lang)
                    keep_reflection = existing.reflection if not item.reflection.strip() else item.reflection
                    record = ProblemRecord(
                        **payload,
                        my_ac_code=keep_code,
                        my_ac_language=keep_language,
                        reflection=keep_reflection,
                        needs_solution=default_needs_solution and not has_done_solution,
                        solution_status=current_solution_status,
                        solution_updated_at=existing.solution_updated_at,
                        solved_at=now if item.status == ProblemStatus.solved else existing.solved_at,
                        translated_title=existing.translated_title,
                        translated_content=existing.translated_content,
                        translated_input_format=existing.translated_input_format,
                        translated_output_format=existing.translated_output_format,
                        translated_constraints=existing.translated_constraints,
                        translation_status=existing.translation_status,
                        translation_error=existing.translation_error,
                        translation_updated_at=existing.translation_updated_at,
                        created_at=existing.created_at,
                        updated_at=now,
                    )
                    updated += 1

                data[key] = record.model_dump(mode="json")
                self._save_problem_markdown(record)
                result.append(record)

            self._write_json(self.problems_file, data)
            return imported, updated, result

    def get_problem(self, source: str, problem_id: str) -> ProblemRecord | None:
        return self.get_problem_by_key(problem_key(source, problem_id))

    def get_problem_by_key(self, key: str) -> ProblemRecord | None:
        with self._lock:
            data = self._read_json(self.problems_file)
            raw = data.get(key)
            if raw is None:
                return None
            try:
                return ProblemRecord.model_validate(raw)
            except ValidationError:
                return None

    def list_problems(self, month: str | None = None) -> list[ProblemRecord]:
        with self._lock:
            data = self._read_json(self.problems_file)
            records: list[ProblemRecord] = []
            for raw in data.values():
                try:
                    record = ProblemRecord.model_validate(raw)
                    if month and month_from_dt(record.created_at) != month:
                        continue
                    records.append(record)
                except ValidationError:
                    continue
            records.sort(key=lambda x: x.updated_at, reverse=True)
            return records

    def list_problems_filtered(
        self,
        *,
        month: str | None = None,
        source: str | None = None,
        status: ProblemStatus | None = None,
        keyword: str | None = None,
    ) -> list[ProblemRecord]:
        records = self.list_problems(month)
        source_norm = (source or "").strip().lower()
        keyword_norm = (keyword or "").strip().lower()

        filtered: list[ProblemRecord] = []
        for record in records:
            if source_norm and record.source.lower() != source_norm:
                continue
            if status is not None and record.status != status:
                continue
            if keyword_norm:
                haystack = "\n".join(
                    [
                        record.source,
                        record.id,
                        record.title,
                        record.content,
                        record.input_format,
                        record.output_format,
                        record.constraints,
                        record.reflection,
                        " ".join(record.tags),
                        record.difficulty or "",
                    ]
                ).lower()
                if keyword_norm not in haystack:
                    continue
            filtered.append(record)

        return filtered

    def list_pending_problems(self, month: str | None = None) -> list[ProblemRecord]:
        problems = self.list_problems(month)
        pending: list[ProblemRecord] = []
        for p in problems:
            if p.needs_solution and p.solution_status != SolutionStatus.done:
                pending.append(p)
        return pending

    def patch_problem_status(self, source: str, problem_id: str, status: ProblemStatus) -> ProblemRecord | None:
        key = problem_key(source, problem_id)
        with self._lock:
            data = self._read_json(self.problems_file)
            raw = data.get(key)
            if raw is None:
                return None
            try:
                record = ProblemRecord.model_validate(raw)
            except ValidationError:
                return None

            record.status = status
            if record.solution_status == SolutionStatus.done:
                record.needs_solution = False
            else:
                record.needs_solution = self._status_to_needs(status)

            if status == ProblemStatus.solved and record.solved_at is None:
                record.solved_at = now_utc()
            elif status != ProblemStatus.solved:
                record.solved_at = None

            record.updated_at = now_utc()
            data[key] = record.model_dump(mode="json")
            self._write_json(self.problems_file, data)
            self._save_problem_markdown(record)
            return record

    def set_problem_solution_state(
        self,
        key: str,
        solution_status: SolutionStatus,
        *,
        mark_needs_solution: bool | None = None,
    ) -> ProblemRecord | None:
        with self._lock:
            data = self._read_json(self.problems_file)
            raw = data.get(key)
            if raw is None:
                return None
            try:
                record = ProblemRecord.model_validate(raw)
            except ValidationError:
                return None

            record.solution_status = solution_status
            if mark_needs_solution is None:
                if solution_status == SolutionStatus.done:
                    record.needs_solution = False
                elif solution_status in {SolutionStatus.queued, SolutionStatus.running, SolutionStatus.failed}:
                    record.needs_solution = True
                else:
                    record.needs_solution = self._status_to_needs(record.status)
            else:
                record.needs_solution = mark_needs_solution

            record.solution_updated_at = now_utc()
            record.updated_at = now_utc()
            data[key] = record.model_dump(mode="json")
            self._write_json(self.problems_file, data)
            self._save_problem_markdown(record)
            return record

    def update_problem_ac_code(
        self,
        source: str,
        problem_id: str,
        *,
        code: str,
        language: str,
        mark_solved: bool = True,
    ) -> ProblemRecord | None:
        key = problem_key(source, problem_id)
        with self._lock:
            data = self._read_json(self.problems_file)
            raw = data.get(key)
            if raw is None:
                return None
            try:
                record = ProblemRecord.model_validate(raw)
            except ValidationError:
                return None

            record.my_ac_code = code
            settings = self.get_settings()
            default_lang = settings.ui.default_ac_language.value
            record.my_ac_language = self._normalize_ac_language(language, default_language=default_lang)
            if mark_solved:
                record.status = ProblemStatus.solved
                record.needs_solution = False
                if record.solved_at is None:
                    record.solved_at = now_utc()
            record.updated_at = now_utc()

            data[key] = record.model_dump(mode="json")
            self._write_json(self.problems_file, data)
            self._save_problem_markdown(record)
            return record

    def update_problem_reflection(self, source: str, problem_id: str, reflection: str) -> ProblemRecord | None:
        key = problem_key(source, problem_id)
        with self._lock:
            data = self._read_json(self.problems_file)
            raw = data.get(key)
            if raw is None:
                return None
            try:
                record = ProblemRecord.model_validate(raw)
            except ValidationError:
                return None

            record.reflection = reflection
            record.updated_at = now_utc()

            data[key] = record.model_dump(mode="json")
            self._write_json(self.problems_file, data)
            self._save_problem_markdown(record)
            return record

    def update_problem_difficulty(self, source: str, problem_id: str, difficulty: int | None) -> ProblemRecord | None:
        key = problem_key(source, problem_id)
        with self._lock:
            data = self._read_json(self.problems_file)
            raw = data.get(key)
            if raw is None:
                return None
            try:
                record = ProblemRecord.model_validate(raw)
            except ValidationError:
                return None

            record.difficulty = difficulty
            record.updated_at = now_utc()

            data[key] = record.model_dump(mode="json")
            self._write_json(self.problems_file, data)
            self._save_problem_markdown(record)
            return record

    def update_problem_info(
        self,
        source: str,
        problem_id: str,
        *,
        title: str | None = None,
        content: str | None = None,
        input_format: str | None = None,
        output_format: str | None = None,
        constraints: str | None = None,
        reflection: str | None = None,
        tags: list[str] | None = None,
        difficulty: int | None = None,
        difficulty_set: bool = False,
        status: ProblemStatus | None = None,
    ) -> ProblemRecord | None:
        key = problem_key(source, problem_id)
        with self._lock:
            data = self._read_json(self.problems_file)
            raw = data.get(key)
            if raw is None:
                return None
            try:
                record = ProblemRecord.model_validate(raw)
            except ValidationError:
                return None

            if title is not None:
                record.title = title
            if content is not None:
                record.content = content
            if input_format is not None:
                record.input_format = input_format
            if output_format is not None:
                record.output_format = output_format
            if constraints is not None:
                record.constraints = constraints
            if reflection is not None:
                record.reflection = reflection
            if tags is not None:
                record.tags = tags

            if difficulty_set:
                record.difficulty = difficulty

            if status is not None:
                record.status = status
                if record.solution_status == SolutionStatus.done:
                    record.needs_solution = False
                else:
                    record.needs_solution = self._status_to_needs(status)
                if status == ProblemStatus.solved and record.solved_at is None:
                    record.solved_at = now_utc()
                elif status != ProblemStatus.solved:
                    record.solved_at = None

            record.updated_at = now_utc()

            data[key] = record.model_dump(mode="json")
            self._write_json(self.problems_file, data)
            self._save_problem_markdown(record)
            return record

    def get_problem_markdown(self, source: str, problem_id: str) -> str | None:
        record = self.get_problem(source, problem_id)
        if record is None:
            return None
        md_path = self._problem_md_path(record)
        if md_path.exists():
            return md_path.read_text(encoding="utf-8")
        return self._build_problem_markdown(record)

    def mark_problem_translation_running(self, source: str, problem_id: str) -> ProblemRecord | None:
        key = problem_key(source, problem_id)
        with self._lock:
            data = self._read_json(self.problems_file)
            raw = data.get(key)
            if raw is None:
                return None
            try:
                record = ProblemRecord.model_validate(raw)
            except ValidationError:
                return None

            record.translation_status = TranslationStatus.running
            record.translation_error = None
            record.updated_at = now_utc()

            data[key] = record.model_dump(mode="json")
            self._write_json(self.problems_file, data)
            self._save_problem_markdown(record)
            return record

    def set_problem_translation(
        self,
        source: str,
        problem_id: str,
        payload: ProblemTranslationPayload,
    ) -> ProblemRecord | None:
        key = problem_key(source, problem_id)
        with self._lock:
            data = self._read_json(self.problems_file)
            raw = data.get(key)
            if raw is None:
                return None
            try:
                record = ProblemRecord.model_validate(raw)
            except ValidationError:
                return None

            record.translated_title = payload.title_zh
            record.translated_content = payload.content_zh
            record.translated_input_format = payload.input_format_zh
            record.translated_output_format = payload.output_format_zh
            record.translated_constraints = payload.constraints_zh
            record.translation_status = TranslationStatus.done
            record.translation_error = None
            record.translation_updated_at = now_utc()
            record.updated_at = now_utc()

            data[key] = record.model_dump(mode="json")
            self._write_json(self.problems_file, data)
            self._save_problem_markdown(record)
            return record

    def mark_problem_translation_failed(self, source: str, problem_id: str, error_message: str) -> ProblemRecord | None:
        key = problem_key(source, problem_id)
        with self._lock:
            data = self._read_json(self.problems_file)
            raw = data.get(key)
            if raw is None:
                return None
            try:
                record = ProblemRecord.model_validate(raw)
            except ValidationError:
                return None

            record.translation_status = TranslationStatus.failed
            record.translation_error = error_message
            record.translation_updated_at = now_utc()
            record.updated_at = now_utc()

            data[key] = record.model_dump(mode="json")
            self._write_json(self.problems_file, data)
            self._save_problem_markdown(record)
            return record

    def delete_problem(self, source: str, problem_id: str) -> ProblemDeleteResponse:
        key = problem_key(source, problem_id)
        removed_md = 0
        removed_solution = 0
        removed_tasks = 0
        deleted = False

        with self._lock:
            data = self._read_json(self.problems_file)
            if key in data:
                data.pop(key, None)
                self._write_json(self.problems_file, data)
                deleted = True

            tasks = self._read_json(self.tasks_file)
            kept_tasks: dict[str, dict] = {}
            for task_id, raw in tasks.items():
                problem_key_raw = ""
                if isinstance(raw, dict):
                    problem_key_raw = str(raw.get("problem_key", ""))
                if problem_key_raw == key:
                    removed_tasks += 1
                    continue
                kept_tasks[task_id] = raw
            if removed_tasks > 0:
                self._write_json(self.tasks_file, kept_tasks)

            md_paths = self._iter_problem_markdown_paths(source, problem_id)
            for path in md_paths:
                try:
                    path.unlink(missing_ok=True)
                    removed_md += 1
                except OSError:
                    continue

            solution_paths = self._iter_solution_markdown_paths(source, problem_id)
            for path in solution_paths:
                try:
                    path.unlink(missing_ok=True)
                    removed_solution += 1
                except OSError:
                    continue

        return ProblemDeleteResponse(
            source=source,
            id=problem_id,
            deleted=deleted,
            removed_markdown_files=removed_md,
            removed_solution_files=removed_solution,
            removed_tasks=removed_tasks,
        )

    def create_task(self, key: str) -> SolutionTaskRecord:
        with self._lock:
            tasks = self._read_json(self.tasks_file)
            task_id = uuid.uuid4().hex
            record = SolutionTaskRecord(task_id=task_id, problem_key=key)
            tasks[task_id] = record.model_dump(mode="json")
            self._write_json(self.tasks_file, tasks)
            return record

    def get_task(self, task_id: str) -> SolutionTaskRecord | None:
        with self._lock:
            tasks = self._read_json(self.tasks_file)
            raw = tasks.get(task_id)
            if raw is None:
                return None
            try:
                return SolutionTaskRecord.model_validate(raw)
            except ValidationError:
                return None

    def list_tasks(self) -> list[SolutionTaskRecord]:
        with self._lock:
            tasks = self._read_json(self.tasks_file)
            records: list[SolutionTaskRecord] = []
            for raw in tasks.values():
                try:
                    records.append(SolutionTaskRecord.model_validate(raw))
                except ValidationError:
                    continue
            records.sort(key=lambda x: x.created_at, reverse=True)
            return records

    def update_task(
        self,
        task_id: str,
        *,
        status: TaskStatus | None = None,
        error_message: str | None = None,
        output_path: str | None = None,
        started: bool = False,
        finished: bool = False,
    ) -> SolutionTaskRecord | None:
        with self._lock:
            tasks = self._read_json(self.tasks_file)
            raw = tasks.get(task_id)
            if raw is None:
                return None
            try:
                record = SolutionTaskRecord.model_validate(raw)
            except ValidationError:
                return None

            if status is not None:
                record.status = status
            if error_message is not None:
                record.error_message = error_message
            if output_path is not None:
                record.output_path = output_path
            if started:
                record.started_at = now_utc()
            if finished:
                record.finished_at = now_utc()

            tasks[task_id] = record.model_dump(mode="json")
            self._write_json(self.tasks_file, tasks)
            return record

    def save_solution_file(self, source: str, problem_id: str, content: str) -> str:
        month = current_month()
        solution_dir = self.base / month / "solutions"
        solution_dir.mkdir(parents=True, exist_ok=True)
        path = solution_dir / f"{source}_{problem_id}.md"
        path.write_text(content, encoding="utf-8")
        return str(path)

    def list_solution_files(self, month: str | None = None) -> list[str]:
        month_to_scan = month or current_month()
        solution_dir = self.base / month_to_scan / "solutions"
        if not solution_dir.exists():
            return []
        return [str(p) for p in sorted(solution_dir.glob("*.md"))]

    def read_solution_file(self, source: str, problem_id: str) -> str | None:
        paths = self._iter_solution_markdown_paths(source, problem_id)
        if not paths:
            return None

        best = max(paths, key=lambda p: p.stat().st_mtime)
        if not best.exists():
            return None
        return best.read_text(encoding="utf-8")

    def update_insight_status(
        self,
        insight_type: str,
        target: str,
        status: str,
        *,
        report_path: str | None = None,
        error_message: str | None = None,
    ) -> ReportStatusResponse:
        key = f"{insight_type}:{target}"
        with self._lock:
            reports = self._read_json(self.reports_file)
            now_str = now_utc().isoformat()
            reports[key] = {
                "target": target,
                "status": status,
                "updated_at": now_str,
                "report_path": report_path,
                "error_message": error_message,
            }
            self._write_json(self.reports_file, reports)
            return ReportStatusResponse.model_validate(reports[key])

    def get_insight_status(self, insight_type: str, target: str) -> ReportStatusResponse:
        key = f"{insight_type}:{target}"
        with self._lock:
            reports = self._read_json(self.reports_file)
            raw = reports.get(key)
            if raw:
                try:
                    return ReportStatusResponse.model_validate(raw)
                except ValidationError:
                    pass

            report_path = self.base / "insights" / insight_type / f"{target}.md"
            if report_path.exists():
                return ReportStatusResponse(
                    target=target,
                    status="ready",
                    updated_at=datetime.fromtimestamp(report_path.stat().st_mtime, tz=UTC),
                    report_path=str(report_path),
                )
            return ReportStatusResponse(target=target, status="none")

    def save_insight(self, insight_type: str, target: str, content: str) -> str:
        report_dir = self.base / "insights" / insight_type
        report_dir.mkdir(parents=True, exist_ok=True)
        report_path = report_dir / f"{target}.md"
        report_path.write_text(content, encoding="utf-8")
        return str(report_path)

    def read_insight(self, insight_type: str, target: str) -> str | None:
        report_path = self.base / "insights" / insight_type / f"{target}.md"
        if not report_path.exists():
            return None
        return report_path.read_text(encoding="utf-8")

    def _normalize_provider_alias(self, provider_raw: str, default: AIProvider) -> AIProvider:
        value = (provider_raw or "").strip().lower()
        if value in {"openai", "openai_compatible"}:
            return AIProvider.openai_compatible
        if value in {"anthropic", "claude"}:
            return AIProvider.anthropic
        if value == "mock":
            return default
        if value == AIProvider.anthropic.value:
            return AIProvider.anthropic
        if value == AIProvider.openai_compatible.value:
            return AIProvider.openai_compatible
        return default

    def _normalize_model_selection(
        self,
        model: str,
        model_options: list[str] | None,
        fallback_model: str,
    ) -> tuple[str, list[str]]:
        selected = (model or "").strip() or fallback_model
        options: list[str] = []
        if isinstance(model_options, list):
            for raw in model_options:
                val = str(raw).strip()
                if val and val not in options:
                    options.append(val)
        if not options:
            options = [selected]
        if selected not in options:
            options.append(selected)
        return selected, options

    def _ensure_unique_profile_id(self, desired_id: str, existing_ids: set[str]) -> str:
        base = (desired_id or "").strip() or "profile"
        candidate = base
        suffix = 2
        while candidate in existing_ids:
            candidate = f"{base}-{suffix}"
            suffix += 1
        return candidate

    def get_settings(self) -> SettingsBundle:
        with self._lock:
            raw = self._read_json(self.settings_file)
            default = self._build_default_settings()
            default_profile = default.ai.resolve_active_profile()
            changed = False

            # Only the new AI profile schema is supported.
            if "ai" in raw and isinstance(raw["ai"], dict):
                if not isinstance(raw["ai"].get("profiles"), list):
                    self._write_json(self.settings_file, default.model_dump(mode="json"))
                    return default

            try:
                settings = SettingsBundle.model_validate(raw)
            except ValidationError:
                self._write_json(self.settings_file, default.model_dump(mode="json"))
                return default

            before_count = len(settings.ai.profiles)
            active = settings.ai.resolve_active_profile()
            if len(settings.ai.profiles) != before_count:
                changed = True

            if not active.api_base and default_profile.api_base:
                active.api_base = default_profile.api_base
                changed = True
            if not active.api_key and default_profile.api_key:
                active.api_key = default_profile.api_key
                changed = True

            seen_ids: set[str] = set()
            for idx, profile in enumerate(settings.ai.profiles):
                normalized_id = self._ensure_unique_profile_id(profile.id, seen_ids)
                if profile.id != normalized_id:
                    profile.id = normalized_id
                    changed = True
                seen_ids.add(profile.id)

                normalized_name = profile.name.strip() or f"Provider {idx + 1}"
                if profile.name != normalized_name:
                    profile.name = normalized_name
                    changed = True

                normalized_provider = self._normalize_provider_alias(
                    str(profile.provider),
                    default_profile.provider,
                )
                if profile.provider != normalized_provider:
                    profile.provider = normalized_provider
                    changed = True

                normalized_model, normalized_options = self._normalize_model_selection(
                    profile.model,
                    profile.model_options,
                    default_profile.model,
                )
                if profile.model != normalized_model:
                    profile.model = normalized_model
                    changed = True
                if profile.model_options != normalized_options:
                    profile.model_options = normalized_options
                    changed = True

            if settings.ai.active_profile_id not in seen_ids:
                settings.ai.active_profile_id = settings.ai.profiles[0].id
                changed = True

            if changed:
                self._write_json(self.settings_file, settings.model_dump(mode="json"))
            return settings

    def get_ai_profile(self, profile_id: str) -> AIProfile | None:
        current = self.get_settings()
        for profile in current.ai.profiles:
            if profile.id == profile_id:
                return profile
        return None

    def update_ai_settings(self, ai_settings: AIProfile) -> SettingsBundle:
        with self._lock:
            current = self.get_settings()
            active = current.ai.resolve_active_profile()
            model, options = self._normalize_model_selection(
                ai_settings.model,
                ai_settings.model_options,
                active.model or "gpt-4o-mini",
            )
            next_profile = AIProfile(
                id=active.id,
                name=active.name,
                provider=ai_settings.provider,
                api_base=ai_settings.api_base,
                api_key=ai_settings.api_key,
                model=model,
                model_options=options,
                temperature=ai_settings.temperature,
                timeout_seconds=ai_settings.timeout_seconds,
            )

            replaced = False
            for idx, profile in enumerate(current.ai.profiles):
                if profile.id == active.id:
                    current.ai.profiles[idx] = next_profile
                    replaced = True
                    break
            if not replaced:
                current.ai.profiles.append(next_profile)
                current.ai.active_profile_id = next_profile.id

            self._write_json(self.settings_file, current.model_dump(mode="json"))
            return current

    def add_ai_profile(self, profile: AIProfile, *, set_active: bool = True) -> SettingsBundle:
        with self._lock:
            current = self.get_settings()
            existing_ids = {item.id for item in current.ai.profiles}

            model, options = self._normalize_model_selection(
                profile.model,
                profile.model_options,
                "gpt-4o-mini",
            )
            profile.id = self._ensure_unique_profile_id(profile.id, existing_ids)
            profile.name = profile.name.strip() or f"Provider {len(current.ai.profiles) + 1}"
            profile.model = model
            profile.model_options = options

            current.ai.profiles.append(profile)
            if set_active:
                current.ai.active_profile_id = profile.id
            self._write_json(self.settings_file, current.model_dump(mode="json"))
            return current

    def update_ai_profile(self, profile_id: str, profile: AIProfile) -> SettingsBundle:
        with self._lock:
            current = self.get_settings()
            model, options = self._normalize_model_selection(
                profile.model,
                profile.model_options,
                "gpt-4o-mini",
            )

            for idx, item in enumerate(current.ai.profiles):
                if item.id != profile_id:
                    continue
                current.ai.profiles[idx] = AIProfile(
                    id=profile_id,
                    name=profile.name.strip() or item.name or "Provider",
                    provider=profile.provider,
                    api_base=profile.api_base,
                    api_key=profile.api_key,
                    model=model,
                    model_options=options,
                    temperature=profile.temperature,
                    timeout_seconds=profile.timeout_seconds,
                )
                self._write_json(self.settings_file, current.model_dump(mode="json"))
                return current
            raise ValueError("profile not found")

    def activate_ai_profile(self, profile_id: str) -> SettingsBundle:
        with self._lock:
            current = self.get_settings()
            exists = any(profile.id == profile_id for profile in current.ai.profiles)
            if not exists:
                raise ValueError("profile not found")
            current.ai.active_profile_id = profile_id
            self._write_json(self.settings_file, current.model_dump(mode="json"))
            return current

    def delete_ai_profile(self, profile_id: str) -> SettingsBundle:
        with self._lock:
            current = self.get_settings()
            if len(current.ai.profiles) <= 1:
                raise ValueError("at least one profile must remain")

            next_profiles = [profile for profile in current.ai.profiles if profile.id != profile_id]
            if len(next_profiles) == len(current.ai.profiles):
                raise ValueError("profile not found")

            current.ai.profiles = next_profiles
            if current.ai.active_profile_id == profile_id:
                current.ai.active_profile_id = next_profiles[0].id
            self._write_json(self.settings_file, current.model_dump(mode="json"))
            return current

    def update_prompt_settings(self, prompt_settings: PromptSettings) -> SettingsBundle:
        with self._lock:
            current = self.get_settings()
            current.prompts = prompt_settings
            self._write_json(self.settings_file, current.model_dump(mode="json"))
            return current

    def update_ui_settings(self, ui_settings: UiSettings) -> SettingsBundle:
        with self._lock:
            current = self.get_settings()
            current.ui = ui_settings
            self._write_json(self.settings_file, current.model_dump(mode="json"))
            return current

    def remove_model_option(self, model_name: str) -> SettingsBundle:
        with self._lock:
            current = self.get_settings()
            profile = current.ai.resolve_active_profile()
            options = [m for m in profile.model_options if m != model_name]
            if not options:
                options = ["gpt-4o-mini"]
            if profile.model == model_name:
                profile.model = options[0]
            profile.model, profile.model_options = self._normalize_model_selection(
                profile.model,
                options,
                "gpt-4o-mini",
            )
            self._write_json(self.settings_file, current.model_dump(mode="json"))
            return current
