
### `run.bat` (Windows batch file to run the project)

```batch
@echo off
echo ========================================
echo Money Muling Detection Engine
echo RIFT 2026 Hackathon
echo ========================================
echo.

REM Check if Python is installed
python --version >nul 2>&1
if errorlevel 1 (
    echo Python is not installed or not in PATH
    echo Please install Python 3.9+ from https://www.python.org/
    pause
    exit /b 1
)

REM Check if virtual environment exists
if not exist "venv" (
    echo Creating virtual environment...
    python -m venv venv
)

REM Activate virtual environment
echo Activating virtual environment...
call venv\Scripts\activate.bat

REM Install requirements
echo Installing dependencies...
pip install -r backend\requirements.txt

REM Run the application
echo.
echo Starting the server...
echo Open http://localhost:5000 in your browser
echo.
cd backend
python app.py

pause
