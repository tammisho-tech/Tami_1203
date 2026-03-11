@echo off
echo Starting TAMI Backend...
cd /d "%~dp0backend"
if not exist ".venv" (
    echo Creating virtual environment...
    python -m venv .venv
)
call .venv\Scripts\activate
echo Installing dependencies...
pip install -r requirements.txt -q
echo.
echo Starting server at http://localhost:8000
echo Press Ctrl+C to stop.
uvicorn main:app --reload --port 8000
