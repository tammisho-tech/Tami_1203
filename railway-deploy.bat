@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ============================================
echo   Railway - פריסה אוטומטית
echo ============================================
echo.

REM Check for token file
if not exist ".railway-token" (
    echo אין טוקן. עקבי אחרי השלבים:
    echo.
    echo 1. היכנסי ל- https://railway.app והתחברי
    echo 2. גלשי ל- https://railway.app/account/tokens
    echo 3. צרי טוקן חדש והעתיקי אותו
    echo 4. צרי קובץ בשם .railway-token בתיקייה זו
    echo 5. הדביקי את הטוקן לתוך הקובץ ושמרי
    echo 6. הרצי שוב את הקובץ הזה
    echo.
    pause
    exit /b 1
)

set /p RAILWAY_API_TOKEN=<.railway-token
set RAILWAY_API_TOKEN=%RAILWAY_API_TOKEN: =%

railway whoami
if %ERRORLEVEL% NEQ 0 (
    echo הטוקן לא תקין. בדקי את הקובץ .railway-token
    pause
    exit /b 1
)

echo.
echo מפריס...
railway status 2>nul
if %ERRORLEVEL% NEQ 0 (
    railway init
)
railway up

echo.
echo הושלם.
pause
