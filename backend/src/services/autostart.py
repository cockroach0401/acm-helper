from __future__ import annotations

import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

if sys.platform == "win32":
    import winreg


_RUN_KEY_PATH = r"Software\Microsoft\Windows\CurrentVersion\Run"
_RUN_VALUE_NAME = "ACM Helper"


@dataclass(frozen=True)
class AutostartState:
    enabled: bool
    silent: bool
    command: str = ""


def is_supported() -> bool:
    return sys.platform == "win32"


def _run_server_script_path() -> Path:
    # .../backend/src/services/autostart.py -> .../backend/run_server.py
    return Path(__file__).resolve().parents[2] / "run_server.py"


def _build_command(*, silent: bool) -> str:
    if getattr(sys, "frozen", False):
        args = [str(Path(sys.executable))]
    else:
        args = [sys.executable, str(_run_server_script_path())]

    if silent:
        args.append("--silent")

    return subprocess.list2cmdline(args)


def get_autostart_state() -> AutostartState:
    if not is_supported():
        return AutostartState(enabled=False, silent=True, command="")

    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, _RUN_KEY_PATH, 0, winreg.KEY_READ) as key:
            value, _ = winreg.QueryValueEx(key, _RUN_VALUE_NAME)
    except FileNotFoundError:
        return AutostartState(enabled=False, silent=True, command="")
    except OSError:
        return AutostartState(enabled=False, silent=True, command="")

    command = str(value).strip()
    if not command:
        return AutostartState(enabled=False, silent=True, command="")

    silent = "--silent" in command.lower()
    return AutostartState(enabled=True, silent=silent, command=command)


def set_autostart(*, enabled: bool, silent: bool = True) -> AutostartState:
    if not is_supported():
        return AutostartState(enabled=False, silent=True, command="")

    try:
        with winreg.CreateKeyEx(winreg.HKEY_CURRENT_USER, _RUN_KEY_PATH, 0, winreg.KEY_SET_VALUE) as key:
            if enabled:
                command = _build_command(silent=silent)
                winreg.SetValueEx(key, _RUN_VALUE_NAME, 0, winreg.REG_SZ, command)
                return AutostartState(enabled=True, silent=silent, command=command)
            try:
                winreg.DeleteValue(key, _RUN_VALUE_NAME)
            except FileNotFoundError:
                pass
    except OSError as exc:
        raise RuntimeError(f"failed to update autostart registry: {exc}") from exc

    return get_autostart_state()


def toggle_autostart(*, silent: bool = True) -> AutostartState:
    current = get_autostart_state()
    return set_autostart(enabled=not current.enabled, silent=silent)

