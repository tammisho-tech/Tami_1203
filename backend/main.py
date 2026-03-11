"""
TAMI - Reading Comprehension Test Generator
FastAPI application entry point.
"""
import sys
import io
from pathlib import Path
from dotenv import load_dotenv

# Load .env before any other imports that use env vars (e.g. config, anthropic)
load_dotenv(Path(__file__).parent / ".env")

# Force UTF-8 stdout so Hebrew print() calls work on Windows
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
else:
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

from contextlib import asynccontextmanager

import traceback

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from knowledge.loader import load_all
from models.database import init_db
from routers import exams, students, analytics


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    print("[TAMI] Initializing database...")
    await init_db()
    print("[TAMI] Loading knowledge base...")
    load_all()
    print("[TAMI] Ready.")
    yield
    # Shutdown (nothing to clean up)


app = FastAPI(
    title="TAMI — מחולל מבחני הבנת הנקרא",
    description="Hebrew Reading Comprehension Test Generator (RAMA Standards)",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS — allow React dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:5175",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
        "http://127.0.0.1:5175",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(exams.router)
app.include_router(students.router)
app.include_router(analytics.router)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    tb = traceback.format_exc()
    print(f"[ERROR] {request.method} {request.url}\n{tb}", flush=True)

    # API errors (Anthropic / OpenAI)
    exc_str = str(exc)
    exc_type = type(exc).__name__
    if "insufficient_quota" in exc_str or "credit_balance" in exc_str or (
        "quota" in exc_str.lower() and "rate" not in exc_str.lower()
    ):
        detail = "מכסת ה-API אזלה. יש לבדוק את פרטי החיוב בחשבון Anthropic ולטעון קרדיטים."
    elif "rate_limit" in exc_str or "rate limit" in exc_str.lower() or (
        "429" in exc_str and "RateLimitError" in exc_type
    ):
        detail = "חריגה ממגבלת קצב ה-API. אנא המתיני מספר שניות ונסי שוב."
    elif "authentication" in exc_str.lower() or "invalid x-api-key" in exc_str.lower() or (
        "AuthenticationError" in exc_type
    ):
        detail = "מפתח ה-API אינו תקין. יש לבדוק את ה-ANTHROPIC_API_KEY בהגדרות."
    else:
        detail = f"שגיאת שרת פנימית: {exc_str}"

    return JSONResponse(status_code=500, content={"detail": detail})


@app.get("/health")
async def health():
    return {"healthy": True}


# Serve React frontend — must be LAST (catch-all)
_DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
print(f"[TAMI] Frontend dist: {_DIST} (exists={_DIST.exists()})", flush=True)
if _DIST.exists():
    app.mount("/assets", StaticFiles(directory=_DIST / "assets"), name="assets")

    @app.get("/")
    async def serve_index():
        return FileResponse(_DIST / "index.html")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        # Return index.html for all non-API routes (SPA routing)
        file_path = _DIST / full_path
        if file_path.exists() and file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(_DIST / "index.html")
else:
    @app.get("/")
    async def root():
        return {"status": "ok", "app": "TAMI", "version": "1.0.0"}
