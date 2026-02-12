"""ACM Helper Backend Server with System Tray Icon."""

from __future__ import annotations

import argparse
import logging
import os
import sys
import threading
import time
from pathlib import Path

# Fix for PyInstaller frozen mode - must be at top
if getattr(sys, "frozen", False):
    import multiprocessing

    multiprocessing.freeze_support()

    # Redirect stdout/stderr for windowless mode
    if sys.stdout is None:
        sys.stdout = open(os.devnull, "w")
    if sys.stderr is None:
        sys.stderr = open(os.devnull, "w")


def _parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("--silent", action="store_true", help="run in silent mode")
    args, _ = parser.parse_known_args(argv)
    return args


def get_base_path() -> str:
    """Get the base path for resources."""
    if getattr(sys, "frozen", False):
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.abspath(__file__))


def run_server() -> None:
    """Run the FastAPI server."""
    try:
        logging.getLogger("uvicorn").setLevel(logging.WARNING)
        logging.getLogger("uvicorn.access").setLevel(logging.WARNING)

        import uvicorn
        from src.main import app

        config = uvicorn.Config(
            app,
            host="127.0.0.1",
            port=8000,
            log_level="warning",
            access_log=False,
        )
        server = uvicorn.Server(config)
        server.run()
    except Exception:
        # Keep silent in tray mode.
        pass


def main() -> None:
    _parse_args(sys.argv[1:])

    try:
        import pystray
        from PIL import Image
    except ImportError:
        run_server()
        return

    from src.services.autostart import get_autostart_state, toggle_autostart

    def get_icon_image():
        try:
            icon_path = Path(get_base_path()) / "icon.ico"
            if icon_path.exists():
                return Image.open(icon_path)
        except Exception:
            pass
        return Image.new("RGB", (64, 64), color=(34, 197, 94))

    def on_exit(icon, item):
        icon.stop()
        os._exit(0)

    def on_toggle_autostart(icon, item):
        try:
            toggle_autostart(silent=True)
        except Exception:
            pass
        icon.update_menu()

    def autostart_checked(item):
        return get_autostart_state().enabled

    menu = pystray.Menu(
        pystray.MenuItem("开机静默自启动", on_toggle_autostart, checked=autostart_checked),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem("退出", on_exit),
    )

    server_thread = threading.Thread(target=run_server, daemon=True)
    server_thread.start()
    time.sleep(1)

    icon = pystray.Icon(
        "ACM Helper",
        get_icon_image(),
        "ACM Helper - 127.0.0.1:8000",
        menu,
    )
    icon.run()


if __name__ == "__main__":
    main()
