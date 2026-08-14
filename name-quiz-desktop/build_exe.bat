@echo off
cd /d "%~dp0"
echo Installing dependencies...
python -m pip install -r requirements.txt
echo.
echo Building exe...
python -m PyInstaller --noconfirm --clean ^
  --name "NameQuiz" ^
  --windowed ^
  --noconsole ^
  --collect-all customtkinter ^
  --hidden-import PIL._tkinter_finder ^
  --add-data "assets/fonts;assets/fonts" ^
  main.py

echo.
if exist "dist\NameQuiz\NameQuiz.exe" (
  echo Build OK: dist\NameQuiz\NameQuiz.exe
) else (
  echo Build failed.
)
pause
