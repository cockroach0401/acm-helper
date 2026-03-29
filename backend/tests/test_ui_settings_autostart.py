from __future__ import annotations

import sys
import shutil
import unittest
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.models.settings import AcLanguage, MarkdownNamingMode, UiSettings
from src.storage.file_manager import FileManager


class UiSettingsAutostartTests(unittest.TestCase):
    def setUp(self) -> None:
        tmp_root = ROOT / ".tmp_testdata"
        tmp_root.mkdir(parents=True, exist_ok=True)
        self.base = tmp_root / f"ui_settings_{uuid.uuid4().hex}" / "data"
        self.fm = FileManager(self.base)

    def tearDown(self) -> None:
        shutil.rmtree(self.base.parent, ignore_errors=True)

    def test_defaults_include_autostart_flags(self) -> None:
        settings = self.fm.get_settings()

        self.assertFalse(settings.ui.autostart_enabled)
        self.assertTrue(settings.ui.autostart_silent)
        self.assertEqual(settings.ui.markdown_naming_mode, MarkdownNamingMode.title)

    def test_update_ui_settings_persists_autostart_flags(self) -> None:
        updated = self.fm.update_ui_settings(
            UiSettings(
                default_ac_language=AcLanguage.python,
                storage_base_dir=self.fm.get_storage_base_dir(),
                autostart_enabled=True,
                autostart_silent=True,
                obsidian_mode_enabled=True,
                markdown_naming_mode=MarkdownNamingMode.source_id,
            )
        )

        self.assertEqual(updated.ui.default_ac_language, AcLanguage.python)
        self.assertTrue(updated.ui.autostart_enabled)
        self.assertTrue(updated.ui.autostart_silent)
        self.assertTrue(updated.ui.obsidian_mode_enabled)
        self.assertEqual(updated.ui.markdown_naming_mode, MarkdownNamingMode.source_id)

        reloaded = self.fm.get_settings()
        self.assertTrue(reloaded.ui.autostart_enabled)
        self.assertTrue(reloaded.ui.autostart_silent)
        self.assertTrue(reloaded.ui.obsidian_mode_enabled)
        self.assertEqual(reloaded.ui.markdown_naming_mode, MarkdownNamingMode.source_id)


if __name__ == "__main__":
    unittest.main()
