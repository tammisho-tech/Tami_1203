@echo off
chcp 65001 >nul
echo ============================================
echo   Railway CLI - הגדרת התחברות
echo ============================================
echo.

REM Clear stale tokens that may cause "Unauthorized" or "Invalid session"
set RAILWAY_TOKEN=
set RAILWAY_API_TOKEN=

echo [1/3] בודק התחברות...
railway whoami 2>nul
if %ERRORLEVEL% EQU 0 (
    echo.
    echo ✓ כבר מחוברת! אפשר להמשיך לפריסה.
    goto :deploy
)

echo.
echo [2/3] נדרשת התחברות.
echo.
echo אפשרות א' - התחברות רגילה (יפתח דפדפן):
echo   railway login
echo.
echo אפשרות ב' - התחברות עם טוקן:
echo   1. היכנסי ל- https://railway.app והתחברי
echo   2. גלשי ל- https://railway.app/account/tokens
echo   3. צרי טוקן חדש
echo   4. הרצי: set RAILWAY_API_TOKEN=הטוקן_שלך
echo   5. הרצי שוב את הקובץ הזה
echo.
pause
railway login
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ההתחברות נכשלה. נסי את אפשרות ב' עם טוקן.
    pause
    exit /b 1
)

:deploy
echo.
echo [3/3] פריסה (Backend + Frontend)...
cd /d "%~dp0"
railway status 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo יוצר פרויקט חדש...
    railway init
)
railway up
echo.
echo ✓ הושלם.
echo.
pause
