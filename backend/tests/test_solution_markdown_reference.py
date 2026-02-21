from __future__ import annotations

import os
import sys
import tempfile
import unittest
from datetime import UTC, datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.models.problem import ProblemRecord
from src.storage.file_manager import FileManager, current_month, month_from_dt


class SolutionMarkdownReferenceTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmpdir = tempfile.TemporaryDirectory()
        self.base = Path(self._tmpdir.name) / "data"
        self.fm = FileManager(self.base)

    def tearDown(self) -> None:
        self._tmpdir.cleanup()

    def _make_problem(
        self,
        *,
        source: str = "codeforces",
        problem_id: str = "1A",
        title: str = "Watermelon",
        content: str = "",
        created_at: datetime | None = None,
    ) -> ProblemRecord:
        created = created_at or datetime.now(UTC)
        return ProblemRecord(
            source=source,
            id=problem_id,
            title=title,
            content=content,
            created_at=created,
            updated_at=created,
        )

    def test_adds_reference_header_for_same_month_problem(self) -> None:
        problem = self._make_problem(problem_id="1A")
        solution_path = Path(self.fm.save_solution_file(problem, "# Solution\n\nBody"))
        text = solution_path.read_text(encoding="utf-8")

        self.assertIn("## Problem Markdown Reference(原题)", text)
        self.assertNotIn("<!-- problem-md-ref -->", text)
        self.assertIn(
            "- [Open original problem markdown(打开原题)](../problems/codeforces_1A.md)",
            text,
        )
        self.assertTrue(text.endswith("\n"))

        problem_md = self.base / current_month() / "problems" / "codeforces_1A.md"
        self.assertTrue(problem_md.exists())

    def test_computes_cross_month_relative_link(self) -> None:
        old_created_at = datetime.now(UTC) - timedelta(days=40)
        self.assertNotEqual(month_from_dt(old_created_at), current_month())

        problem = self._make_problem(problem_id="2B", created_at=old_created_at)
        solution_path = Path(self.fm.save_solution_file(problem, "# Solution\n\nCross month"))
        text = solution_path.read_text(encoding="utf-8")

        problem_path = self.base / month_from_dt(old_created_at) / "problems" / "codeforces_2B.md"
        expected = os.path.relpath(problem_path, start=solution_path.parent).replace("\\", "/")
        self.assertIn(f"- [Open original problem markdown(打开原题)]({expected})", text)

    def test_preserves_utf8_content(self) -> None:
        problem = self._make_problem(
            source="nowcoder",
            problem_id="utf8-1",
            title="中文标题",
            content="题目描述：给定一个数组，求和。",
        )
        body = "## 思路\n\n先读入数据，再输出答案。"

        solution_path = Path(self.fm.save_solution_file(problem, body))
        solution_text = solution_path.read_text(encoding="utf-8")
        self.assertIn(body, solution_text)

        problem_md_path = self.base / current_month() / "problems" / "nowcoder_utf8-1.md"
        problem_text = problem_md_path.read_text(encoding="utf-8")
        self.assertIn("中文标题", problem_text)
        self.assertIn("题目描述：给定一个数组，求和。", problem_text)

    def test_auto_renames_when_solution_filename_conflicts(self) -> None:
        problem = self._make_problem(problem_id="dup-1")

        first_path = Path(self.fm.save_solution_file(problem, "# S1"))
        second_path = Path(self.fm.save_solution_file(problem, "# S2"))
        third_path = Path(self.fm.save_solution_file(problem, "# S3"))

        self.assertEqual(first_path.name, "codeforces_dup-1.md")
        self.assertEqual(second_path.name, "codeforces_dup-1__dup_2.md")
        self.assertEqual(third_path.name, "codeforces_dup-1__dup_3.md")

        self.assertTrue(first_path.read_text(encoding="utf-8").endswith("# S1\n"))
        self.assertTrue(second_path.read_text(encoding="utf-8").endswith("# S2\n"))
        self.assertTrue(third_path.read_text(encoding="utf-8").endswith("# S3\n"))


if __name__ == "__main__":
    unittest.main()
