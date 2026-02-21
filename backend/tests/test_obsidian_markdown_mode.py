from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.models.problem import ProblemInput, ProblemRecord
from src.models.settings import UiSettings
from src.storage.file_manager import FileManager


class ObsidianMarkdownModeTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmpdir = tempfile.TemporaryDirectory()
        self.base = Path(self._tmpdir.name) / "data"
        self.fm = FileManager(self.base)

    def tearDown(self) -> None:
        self._tmpdir.cleanup()

    def _enable_obsidian_mode(self) -> None:
        current = self.fm.get_settings().ui
        self.fm.update_ui_settings(
            UiSettings(
                default_ac_language=current.default_ac_language,
                storage_base_dir=self.fm.get_storage_base_dir(),
                autostart_enabled=current.autostart_enabled,
                autostart_silent=current.autostart_silent,
                obsidian_mode_enabled=True,
            )
        )

    def test_problem_markdown_includes_frontmatter_when_obsidian_mode_enabled(self) -> None:
        self._enable_obsidian_mode()

        problem = ProblemInput(
            source="codeforces",
            id="100A",
            title="Test Problem",
            url="https://codeforces.com/problemset/problem/100/A",
            tags=["动态规划", "图论"],
            difficulty=1700,
        )
        self.fm.upsert_problems([problem])

        content = self.fm.get_problem_markdown(problem.source, problem.id)
        self.assertIsNotNone(content)
        text = content or ""

        self.assertTrue(text.startswith("---\n"))
        self.assertIn("tags:\n", text)
        self.assertIn('  - "动态规划"\n', text)
        self.assertIn('  - "图论"\n', text)
        self.assertIn('source: "codeforces"\n', text)
        self.assertIn('problem_id: "100A"\n', text)
        self.assertIn('title: "Test Problem"\n', text)
        self.assertIn("difficulty: 1700\n", text)
        self.assertIn("# Problem\n", text)

    def test_solution_markdown_includes_frontmatter_when_obsidian_mode_enabled(self) -> None:
        self._enable_obsidian_mode()

        problem = ProblemRecord(
            source="luogu",
            id="P1001",
            title="A+B",
            tags=["模拟"],
        )
        solution_path = Path(self.fm.save_solution_file(problem, "# 题解\n\n正文"))
        text = solution_path.read_text(encoding="utf-8")

        self.assertTrue(text.startswith("---\n"))
        self.assertIn("tags:\n", text)
        self.assertIn('  - "模拟"\n', text)
        self.assertIn('  - "题解"\n', text)
        self.assertIn('source: "luogu"\n', text)
        self.assertIn('problem_id: "P1001"\n', text)
        self.assertIn('title: "A+B"\n', text)
        self.assertIn("type: solution\n", text)
        self.assertTrue(text.rstrip().endswith("正文"))


if __name__ == "__main__":
    unittest.main()
