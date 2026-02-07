from __future__ import annotations

from pathlib import Path

from ..services.ai_client import AIClient
from ..services.solution_gen import SolutionGenerator
from ..services.stats_gen import InsightGenerator
from ..services.task_runner import TaskRunner
from ..services.translator import ProblemTranslator
from ..storage.file_manager import FileManager

_BASE_DIR = Path(__file__).resolve().parents[2] / "data"

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
