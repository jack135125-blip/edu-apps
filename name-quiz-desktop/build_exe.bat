@echo off
cd /d "%~dp0"
echo Installing dependencies...
python -m pip install -r requirements.txt
echo.
echo Building exe...
python -m PyInstaller --noconfirm --clean NameQuiz.spec

echo.
if exist "dist\NameQuiz\NameQuiz.exe" (
  rem build\ holds an incomplete exe without _internal\ - delete it so it is not run by mistake
  if exist "build\NameQuiz\NameQuiz.exe" del /q "build\NameQuiz\NameQuiz.exe"
  echo Build OK
  echo Run this file: dist\NameQuiz\NameQuiz.exe
  echo Distribute the whole dist\NameQuiz folder ^(exe + _internal^).
  start "" "%~dp0dist\NameQuiz"
) else (
  echo Build failed.
)
pause
