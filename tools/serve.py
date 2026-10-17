#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
许雪然主页 · 本地静态服务器
------------------------------------------------------------------
为什么需要它：Firefox 的新标签页只能由扩展用 chrome_url_overrides 顶替，
而能装的扩展（New Tab Override）只接受 http(s):// 和 moz-extension:// 网址，
file:// 会被它自己的正则挡回去。所以这里在 127.0.0.1 上开一个只监听本机的小服务，
主页和新标签页都指向 http://127.0.0.1:8888/ 。

· 只绑定 127.0.0.1，外网访问不到
· 关掉缓存（改了页面不用清缓存）
· 用 pythonw 启动就没有黑框窗口
· 端口想换：环境变量 XUERAN_PORT（默认 8888）

/icon?u=<图片地址>  ：图标代理 + 磁盘缓存
  页面里跨域取图会被 CORS 挡，走这个同源代理就没事；而且只去外网取一次，
  之后从 tools/.icon-cache 直接给。页面那边还会把图转成 data URL 存进浏览器，
  所以再打开就是秒出、完全不联网。

（以前这里还有个 /__config 端点，用来在换端口时搬配置 —— 那个设计有风险，
 会拿"服务端存的一份配置"去覆盖浏览器里的配置，已经删掉了。）
"""

import functools
import hashlib
import http.server
import os
import re
import socketserver
import sys
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = int(os.environ.get("XUERAN_PORT", "8888"))
HOST = "127.0.0.1"
ICON_DIR = os.path.join(ROOT, "tools", ".icon-cache")
ICON_MAX_BYTES = 512 * 1024
ICON_TIMEOUT = 8.0
ICON_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) XueRanHome/1.0"


def icon_cache_paths(url):
    key = hashlib.sha1(url.encode("utf-8")).hexdigest()
    return os.path.join(ICON_DIR, key), os.path.join(ICON_DIR, key + ".ctype")


class Handler(http.server.SimpleHTTPRequestHandler):
    """静态文件 + 关缓存 + /icon 图标代理"""

    def end_headers(self):
        if getattr(self, "_cacheable", False):
            super().end_headers()          # /icon 让浏览器也能缓存，别再压 no-store
            return
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, fmt, *args):  # 静音
        pass

    # ---------------- /icon?u=<url> ----------------
    def do_GET(self):
        if self.path.split("?", 1)[0] == "/icon":
            self._serve_icon()
            return
        super().do_GET()

    def do_HEAD(self):
        if self.path.split("?", 1)[0] == "/icon":
            self._serve_icon(head_only=True)
            return
        super().do_HEAD()

    def _serve_icon(self, head_only=False):
        self._cacheable = True
        query = urllib.parse.urlparse(self.path).query
        target = (urllib.parse.parse_qs(query).get("u") or [""])[0]
        if not re.match(r"^https?://", target, re.I):
            return self._fail(400)

        path, ctype_path = icon_cache_paths(target)
        if os.path.isfile(path):
            with open(path, "rb") as fh:
                data = fh.read()
            ctype = "image/png"
            if os.path.isfile(ctype_path):
                with open(ctype_path, "r", encoding="utf-8") as fh:
                    ctype = fh.read().strip() or ctype
            return self._send(data, ctype, head_only)

        # 缓存里没有 → 去外网取一次
        req = urllib.request.Request(target, headers={"User-Agent": ICON_UA, "Accept": "image/*,*/*;q=0.8"})
        try:
            with urllib.request.urlopen(req, timeout=ICON_TIMEOUT) as resp:
                ctype = (resp.headers.get("Content-Type") or "").split(";")[0].strip().lower()
                data = resp.read(ICON_MAX_BYTES + 1)
        except Exception:
            return self._fail(502)

        if not ctype.startswith("image/") or not data or len(data) > ICON_MAX_BYTES:
            return self._fail(502)

        try:
            os.makedirs(ICON_DIR, exist_ok=True)
            with open(path, "wb") as fh:
                fh.write(data)
            with open(ctype_path, "w", encoding="utf-8") as fh:
                fh.write(ctype)
        except OSError:
            pass
        return self._send(data, ctype, head_only)

    def _send(self, data, ctype, head_only=False):
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "public, max-age=604800")
        self.end_headers()
        if not head_only:
            self.wfile.write(data)

    def _fail(self, code):
        self.send_response(code)
        self.send_header("Content-Length", "0")
        self.end_headers()


class ReusableServer(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


def main():
    if not os.path.isfile(os.path.join(ROOT, "index.html")):
        print("找不到 index.html，ROOT =", ROOT, file=sys.stderr)
        return 1

    handler = functools.partial(Handler, directory=ROOT)
    try:
        with ReusableServer((HOST, PORT), handler) as httpd:
            print(f"许雪然主页服务已启动: http://{HOST}:{PORT}/  ->  {ROOT}")
            httpd.serve_forever()
    except OSError as exc:
        print(f"端口 {PORT} 起不来（可能已经在跑了）: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
