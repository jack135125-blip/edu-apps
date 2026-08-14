"""네임브릿지 — 학생의 얼굴과 이름을 연결하는 교사용 학습 도구."""
from __future__ import annotations

import ctypes
import sys
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import webview

from app import storage
from app.api import Api


def _enable_dpi() -> None:
    if sys.platform != "win32":
        return
    try:
        ctypes.windll.shcore.SetProcessDpiAwareness(2)
    except Exception:
        try:
            ctypes.windll.user32.SetProcessDPIAware()
        except Exception:
            pass


def _hide_console() -> None:
    """개발 실행 시 cmd 창이 남지 않게 숨깁니다. exe는 원래 창만 뜹니다."""
    if sys.platform != "win32" or getattr(sys, "frozen", False):
        return
    try:
        hwnd = ctypes.windll.kernel32.GetConsoleWindow()
        if hwnd:
            ctypes.windll.user32.ShowWindow(hwnd, 0)
    except Exception:
        pass


def _app_root() -> Path:
    if getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
        return Path(sys._MEIPASS)
    return Path(__file__).resolve().parent


class _QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, format: str, *args) -> None:  # noqa: A003
        return


def _serve_web(web_dir: Path) -> str:
    handler = partial(_QuietHandler, directory=str(web_dir))
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    port = httpd.server_address[1]
    return f"http://127.0.0.1:{port}/index.html"


def main() -> None:
    _enable_dpi()
    _hide_console()
    storage.ensure_dirs()

    web_dir = _app_root() / "web"
    if not (web_dir / "index.html").exists():
        raise FileNotFoundError(f"UI 파일을 찾을 수 없습니다: {web_dir}")

    api = Api()
    window = webview.create_window(
        "네임브릿지",
        url=_serve_web(web_dir),
        js_api=api,
        width=1120,
        height=800,
        min_size=(960, 700),
        background_color="#F3FBF7",
        text_select=True,
    )
    api._attach_window(window)
    try:
        webview.start(gui="edgechromium", debug=False)
    except Exception:
        webview.start(debug=False)


if __name__ == "__main__":
    main()
