@echo off
cd /d "%~dp0"

REM Try to find Node.js if not in PATH (e.g. installed for current user)
set "NODE_PATH="
if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_PATH=%ProgramFiles%\nodejs"
if exist "%ProgramFiles(x86)%\nodejs\node.exe" set "NODE_PATH=%ProgramFiles(x86)%\nodejs"
if exist "%LOCALAPPDATA%\Programs\node\node.exe" set "NODE_PATH=%LOCALAPPDATA%\Programs\node"
if defined NODE_PATH set "PATH=%NODE_PATH%;%PATH%"

where npm >nul 2>&1
if errorlevel 1 (
    echo ========================================
    echo   ERROR: npm / Node.js not found
    echo ========================================
    echo.
    echo Please install Node.js first:
    echo   1. Open: https://nodejs.org/
    echo   2. Download the LTS version
    echo   3. Run the installer (check "Add to PATH"^)
    echo   4. Restart this run.bat
    echo.
    pause
    exit /b 1
)

echo ========================================
echo   Daily Performance System - Starting
echo ========================================
echo.

if not exist "node_modules" (
    echo [1/3] Installing dependencies...
    call npm install
    if errorlevel 1 (
        echo Install failed. Check Node.js.
        pause
        exit /b 1
    )
    echo.
) else (
    echo [1/3] Dependencies OK
)

echo [2/3] Starting dev server in new window...
start "Performance-Server" /D "%~dp0" cmd /k "set PATH=%PATH% && npm run dev"

echo [3/3] Waiting 15 sec for server to start, then opening browser...
timeout /t 15 /nobreak >nul

start "" "http://localhost:3000"

echo.
echo If you see "Cannot connect" in browser: wait until the server
echo window shows "Ready" then press F5 to refresh the page.
echo Close the "Performance-Server" window to stop the system.
echo.
pause
