@echo off
title Playlist Haven - Experience Engine Launcher
cls
echo ==========================================================
echo              LAUNCHING PLAYLIST HAVEN
echo ==========================================================
echo.
echo 1. Opening default web browser to http://localhost:3000...
start http://localhost:3000
echo.
echo 2. Starting Vite development server...
echo.
npm run dev
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Failed to start development server. 
    echo Please make sure Node.js is installed and run 'npm install' first.
    echo.
    pause
)
