@echo off
title Solar Tracker — Local Dev Server
echo.
echo  =========================================================
echo   Microcontroller-Based Active Solar Tracking System
echo   Local HTTP Server starting on http://localhost:8080
echo  =========================================================
echo.
echo  Open your browser and go to:  http://localhost:8080
echo  Press Ctrl+C to stop the server.
echo.

REM Try Node.js first (npx serve), then fall back to Python
where node >nul 2>&1
IF %ERRORLEVEL% == 0 (
    echo  [Using Node.js http-server]
    npx --yes http-server . -p 8080 -c-1 --cors -o
    GOTO :END
)

where python >nul 2>&1
IF %ERRORLEVEL% == 0 (
    echo  [Using Python http.server]
    start "" "http://localhost:8080"
    python -m http.server 8080
    GOTO :END
)

echo ERROR: Neither Node.js nor Python found. Please install one and retry.
pause

:END

