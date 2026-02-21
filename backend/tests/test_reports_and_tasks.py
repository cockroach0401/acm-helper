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
from src.models.task import TaskStatus
from src.routes.stats import generate_insight, get_chart_series
from src.services.task_runner import TaskRunner
from src.storage.file_manager import FileManager


class _DummyInsightGenerator:
    def __init__(self) -> None:
        self.prompts: list[str] = []

    async def generate(self, prompt: str, ai_settings) -> str:
        self.prompts.append(prompt)
        return "# generated report\n"


class _DummySolutionGenerator:
    async def generate(self, *args, **kwargs) -> str:  # pragma: no cover
        return ""


class _DummyTagGenerator:
    async def generate(self, *args, **kwargs):
        return ["动态规划", "贪心"], 1700


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


    def test_ai_tag_task_created_and_completed(self) -> None:
        self.fm.upsert_problems(
            [
                ProblemInput(
                    source="codeforces",
                    id="3A",
                    title="Tag Task Demo",
                    content="demo",
                )
            ]
        )

        runner = TaskRunner(
            self.fm,
            _DummySolutionGenerator(),
            _DummyTagGenerator(),
        )

        task_id = asyncio.run(runner.enqueue_ai_tag_task("codeforces:3A"))

        async def _wait_done() -> None:
            for _ in range(50):
                task = self.fm.get_task(task_id)
                if task and task.status in {TaskStatus.succeeded, TaskStatus.failed}:
                    return
                await asyncio.sleep(0.02)

        asyncio.run(_wait_done())

        task = self.fm.get_task(task_id)
        self.assertIsNotNone(task)
        assert task is not None
        self.assertEqual(task.task_type.value, "ai_tag")
        self.assertEqual(task.status, TaskStatus.succeeded)
        self.assertEqual(task.problem_key, "codeforces:3A")

        updated = self.fm.get_problem("codeforces", "3A")
        self.assertIsNotNone(updated)
        assert updated is not None
        self.assertEqual(updated.tags, ["动态规划", "贪心"])
        self.assertEqual(updated.difficulty, 1700)


    def test_stats_charts_include_tags_distribution_for_solved(self) -> None:
        self.fm.upsert_problems(
            [
                ProblemInput(source="codeforces", id="1A", title="A", status=ProblemStatus.solved, tags=["greedy", "math"]),
                ProblemInput(source="codeforces", id="2A", title="B", status=ProblemStatus.solved, tags=["math", "dp"]),
                ProblemInput(source="luogu", id="P1001", title="C", status=ProblemStatus.attempted, tags=["graph"]),
            ]
        )

        data = get_chart_series(fm=self.fm)
        tags_distribution = data.get("tags_distribution")

        self.assertIsInstance(tags_distribution, list)
        self.assertEqual(
            tags_distribution,
            [
                {"tag": "math", "count": 2},
                {"tag": "dp", "count": 1},
                {"tag": "greedy", "count": 1},
            ],
        )


if __name__ == "__main__":
    unittest.main()
