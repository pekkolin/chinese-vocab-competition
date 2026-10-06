@echo off
chcp 65001 >nul
title 識字比賽播放工具
echo 正在啟動識字比賽播放系統...
python run_server.py
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo 提示：若未安裝 Python，您也可以直接在資料夾中雙擊 index.html 開啟！
    start "" "index.html"
)
pause
