from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.models.settings import AcLanguage, UiSettings
from src.storage.file_manager import FileManager


class UiSettingsAutostartTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmpdir = tempfile.TemporaryDirectory()
        self.base = Path(self._tmpdir.name) / "data"
        self.fm = FileManager(self.base)

    def tearDown(self) -> None:
        self._tmpdir.cleanup()

    def test_defaults_include_autostart_flags(self) -> None:
        settings = self.fm.get_settings()

        self.assertFalse(settings.ui.autostart_enabled)
        self.assertTrue(settings.ui.autostart_silent)

    def test_update_ui_settings_persists_autostart_flags(self) -> None:
        updated = self.fm.update_ui_settings(
            UiSettings(
                default_ac_language=AcLanguage.python,
                storage_base_dir=self.fm.get_storage_base_dir(),
                autostart_enabled=True,
                autostart_silent=True,
                obsidian_mode_enabled=True,
            )
        )

        self.assertEqual(updated.ui.default_ac_language, AcLanguage.python)
        self.assertTrue(updated.ui.autostart_enabled)
        self.assertTrue(updated.ui.autostart_silent)
        self.assertTrue(updated.ui.obsidian_mode_enabled)

        reloaded = self.fm.get_settings()
        self.assertTrue(reloaded.ui.autostart_enabled)
        self.assertTrue(reloaded.ui.autostart_silent)
        self.assertTrue(reloaded.ui.obsidian_mode_enabled)


if __name__ == "__main__":
    unittest.main()
