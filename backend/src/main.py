from __future__ import annotations

from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from .routes.dashboard import router as dashboard_router
from .routes.problems import router as problems_router
from .routes.reports import router as reports_router
from .routes.settings import router as settings_router
from .routes.solutions import router as solutions_router
from .routes.stats import router as stats_router

app = FastAPI(title="ACM Helper Backend", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(problems_router)
app.include_router(solutions_router)
app.include_router(dashboard_router)
app.include_router(reports_router)
app.include_router(settings_router)
app.include_router(stats_router)


@app.get("/health")
def health() -> dict:
    return {"ok": True}


# Static file serving for solution images
from .routes.shared import get_file_manager
from .storage.file_manager import FileManager

@app.get("/static/solution-images/{relative_path:path}")
def serve_solution_image(
    relative_path: str,
    fm: FileManager = Depends(get_file_manager),
):
    path = fm.get_solution_image_path(relative_path)
    if not path or not path.exists():
        raise HTTPException(status_code=404, detail="Image not found")
    return FileResponse(path)
