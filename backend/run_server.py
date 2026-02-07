"""ACM Helper Backend Server Entry Point.

This script is used for PyInstaller packaging.
"""
import uvicorn
from src.main import app

if __name__ == "__main__":
    print("=" * 50)
    print("ACM Helper Backend v2.0.0")
    print("Server running at http://127.0.0.1:8000")
    print("Press Ctrl+C to stop")
    print("=" * 50)
    uvicorn.run(app, host="127.0.0.1", port=8000)
