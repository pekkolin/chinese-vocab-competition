#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
臺灣正體中文 識字比賽播放工具 - 本地啟動伺服器
用途：啟動本機簡易 Web 伺服器並自動開啟瀏覽器
"""

import http.server
import socketserver
import webbrowser
import threading
import os
import sys

# 設定輸出編碼為 UTF-8
if sys.stdout and sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

PORT = 8080
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def log_message(self, format, *args):
        # 保持控制台乾淨，僅在需要時輸出
        pass

def open_browser():
    url = f"http://localhost:{PORT}/index.html"
    print(f"正在為您開啟瀏覽器：{url}")
    webbrowser.open(url)

def main():
    os.chdir(DIRECTORY)
    # 嘗試連接指定埠，若佔用則自動遞增
    global PORT
    for p in range(8080, 8100):
        try:
            with socketserver.TCPServer(("", p), QuietHandler) as httpd:
                PORT = p
                print("==================================================")
                print("   🏆 臺灣正體中文 識字比賽播放系統 已成功啟動！   ")
                print(f"   本地網址：http://localhost:{PORT}/index.html")
                print("   請在線上會議軟體（Zoom / Google Meet / Teams）")
                print("   分享此瀏覽器視窗，按 F 鍵或點擊全螢幕進行播放。")
                print("   關閉此視窗或按下 Ctrl+C 即可停止伺服器。")
                print("==================================================")
                threading.Timer(1.0, open_browser).start()
                httpd.serve_forever()
                break
        except OSError:
            continue

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n伺服器已正常停止。")
