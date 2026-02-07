from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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
