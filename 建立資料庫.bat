@echo off
cd /d "%~dp0"
echo Creating database daily_performance...
echo.
echo If this fails, create it manually in pgAdmin:
echo   1. Open pgAdmin, connect to localhost
echo   2. Right-click Databases - New - Database
echo   3. Name: daily_performance
echo   4. Save
echo.
set PGPASSWORD=1234
psql -U postgres -h localhost -p 5432 -c "CREATE DATABASE daily_performance WITH ENCODING 'UTF8';" 2>nul
if errorlevel 1 (
  echo.
  echo psql not found or failed. Please create database in pgAdmin as above.
) else (
  echo Database daily_performance created. Run: npx prisma db push
)
pause
