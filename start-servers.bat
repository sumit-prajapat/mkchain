@echo off
echo ========================================
echo Starting MKChain Development Servers
echo ========================================
echo.

echo [1/2] Starting Backend API Server...
start "MKChain Backend" cmd /k "cd /d d:\projects\mkchain\backend && python -m uvicorn main:app --reload"

timeout /t 3 /nobreak > nul

echo [2/2] Starting Frontend Dev Server...
start "MKChain Frontend" cmd /k "cd /d d:\projects\mkchain\frontend && npm run dev"

echo.
echo ========================================
echo Servers are starting...
echo ========================================
echo.
echo Backend:  http://localhost:8000
echo Frontend: http://localhost:5173
echo API Docs: http://localhost:8000/docs
echo.
echo Press any key to open the app in browser...
pause > nul

start http://localhost:5173

echo.
echo Servers are running!
echo Close this window when done.
echo.
