@echo off
cd /d "%~dp0"
title Name Quiz
where python >nul 2>&1 && set PY=python
if not defined PY where py >nul 2>&1 && set PY=py
if not defined PY (
  echo Python is required. Install from https://www.python.org/downloads/
  echo Check "Add python.exe to PATH" during setup.
  pause
  exit /b 1
)

rem 항상 같은 주소 사용 (포트가 바뀌면 저장 데이터가 사라짐)
set PORT=5500
set APP_URL=http://127.0.0.1:5500/

echo Starting Name Quiz at %APP_URL%
echo Keep this window open while using the app.
echo Close this window to stop the server.
echo.

start "" "%APP_URL%"
%PY% -m http.server %PORT% --bind 127.0.0.1
if errorlevel 1 (
  echo.
  echo Port %PORT% may already be in use.
  echo Opening the existing app instead...
  start "" "%APP_URL%"
  pause
)
