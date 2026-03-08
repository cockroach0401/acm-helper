from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.models.problem import ProblemInput, ProblemStatus
from src.storage.file_manager import FileManager


class ProblemImportAcLanguageTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmpdir = tempfile.TemporaryDirectory()
        self.base = Path(self._tmpdir.name) / "data"
        self.fm = FileManager(self.base)

    def tearDown(self) -> None:
        self._tmpdir.cleanup()

    def test_solved_import_normalizes_pypy_language(self) -> None:
        _, _, records = self.fm.upsert_problems(
            [
                ProblemInput(
                    source="nowcoder",
                    id="NC296395",
                    title="字符串操作",
                    status=ProblemStatus.solved,
                    my_ac_code="print('ok')",
                    my_ac_language="Pypy3",
                )
            ]
        )

        record = records[0]
        self.assertEqual(record.status, ProblemStatus.solved)
        self.assertEqual(record.my_ac_language, "python")
        self.assertEqual(record.my_ac_code, "print('ok')")
        self.assertIsNotNone(record.solved_at)

    def test_empty_ac_snapshot_preserves_existing_code_and_language(self) -> None:
        self.fm.upsert_problems(
            [
                ProblemInput(
                    source="nowcoder",
                    id="NC296395",
                    title="字符串操作",
                    status=ProblemStatus.solved,
                    my_ac_code="print('ok')",
                    my_ac_language="Pypy3",
                )
            ]
        )

        _, _, records = self.fm.upsert_problems(
            [
                ProblemInput(
                    source="nowcoder",
                    id="NC296395",
                    title="字符串操作（更新）",
                    status=ProblemStatus.solved,
                    my_ac_code="",
                    my_ac_language="",
                )
            ]
        )

        record = records[0]
        self.assertEqual(record.my_ac_code, "print('ok')")
        self.assertEqual(record.my_ac_language, "python")
        self.assertIsNotNone(record.solved_at)


if __name__ == "__main__":
    unittest.main()
