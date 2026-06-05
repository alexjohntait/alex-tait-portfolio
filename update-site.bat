@echo off
cd /d "%~dp0"
echo.
echo Refreshing site from Airtable...
echo.

if "%AIRTABLE_TOKEN%"=="" (
  echo ERROR: AIRTABLE_TOKEN environment variable is not set.
  echo.
  echo To fix this, run this command once in a terminal:
  echo   setx AIRTABLE_TOKEN "your_token_here"
  echo Then close and reopen this window.
  pause
  exit /b 1
)

node refresh.mjs
if %errorlevel% neq 0 (
  echo.
  echo Refresh failed. See error above.
  pause
  exit /b 1
)

echo.
echo Committing and pushing to GitHub...
git add -A
git diff --staged --quiet && (
  echo Nothing changed - site is already up to date.
  pause
  exit /b 0
)
git commit -m "Rebuild from Airtable"
git push
echo.
echo Done! Site will be live in about 30 seconds.
pause
