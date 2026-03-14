@echo off
chcp 65001 >nul
echo ========================================
echo   TAMI - Railway Deployment
echo ========================================
echo.
echo IMPORTANT: If not logged in, run first:
echo   railway login --browserless
echo Then visit the URL IMMEDIATELY (within 1 min)!
echo.
pause

echo [1/4] Checking Railway login...
railway whoami
if errorlevel 1 (
    echo.
    echo ERROR: Not logged in. Run: railway login --browserless
    echo Visit the URL immediately and complete login within 1-2 minutes.
    pause
    exit /b 1
)
echo OK - Logged in
echo.

echo [2/4] Creating project (if new)...
cd /d "%~dp0"
railway init --name TAMI
if errorlevel 1 (
    echo Trying to link to existing project...
    railway link
)
echo.

echo [3/4] Add PostgreSQL in Railway dashboard: + New -^> Database -^> PostgreSQL
echo.

echo [4/4] Deploying TAMI (backend + frontend)...
railway up
echo.

echo ========================================
echo   Deployment complete!
echo   Check: railway status
echo   Add variables in Railway dashboard:
echo   - ANTHROPIC_API_KEY
echo   - SECRET_KEY
echo ========================================
pause
