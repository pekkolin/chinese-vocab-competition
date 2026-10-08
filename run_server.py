#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
臺灣正體中文 識字比賽播放與評分系統 - 本地伺服器
用途：
1. 啟動本機簡易 Web 伺服器並自動開啟比賽瀏覽器
2. 支援現場評審 iPad / 手機等跨設備區域網路評分同步 API
"""

import http.server
import socketserver
import webbrowser
import threading
import os
import sys
import json
import socket

# 設定輸出編碼為 UTF-8
if sys.stdout and sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

PORT = 8080
DIRECTORY = os.path.dirname(os.path.abspath(__file__))
DATA_FILE = os.path.join(DIRECTORY, "competition_data.json")

def get_lan_ip():
    """獲取本機在區域網路 (Wi-Fi/LAN) 的 IP 位址"""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"

class ScoringServerHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def log_message(self, format, *args):
        # 保持控制台簡潔，僅在 API 請求時適當記錄
        pass

    def do_GET(self):
        if self.path == '/api/data':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            if os.path.exists(DATA_FILE):
                try:
                    with open(DATA_FILE, 'r', encoding='utf-8') as f:
                        data = f.read()
                    self.wfile.write(data.encode('utf-8'))
                    return
                except Exception:
                    pass
            self.wfile.write(b'{}')
            return
        super().do_GET()

    def do_POST(self):
        if self.path == '/api/save':
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            try:
                parsed = json.loads(post_data.decode('utf-8'))
                with open(DATA_FILE, 'w', encoding='utf-8') as f:
                    json.dump(parsed, f, ensure_ascii=False, indent=2)
                self.send_response(200)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(b'{"status":"ok"}')
            except Exception as e:
                self.send_response(500)
                self.end_headers()
                self.wfile.write(f'{{"error":"{str(e)}"}}'.encode('utf-8'))
            return
        super().do_POST()

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

def open_browser():
    url = f"http://localhost:{PORT}/index.html"
    print(f"正在為您開啟比賽播放視窗：{url}")
    webbrowser.open(url)

def main():
    os.chdir(DIRECTORY)
    global PORT
    lan_ip = get_lan_ip()

    for p in range(8080, 8100):
        try:
            with socketserver.TCPServer(("", p), ScoringServerHandler) as httpd:
                PORT = p
                print("==================================================================")
                print("   🏆 臺灣正體中文 識字比賽 播放與評分系統 已成功啟動！")
                print("==================================================================")
                print(f"   📺 比賽大螢幕播放器：  http://localhost:{PORT}/index.html")
                print(f"   🧑‍⚖️ 現場評審與主辦系統：http://localhost:{PORT}/scoring.html")
                print("------------------------------------------------------------------")
                print("   📱 現場評審老師 iPad / 手機 連線專用網址 (同一 Wi-Fi 下)：")
                print(f"      👉 http://{lan_ip}:{PORT}/scoring.html")
                print("==================================================================")
                print("   提示：評審打分將即時雙向同步，關閉此視窗或按 Ctrl+C 即可停止。")
                print("==================================================================")
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
