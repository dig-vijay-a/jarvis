@echo off
TITLE NOVA Personal AI Operating System — JARVIS Core
COLOR 0B

echo =====================================================================
echo    NOVA PERSONAL AI OPERATING SYSTEM — PRODUCTION LAUNCH SEQUENCE    
echo =====================================================================
echo.

cd /d "%~dp0\..\.."

:: 1. Verify Node.js Environment
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js is not found in PATH. Please install Node.js 18+ to run NOVA.
    pause
    exit /b 1
)

:: 2. Verify Python Environment
where python >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Python is not found in PATH. Please install Python 3.10+ to run the local agent.
    pause
    exit /b 1
)

echo [1/3] Launching NOVA Process Supervisor (Backend + Python Agent)...
start "NOVA Supervisor Core" cmd /c "node nova\backend\supervisor.js"

echo [2/3] Waiting for Core Services to link...
timeout /t 3 /nobreak >nul

echo [3/3] Launching NOVA Futuristic HUD Frontend...
start "NOVA HUD Frontend" cmd /c "cd nova\frontend && npm run dev"

echo.
echo =====================================================================
echo    NOVA OS 1.0 IS FULLY OPERATIONAL                                   
echo    Frontend: http://localhost:3000                                    
echo    Backend:  http://localhost:5000                                    
echo    Agent:    http://127.0.0.1:8000 (Loopback Protected)               
echo =====================================================================
echo.
