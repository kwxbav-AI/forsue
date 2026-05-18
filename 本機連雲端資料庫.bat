@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo ========================================
echo   本機開發 - 資料庫連線檢查
echo ========================================
echo.
call npm run db:check
echo.
if %ERRORLEVEL% EQU 2 (
  echo 請開啟 docs\本機開發連雲端資料庫.md
  echo 將 Vercel 的 DATABASE_URL 貼到 .env 後再執行本檔案。
  echo.
  pause
  exit /b 2
)
pause
