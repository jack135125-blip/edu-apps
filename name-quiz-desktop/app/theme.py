"""폰트·테마 — 본문 Pretendard(선명), 큰 제목만 Jua."""
from __future__ import annotations

import ctypes
import sys
from ctypes import wintypes
from pathlib import Path

import customtkinter as ctk

APP_ROOT = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent.parent))
FONT_DIR = APP_ROOT / "assets" / "fonts"

COLORS = {
    "bg": "#F3FBF7",
    "bg2": "#E7F6EF",
    "panel": "#FFFFFF",
    "panel_soft": "#F7FFFB",
    "accent": "#2BB673",
    "accent_hover": "#24A366",
    "accent_soft": "#D8F5E7",
    "peach": "#FF8F6B",
    "peach_hover": "#F57B55",
    "peach_soft": "#FFE8E0",
    "sky": "#4BA3C7",
    "sky_soft": "#E3F4FB",
    "text": "#24352C",
    "muted": "#5F7268",
    "line": "#D7EBE1",
    "card": "#FFFFFF",
    "ok": "#2F9E6D",
    "bad": "#E45D5D",
}

_FONTS_READY = False
_BODY = "Malgun Gothic"
_DISPLAY = "Malgun Gothic"

FR_PRIVATE = 0x10


def _register_font_file(path: Path) -> bool:
    """Windows에 폰트 파일을 프로세스 단위로 등록 + CTk FontManager 로드."""
    ok = False
    try:
        if ctk.FontManager.load_font(str(path)):
            ok = True
    except Exception:
        pass
    try:
        add = ctypes.windll.gdi32.AddFontResourceExW
        add.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, wintypes.LPVOID]
        add.restype = ctypes.c_int
        if add(str(path), FR_PRIVATE, None) > 0:
            ok = True
    except Exception:
        pass
    return ok


def setup_fonts() -> str:
    global _FONTS_READY, _BODY, _DISPLAY
    if _FONTS_READY:
        return _BODY

    # 본문: Pretendard (얇고 선명)
    pretendard_ok = False
    for name in (
        "Pretendard-Regular.ttf",
        "Pretendard-Medium.ttf",
        "Pretendard-SemiBold.ttf",
        "Pretendard-Bold.ttf",
    ):
        path = FONT_DIR / name
        if path.exists() and _register_font_file(path):
            pretendard_ok = True
    if pretendard_ok:
        _BODY = "Pretendard"

    # 큰 타이틀용: Jua
    jua = FONT_DIR / "Jua-Regular.ttf"
    if jua.exists() and _register_font_file(jua):
        _DISPLAY = "Jua"
    else:
        _DISPLAY = _BODY

    _FONTS_READY = True
    return _BODY


def F(size: int = 15, weight: str = "normal", *, display: bool = False) -> ctk.CTkFont:
    """
    display=True → Jua (앱 메인 타이틀만)
    기본 → Pretendard (선명한 본문, 너무 두껍지 않음)
    """
    setup_fonts()
    if display:
        return ctk.CTkFont(family=_DISPLAY, size=size + 2, weight="normal")

    # bold는 SemiBold 느낌으로만 — 과도한 두께 방지
    w = "bold" if weight in ("bold", "semibold") else "normal"
    return ctk.CTkFont(family=_BODY, size=size + 3, weight=w)


def DF(size: int = 22) -> ctk.CTkFont:
    return F(size, display=True)
