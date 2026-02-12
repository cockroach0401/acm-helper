from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.models.problem import ProblemInput, ProblemStatus
from src.storage.file_manager import FileManager, current_month


class ProblemMarkdownUrlTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmpdir = tempfile.TemporaryDirectory()
        self.base = Path(self._tmpdir.name) / "data"
        self.fm = FileManager(self.base)

    def tearDown(self) -> None:
        self._tmpdir.cleanup()

    def test_problem_markdown_includes_original_url(self) -> None:
        item = ProblemInput(
            source="luogu",
            id="P1010",
            title="P1010",
            url="https://www.luogu.com.cn/problem/P1010",
            status=ProblemStatus.unsolved,
        )
        self.fm.upsert_problems([item])

        md_path = self.base / current_month() / "problems" / "luogu_P1010.md"
        text = md_path.read_text(encoding="utf-8")
        self.assertIn("- original_url: https://www.luogu.com.cn/problem/P1010", text)

    def test_empty_import_url_does_not_override_existing(self) -> None:
        item = ProblemInput(
            source="luogu",
            id="P1010",
            title="P1010",
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

        md_path = self.base / current_month() / "problems" / "luogu_P1010.md"
        text = md_path.read_text(encoding="utf-8")
        self.assertIn("- original_url: https://www.luogu.com.cn/problem/P1010", text)


if __name__ == "__main__":
    unittest.main()
