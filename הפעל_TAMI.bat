@echo off
echo ====================================
echo    TAMI - מפעיל שרתים
echo ====================================
echo.

REM --- Backend ---
echo מפעיל Backend (שרת)...
start "TAMI Backend" cmd /k "cd /d "%~dp0backend" && if not exist .venv python -m venv .venv && call .venv\Scripts\activate && pip install -r requirements.txt -q && echo. && echo Backend פועל על http://localhost:8000 && uvicorn main:app --reload --port 8000"

REM --- wait a moment then start frontend ---
timeout /t 3 /nobreak >nul

echo מפעיל Frontend (ממשק)...
start "TAMI Frontend" cmd /k "cd /d "%~dp0frontend" && if not exist node_modules npm install && echo. && echo Frontend פועל על http://localhost:5173 && npm run dev"

echo.
echo ====================================
echo שני החלונות נפתחו!
echo המתיני כ-20 שניות ואז פתחי:
echo http://localhost:5173
echo ====================================
timeout /t 5 /nobreak >nul
start http://localhost:5173
