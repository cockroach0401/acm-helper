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

from src.models.problem import ProblemInput
from src.routes.problems import auto_tag_problem, enqueue_auto_tag_task
from src.services.tag_gen import TagGenerator
from src.storage.file_manager import FileManager


class _FakeAIClient:
    def __init__(self, response: str) -> None:
        self.response = response
        self.prompts: list[str] = []

    async def generate_text(self, prompt: str, ai_settings) -> str:
        self.prompts.append(prompt)
        return self.response


class _FakeTaskRunner:
    def __init__(self) -> None:
        self.calls: list[str] = []

    async def enqueue_ai_tag_task(self, problem_key: str) -> str:
        self.calls.append(problem_key)
        return "task-auto-tag-1"


class AutoTagTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmpdir = tempfile.TemporaryDirectory()
        self.base = Path(self._tmpdir.name) / "data"
        self.fm = FileManager(self.base)

    def tearDown(self) -> None:
        self._tmpdir.cleanup()

    def _insert_problem(self, *, source: str = "codeforces", pid: str = "1A") -> None:
        self.fm.upsert_problems(
            [
                ProblemInput(
                    source=source,
                    id=pid,
                    title="Demo",
                    content="给定数组，判断是否可行。",
                    input_format="n 和数组",
                    output_format="YES/NO",
                    constraints="n <= 2e5",
                )
            ]
        )

    def test_tag_generator_parse_normalizes_alias_and_rounds_difficulty(self) -> None:
        gen = TagGenerator(_FakeAIClient("{}"))
        tags, difficulty = gen.parse_response('{"tags": ["dp", "图论", "graph theory", "dfs"], "difficulty": 1677}')

        self.assertEqual(tags, ["动态规划", "图论", "深度优先搜索"])
        self.assertEqual(difficulty, 1700)

    def test_tag_generator_parse_supports_code_fence_json(self) -> None:
        gen = TagGenerator(_FakeAIClient("{}"))
        raw = """```json
{
  \"tags\": [\"greedy\", \"math\"],
  \"difficulty\": \"*1912\"
}
```"""
        tags, difficulty = gen.parse_response(raw)

        self.assertEqual(tags, ["贪心", "数学"])
        self.assertEqual(difficulty, 1900)

    def test_auto_tag_endpoint_updates_problem_and_returns_notice_without_solution(self) -> None:
        self._insert_problem()
        ai_client = _FakeAIClient('{"tags": ["dp", "greedy"], "difficulty": 1651}')
        tag_generator = TagGenerator(ai_client)

        resp = asyncio.run(
            auto_tag_problem(
                "codeforces",
                "1A",
                fm=self.fm,
                tag_generator=tag_generator,
            )
        )

        self.assertFalse(resp.used_solution)
        self.assertTrue(resp.notice)
        self.assertIn("暂无题解", resp.notice)
        self.assertEqual(resp.record.tags, ["动态规划", "贪心"])
        self.assertEqual(resp.record.difficulty, 1700)
        self.assertTrue(ai_client.prompts)

        saved = self.fm.get_problem("codeforces", "1A")
        self.assertIsNotNone(saved)
        self.assertEqual(saved.tags, ["动态规划", "贪心"])
        self.assertEqual(saved.difficulty, 1700)

    def test_auto_tag_endpoint_uses_solution_when_exists(self) -> None:
        self._insert_problem(source="luogu", pid="P1001")
        problem = self.fm.get_problem("luogu", "P1001")
        assert problem is not None
        self.fm.save_solution_file(problem, "# 题解\n\n这里是证明。")

        ai_client = _FakeAIClient('{"tags": ["位运算", "math"], "difficulty": "*1931"}')
        tag_generator = TagGenerator(ai_client)

        resp = asyncio.run(
            auto_tag_problem(
                "luogu",
                "P1001",
                fm=self.fm,
                tag_generator=tag_generator,
            )
        )

        self.assertTrue(resp.used_solution)
        self.assertIsNone(resp.notice)
        self.assertEqual(resp.record.tags, ["位运算", "数学"])
        self.assertEqual(resp.record.difficulty, 1900)
        self.assertTrue(ai_client.prompts and "solution_markdown" in ai_client.prompts[0])

    def test_auto_tag_endpoint_problem_not_found(self) -> None:
        tag_generator = TagGenerator(_FakeAIClient('{"tags": ["dp"], "difficulty": 1600}'))

        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(auto_tag_problem("codeforces", "404", fm=self.fm, tag_generator=tag_generator))

        self.assertEqual(ctx.exception.status_code, 404)

    def test_auto_tag_task_endpoint_enqueues_task(self) -> None:
        self._insert_problem(source="codeforces", pid="2A")
        fake_runner = _FakeTaskRunner()

        resp = asyncio.run(
            enqueue_auto_tag_task(
                "codeforces",
                "2A",
                fm=self.fm,
                task_runner=fake_runner,
            )
        )

        self.assertEqual(resp.task_ids, ["task-auto-tag-1"])
        self.assertEqual(fake_runner.calls, ["codeforces:2A"])

    def test_auto_tag_task_endpoint_problem_not_found(self) -> None:
        fake_runner = _FakeTaskRunner()

        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(
                enqueue_auto_tag_task(
                    "codeforces",
                    "404",
                    fm=self.fm,
                    task_runner=fake_runner,
                )
            )

        self.assertEqual(ctx.exception.status_code, 404)


if __name__ == "__main__":
    unittest.main()
