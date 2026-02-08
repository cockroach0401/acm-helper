from __future__ import annotations

import json
from pathlib import Path

from ..services.ai_client import AIClient
from ..services.solution_gen import SolutionGenerator
from ..services.stats_gen import InsightGenerator
from ..services.task_runner import TaskRunner
from ..services.translator import ProblemTranslator
from ..storage.file_manager import FileManager

_APP_DIR = Path(__file__).resolve().parents[2]
_DEFAULT_BASE_DIR = _APP_DIR / "data"
_STORAGE_CONFIG_FILE = _APP_DIR / "storage_config.json"


def resolve_storage_base_dir(path_raw: str | None) -> Path:
    value = (path_raw or "").strip()
    if not value:
        return _DEFAULT_BASE_DIR.resolve()
    return Path(value).expanduser().resolve()


def _load_storage_base_dir() -> Path:
    if not _STORAGE_CONFIG_FILE.exists():
        return _DEFAULT_BASE_DIR.resolve()

    try:
        raw = _STORAGE_CONFIG_FILE.read_text(encoding="utf-8")
        obj = json.loads(raw)
    except (OSError, json.JSONDecodeError):
        return _DEFAULT_BASE_DIR.resolve()

    if not isinstance(obj, dict):
        return _DEFAULT_BASE_DIR.resolve()
    try:
        return resolve_storage_base_dir(str(obj.get("storage_base_dir", "")))
    except (OSError, RuntimeError, ValueError):
        return _DEFAULT_BASE_DIR.resolve()


def persist_storage_base_dir(path: Path) -> Path:
    normalized = resolve_storage_base_dir(str(path))
    payload = {"storage_base_dir": str(normalized)}
    _STORAGE_CONFIG_FILE.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return normalized


_BASE_DIR = _load_storage_base_dir()
try:
    persist_storage_base_dir(_BASE_DIR)
except OSError:
    pass

_file_manager = FileManager(_BASE_DIR)
_ai_client = AIClient()
_solution_generator = SolutionGenerator(_ai_client)
_task_runner = TaskRunner(_file_manager, _solution_generator)
_problem_translator = ProblemTranslator(_ai_client)
_insight_generator = InsightGenerator(_ai_client)


def get_file_manager() -> FileManager:
    return _file_manager


def get_ai_client() -> AIClient:
    return _ai_client


def get_task_runner() -> TaskRunner:
    return _task_runner


def get_problem_translator() -> ProblemTranslator:
    return _problem_translator


def get_insight_generator() -> InsightGenerator:
    return _insight_generator
