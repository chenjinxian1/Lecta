@echo off
rem Lecta launcher. Keep this file pure ASCII: Chinese text plus
rem "chcp 65001" makes cmd.exe crash and close the window on some PCs.
setlocal
title Lecta
cd /d "%~dp0"

if not exist "kejian\__main__.py" (
  echo.
  echo  [!] Program files not found next to this .bat file.
  echo      If you opened it from inside the .zip, extract the zip first:
  echo      right-click the zip - "Extract All..." - then run the .bat in the extracted folder.
  echo.
  pause
  exit /b 1
)

rem ---- find a working Python 3.10+ (py launcher first, then python on PATH)
set "PY="
py -3 -c "import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)" >nul 2>nul && set "PY=py -3"
if not defined PY python -c "import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)" >nul 2>nul && set "PY=python"
if not defined PY (
  echo.
  echo  [!] Python 3.10 or newer was not found on this computer.
  echo.
  echo      1. Install Python from https://www.python.org/downloads/
  echo         and tick "Add python.exe to PATH" in the installer.
  echo      2. Close this window and double-click this .bat file again.
  echo.
  if not defined KJ_NO_OPEN (
    echo      Opening the download page and the instructions file now...
    start "" "https://www.python.org/downloads/"
    for %%F in (*.txt) do if /i not "%%F"=="requirements.txt" start "" notepad "%%F"
  )
  echo.
  pause
  exit /b 1
)

rem ---- install dependencies on first run
%PY% -c "import fitz" >nul 2>nul
if errorlevel 1 (
  %PY% -X utf8 -c "print('\u7b2c\u4e00\u6b21\u542f\u52a8\uff1a\u6b63\u5728\u5b89\u88c5\u4f9d\u8d56\uff0c\u9700\u8981\u8054\u7f51\uff0c\u5927\u7ea6 1-2 \u5206\u949f\u2026')"
  %PY% -m pip install --disable-pip-version-check -r requirements.txt
  %PY% -c "import fitz" >nul 2>nul || %PY% -m pip install --disable-pip-version-check pymupdf
  %PY% -c "import fitz" >nul 2>nul
  if errorlevel 1 (
    echo.
    echo  [!] Could not install the required package PyMuPDF.
    echo      Check the internet connection and run this .bat file again.
    echo      Error details are shown above.
    echo.
    pause
    exit /b 1
  )
)

rem ---- start (the browser opens http://127.0.0.1:8770 automatically)
%PY% -X utf8 -m kejian %*
if errorlevel 1 (
  echo.
  echo  [!] The program stopped with an error, details above.
  echo.
  pause
)
endlocal
