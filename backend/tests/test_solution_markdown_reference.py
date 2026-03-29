from __future__ import annotations

import os
import shutil
import sys
import unittest
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.models.problem import ProblemInput, ProblemRecord
from src.storage.file_manager import FileManager, current_month, month_from_dt


class SolutionMarkdownReferenceTests(unittest.TestCase):
    def setUp(self) -> None:
        tmp_root = ROOT / ".tmp_testdata"
        tmp_root.mkdir(parents=True, exist_ok=True)
        self.base = tmp_root / f"solution_ref_{uuid.uuid4().hex}" / "data"
        self.fm = FileManager(self.base)

    def tearDown(self) -> None:
        shutil.rmtree(self.base.parent, ignore_errors=True)

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

        self.assertIn("## 原题引用", text)
        self.assertNotIn("<!-- problem-md-ref -->", text)
        self.assertIn('<!-- ACM_HELPER_SOLUTION source="codeforces" id="1A" -->', text)
        self.assertIn(
            "- [打开原题](../problems/Watermelon.md)",
            text,
        )
        self.assertTrue(text.endswith("\n"))

        problem_md = self.base / current_month() / "problems" / "Watermelon.md"
        self.assertTrue(problem_md.exists())

    def test_computes_cross_month_relative_link(self) -> None:
        old_created_at = datetime.now(UTC) - timedelta(days=40)
        self.assertNotEqual(month_from_dt(old_created_at), current_month())

        problem = self._make_problem(problem_id="2B", created_at=old_created_at)
        solution_path = Path(self.fm.save_solution_file(problem, "# Solution\n\nCross month"))
        text = solution_path.read_text(encoding="utf-8")

        problem_path = self.base / month_from_dt(old_created_at) / "problems" / "Watermelon.md"
        expected = os.path.relpath(problem_path, start=solution_path.parent).replace("\\", "/")
        self.assertIn(f"- [打开原题]({expected})", text)

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

        problem_md_path = self.base / current_month() / "problems" / "中文标题.md"
        problem_text = problem_md_path.read_text(encoding="utf-8")
        self.assertIn("中文标题", problem_text)
        self.assertIn("题目描述：给定一个数组，求和。", problem_text)

    def test_auto_renames_when_solution_filename_conflicts(self) -> None:
        problem = self._make_problem(problem_id="dup-1")

        first_path = Path(self.fm.save_solution_file(problem, "# S1"))
        second_path = Path(self.fm.save_solution_file(problem, "# S2"))
        third_path = Path(self.fm.save_solution_file(problem, "# S3"))

        self.assertEqual(first_path.name, "Watermelon.md")
        self.assertEqual(second_path.name, "Watermelon__dup_2.md")
        self.assertEqual(third_path.name, "Watermelon__dup_3.md")

        self.assertTrue(first_path.read_text(encoding="utf-8").endswith("# S1\n"))
        self.assertTrue(second_path.read_text(encoding="utf-8").endswith("# S2\n"))
        self.assertTrue(third_path.read_text(encoding="utf-8").endswith("# S3\n"))

    def test_renames_existing_solution_links_when_title_changes(self) -> None:
        item = ProblemInput(source="codeforces", id="3C", title="Old Title")
        _, _, records = self.fm.upsert_problems([item])
        first_solution = Path(self.fm.save_solution_file(records[0], "# Before"))

        updated = self.fm.update_problem_info("codeforces", "3C", title="New Title")
        self.assertIsNotNone(updated)

        new_problem_path = self.base / current_month() / "problems" / "New_Title.md"
        new_solution_path = self.base / current_month() / "solutions" / "New_Title.md"
        self.assertTrue(new_problem_path.exists())
        self.assertTrue(new_solution_path.exists())
        self.assertFalse(first_solution.exists())
        self.assertIn("- [打开原题](../problems/New_Title.md)", new_solution_path.read_text(encoding="utf-8"))

    def test_reads_legacy_solution_filename_via_metadata_fallback(self) -> None:
        problem = self._make_problem(problem_id="legacy-1", title="Legacy Title")
        month = current_month()
        solution_dir = self.base / month / "solutions"
        solution_dir.mkdir(parents=True, exist_ok=True)
        legacy_path = solution_dir / "codeforces_legacy-1.md"
        legacy_path.write_text("## 原题引用\n- [打开原题](../problems/codeforces_legacy-1.md)\n\nLegacy body\n", encoding="utf-8")

        text = self.fm.read_solution_file(problem.source, problem.id)
        self.assertIn("Legacy body", text)


if __name__ == "__main__":
    unittest.main()
