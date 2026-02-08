"""ACM Helper Backend Server with System Tray Icon.

This script runs the FastAPI server in background with a system tray icon.
"""
import os
import sys
import threading
import time
import logging

# Fix for PyInstaller frozen mode - must be at top
if getattr(sys, 'frozen', False):
    import multiprocessing
    multiprocessing.freeze_support()
    
    # Redirect stdout/stderr for windowless mode
    if sys.stdout is None:
        sys.stdout = open(os.devnull, 'w')
    if sys.stderr is None:
        sys.stderr = open(os.devnull, 'w')


def get_base_path():
    """Get the base path for resources."""
    if getattr(sys, 'frozen', False):
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.abspath(__file__))


def run_server():
    """Run the FastAPI server."""
    try:
        # Suppress uvicorn logging in windowless mode
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
        pass  # Silently fail in windowless mode


def main():
    """Main entry point."""
    try:
        import pystray
        from PIL import Image
    except ImportError:
        run_server()
        return

    # Load icon
    def get_icon_image():
        try:
            icon_path = os.path.join(get_base_path(), 'icon.ico')
            if os.path.exists(icon_path):
                return Image.open(icon_path)
        except Exception:
            pass
        return Image.new('RGB', (64, 64), color=(34, 197, 94))

    def on_exit(icon, item):
        icon.stop()
        os._exit(0)

    menu = pystray.Menu(
        pystray.MenuItem("退出", on_exit),
    )

    # Start server in background thread
    server_thread = threading.Thread(target=run_server, daemon=True)
    server_thread.start()
    
    time.sleep(1)

    icon = pystray.Icon(
        "ACM Helper",
        get_icon_image(),
        "ACM Helper - 127.0.0.1:8000",
        menu
    )
    icon.run()


if __name__ == "__main__":
    main()
