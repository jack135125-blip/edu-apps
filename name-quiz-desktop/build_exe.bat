@echo off
cd /d "%~dp0"
echo Installing dependencies...
python -m pip install -r requirements.txt
echo.
echo Building exe...
python -m PyInstaller --noconfirm --clean NameQuiz.spec

echo.
if exist "dist\NameQuiz\NameQuiz.exe" (
  echo Build OK: dist\NameQuiz\NameQuiz.exe
) else (
  echo Build failed.
)
pause
