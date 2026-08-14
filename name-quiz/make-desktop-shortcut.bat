@echo off
cd /d "%~dp0"
set "DESKTOP=%USERPROFILE%\Desktop"
if exist "%USERPROFILE%\OneDrive\Desktop" if not exist "%DESKTOP%" set "DESKTOP=%USERPROFILE%\OneDrive\Desktop"
if exist "%USERPROFILE%\OneDrive\Desktop" if not exist "%DESKTOP%\*" set "DESKTOP=%USERPROFILE%\OneDrive\Desktop"
cscript //nologo "%~dp0_make_shortcut.vbs" "%DESKTOP%"
echo.
echo Desktop shortcut created: NameQuiz
echo Double-click it to open the app.
echo.
pause
