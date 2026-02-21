from __future__ import annotations

import asyncio
import sys
import tempfile
import unittest
from pathlib import Path

from fastapi import HTTPException

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.models.problem import ProblemInput, ProblemStatus
from src.models.stats import InsightGenerateRequest, InsightType
from src.routes.stats import generate_insight
from src.storage.file_manager import FileManager


class _DummyInsightGenerator:
    def __init__(self) -> None:
        self.prompts: list[str] = []

    async def generate(self, prompt: str, ai_settings) -> str:
        self.prompts.append(prompt)
        return "# generated report\n"


class ReportsAndTasksTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmpdir = tempfile.TemporaryDirectory()
        self.base = Path(self._tmpdir.name) / "data"
        self.fm = FileManager(self.base)

    def tearDown(self) -> None:
        self._tmpdir.cleanup()

    def test_source_filter_supports_atcoder(self) -> None:
        self.fm.upsert_problems(
            [
                ProblemInput(source="atcoder", id="abc100_a", title="A", status=ProblemStatus.solved),
                ProblemInput(source="luogu", id="P1001", title="B", status=ProblemStatus.solved),
            ]
        )

        rows = self.fm.list_problems_filtered(source="atcoder")
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0].source, "atcoder")

    def test_report_tasks_are_persisted_in_task_list(self) -> None:
        t1 = self.fm.create_report_task("weekly", "2026-W07", provider_name="Default")
        t2 = self.fm.create_report_task("phased", "2026-W07__2026-W08", provider_name="Default")

        all_tasks = self.fm.list_tasks()
        by_id = {t.task_id: t for t in all_tasks}

        self.assertIn(t1.task_id, by_id)
        self.assertIn(t2.task_id, by_id)
        self.assertEqual(by_id[t1.task_id].task_type.value, "weekly_report")
        self.assertEqual(by_id[t2.task_id].task_type.value, "phased_report")
        self.assertEqual(by_id[t2.task_id].report_target, "2026-W07__2026-W08")

    def test_phased_report_requires_existing_weekly_reports(self) -> None:
        dummy = _DummyInsightGenerator()

        # 仅提供首周，第二周缺失，必须报错
        self.fm.save_insight("weekly", "2026-W01", "weekly 1")

        req = InsightGenerateRequest(type=InsightType.phased, target="2026-W01__2026-W02")
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(generate_insight(req, fm=self.fm, insight_generator=dummy))

        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("Missing weekly reports", str(ctx.exception.detail))

        status = self.fm.get_insight_status("phased", "2026-W01__2026-W02")
        self.assertEqual(status.status, "failed")

    def test_phased_report_injects_weekly_reports_into_problem_list_json(self) -> None:
        dummy = _DummyInsightGenerator()

        self.fm.save_insight("weekly", "2026-W01", "weekly report content 1")
        self.fm.save_insight("weekly", "2026-W02", "weekly report content 2")

        req = InsightGenerateRequest(type=InsightType.phased, target="2026-W01__2026-W02")
        resp = asyncio.run(generate_insight(req, fm=self.fm, insight_generator=dummy))

        self.assertEqual(resp.type.value, "phased")
        self.assertEqual(resp.target, "2026-W01__2026-W02")
        self.assertTrue(resp.path.endswith("2026-W01__2026-W02.md"))

        self.assertEqual(len(dummy.prompts), 1)
        prompt = dummy.prompts[0]
        self.assertNotIn("{{problem_list_json}}", prompt)
        self.assertIn("weekly report content 1", prompt)
        self.assertIn("weekly report content 2", prompt)


if __name__ == "__main__":
    unittest.main()
