from __future__ import annotations

import shutil
import sys
import unittest
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.models.problem import ProblemInput, ProblemStatus
from src.storage.file_manager import FileManager, current_month


class ProblemMarkdownUrlTests(unittest.TestCase):
    def setUp(self) -> None:
        tmp_root = ROOT / ".tmp_testdata"
        tmp_root.mkdir(parents=True, exist_ok=True)
        self.base = tmp_root / f"problem_url_{uuid.uuid4().hex}" / "data"
        self.fm = FileManager(self.base)

    def tearDown(self) -> None:
        shutil.rmtree(self.base.parent, ignore_errors=True)

    def test_problem_markdown_includes_original_url(self) -> None:
        item = ProblemInput(
            source="luogu",
            id="P1010",
            title="P1010 过河卒",
            url="https://www.luogu.com.cn/problem/P1010",
            status=ProblemStatus.unsolved,
        )
        self.fm.upsert_problems([item])

        md_path = self.base / current_month() / "problems" / "P1010_过河卒.md"
        text = md_path.read_text(encoding="utf-8")
        self.assertIn("- 原始链接: https://www.luogu.com.cn/problem/P1010", text)

    def test_empty_import_url_does_not_override_existing(self) -> None:
        item = ProblemInput(
            source="luogu",
            id="P1010",
            title="P1010 过河卒",
            url="https://www.luogu.com.cn/problem/P1010",
            status=ProblemStatus.unsolved,
        )
        self.fm.upsert_problems([item])

        updated = ProblemInput(
            source="luogu",
            id="P1010",
            title="Updated Title",
            url="",
            status=ProblemStatus.unsolved,
        )
        _, _, records = self.fm.upsert_problems([updated])
        self.assertEqual(records[0].url, "https://www.luogu.com.cn/problem/P1010")

        md_path = self.base / current_month() / "problems" / "Updated_Title.md"
        text = md_path.read_text(encoding="utf-8")
        self.assertIn("- 原始链接: https://www.luogu.com.cn/problem/P1010", text)

    def test_reads_legacy_problem_filename_after_new_naming_rollout(self) -> None:
        item = ProblemInput(
            source="luogu",
            id="P1010",
            title="Legacy Title",
            url="https://example.com",
            status=ProblemStatus.unsolved,
        )
        self.fm.upsert_problems([item])
        month = current_month()
        problem_dir = self.base / month / "problems"
        problem_dir.mkdir(parents=True, exist_ok=True)
        new_path = problem_dir / "Legacy_Title.md"
        new_path.unlink(missing_ok=True)
        legacy_path = problem_dir / "luogu_P1010.md"
        legacy_path.write_text(
            "# 题目信息\n\n- 来源: luogu\n- 题目ID: P1010\n- 标题: Legacy Title\n- 原始链接: https://example.com\n",
            encoding="utf-8",
        )

        content = self.fm.get_problem_markdown("luogu", "P1010")
        self.assertIn("Legacy Title", content)


if __name__ == "__main__":
    unittest.main()
