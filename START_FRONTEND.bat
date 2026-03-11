@echo off
echo Starting TAMI Frontend...
cd /d "%~dp0frontend"
if not exist "node_modules" (
    echo Installing npm packages...
    npm install
)
echo.
echo Starting dev server at http://localhost:5173
npm run dev
