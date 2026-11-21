#!/usr/bin/env python3
"""在 emulator/真机的 WebView 里跑 JS（只有调试包开放 DevTools）。

用法：
    python3 scripts/cdp.py eval '<JS 表达式>'
    python3 scripts/cdp.py tap '#btnNew'            # 按元素中心发真实 adb tap
    python3 scripts/cdp.py dump                      # 列出可选目标

前置：
    adb forward tcp:9222 localabstract:webview_devtools_remote_<pid>

零依赖：WebSocket 客户端手写（stdlib socket + 掩码帧），只做 Runtime.evaluate。
"""
import base64
import json
import os
import socket
import struct
import subprocess
import sys

PORT = int(os.environ.get("CDP_PORT", "9222"))


def http_get(path):
    import urllib.request
    with urllib.request.urlopen(f"http://127.0.0.1:{PORT}{path}", timeout=8) as r:
        return json.loads(r.read().decode("utf-8"))


class WS:
    def __init__(self, ws_url):
        hostport, _, path = ws_url[len("ws://"):].partition("/")
        host, _, port = hostport.partition(":")
        self.sock = socket.create_connection((host, int(port or 80)), timeout=15)
        key = base64.b64encode(os.urandom(16)).decode()
        self.sock.sendall(
            f"GET /{path} HTTP/1.1\r\nHost: {host}:{port}\r\nUpgrade: websocket\r\n"
            f"Connection: Upgrade\r\nSec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n".encode()
        )
        head = b""
        while b"\r\n\r\n" not in head:
            head += self.sock.recv(4096)
        if b" 101 " not in head.split(b"\r\n", 1)[0]:
            raise RuntimeError("WebSocket 握手失败：" + head.split(b"\r\n", 1)[0].decode(errors="replace"))
        self.buf = head.split(b"\r\n\r\n", 1)[1]

    def send(self, text):
        payload = text.encode("utf-8")
        mask = os.urandom(4)
        out = bytearray([0x81])
        n = len(payload)
        if n < 126:
            out.append(0x80 | n)
        elif n < 65536:
            out.append(0x80 | 126)
            out += struct.pack(">H", n)
        else:
            out.append(0x80 | 127)
            out += struct.pack(">Q", n)
        out += mask + bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
        self.sock.sendall(bytes(out))

    def _need(self, count):
        while len(self.buf) < count:
            chunk = self.sock.recv(65536)
            if not chunk:
                raise RuntimeError("连接被断开")
            self.buf += chunk

    def recv(self):
        while True:
            self._need(2)
            b1, b2 = self.buf[0], self.buf[1]
            ln, off = b2 & 0x7F, 2
            if ln == 126:
                self._need(4)
                ln = struct.unpack(">H", self.buf[2:4])[0]
                off = 4
            elif ln == 127:
                self._need(10)
                ln = struct.unpack(">Q", self.buf[2:10])[0]
                off = 10
            self._need(off + ln)
            frame = bytes(self.buf[off:off + ln])
            self.buf = self.buf[off + ln:]
            if b1 & 0x0F == 0x1:
                return frame.decode("utf-8", errors="replace")


class Page:
    def __init__(self):
        targets = http_get("/json")
        pages = [t for t in targets if t.get("type") == "page"]
        page = next((t for t in pages if "index.html" in t.get("url", "")), pages[0] if pages else None)
        if not page:
            raise RuntimeError("找不到页面；先 adb forward tcp:%d localabstract:webview_devtools_remote_$(adb shell pidof -s <包名>)" % PORT)
        self.ws = WS(page["webSocketDebuggerUrl"])
        self.id = 0

    def eval(self, expr):
        self.id += 1
        mid = self.id
        self.ws.send(json.dumps({
            "id": mid, "method": "Runtime.evaluate",
            "params": {"expression": expr, "returnByValue": True, "awaitPromise": True},
        }))
        while True:
            msg = json.loads(self.ws.recv())
            if msg.get("id") == mid:
                res = msg.get("result", {})
                if "exceptionDetails" in res:
                    raise RuntimeError(json.dumps(res["exceptionDetails"], ensure_ascii=False)[:1500])
                return res.get("result", {}).get("value")


def adb_tap(x, y):
    subprocess.run(["adb", "shell", "input", "tap", str(int(x)), str(int(y))], check=True)


def main(argv):
    if len(argv) < 2:
        print(__doc__)
        return 2
    cmd = argv[1]
    page = Page()
    if cmd == "dump":
        print(json.dumps(http_get("/json"), ensure_ascii=False, indent=2)[:3000])
        return 0
    if cmd == "eval":
        print(json.dumps(page.eval(argv[2]), ensure_ascii=False, indent=2))
        return 0
    if cmd == "tap":
        sel = argv[2]
        rect = page.eval(
            "(function(){var e=document.querySelector(%r);if(!e)return null;"
            "var r=e.getBoundingClientRect();return JSON.stringify({x:r.left+r.width/2,y:r.top+r.height/2,"
            "iw:innerWidth,ih:innerHeight,dpr:devicePixelRatio});})()" % sel
        )
        if not rect:
            print("找不到元素", sel, file=sys.stderr)
            return 1
        g = json.loads(rect)
        # CSS 像素 -> 物理像素：截图和 adb input 都在物理像素坐标系里
        sx = g["iw"] and 1.0 * g["dpr"]
        print("CSS 中心 (%.1f, %.1f)，视口 %sx%s，dpr=%s" % (g["x"], g["y"], g["iw"], g["ih"], g["dpr"]))
        adb_tap(g["x"] * sx, g["y"] * sx)
        return 0
    print("未知命令", cmd, file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
