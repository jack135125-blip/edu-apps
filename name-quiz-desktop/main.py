"""
이름 외우기 — 이전 구성 + Jua 글꼴(크기 상향) + 엑셀 드래그앤드롭
"""
from __future__ import annotations

import sys
from pathlib import Path
from tkinter import filedialog, messagebox, simpledialog

import customtkinter as ctk
from PIL import Image

try:
    from tkinterdnd2 import DND_FILES, TkinterDnD

    _DND_OK = True
except Exception:
    _DND_OK = False

ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app import storage
from app.excel_import import import_roster_xlsx
from app.quiz import (
    MODES,
    accuracy_of,
    apply_review,
    build_queue,
    class_summary,
    ensure_stats,
    get_due_students,
    get_weak_students,
    names_match,
    pick_choices,
    record_answer,
)
from app.theme import COLORS, DF, F, setup_fonts

ctk.set_appearance_mode("light")
ctk.set_default_color_theme("green")


def pct(v: float | None) -> str:
    if v is None:
        return "—"
    return f"{round(v * 100)}%"


def bind_click(widget, callback):
    widget.bind("<Button-1>", lambda e: callback())
    for child in widget.winfo_children():
        bind_click(child, callback)


def parse_dnd_paths(data: str) -> list[str]:
    """tkinterdnd2 드롭 문자열에서 파일 경로 추출."""
    if not data:
        return []
    paths: list[str] = []
    s = data.strip()
    i = 0
    while i < len(s):
        if s[i] == "{":
            j = s.find("}", i)
            if j < 0:
                break
            paths.append(s[i + 1 : j])
            i = j + 1
            while i < len(s) and s[i].isspace():
                i += 1
        else:
            j = i
            while j < len(s) and not s[j].isspace():
                j += 1
            paths.append(s[i:j])
            i = j
            while i < len(s) and s[i].isspace():
                i += 1
    return [p for p in paths if p]


if _DND_OK:

    class _CTk(ctk.CTk, TkinterDnD.DnDWrapper):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, **kwargs)
            self.TkdndVersion = TkinterDnD._require(self)

else:
    _CTk = ctk.CTk


class NameQuizApp(_CTk):
    def __init__(self) -> None:
        super().__init__()
        setup_fonts()
        self.title("이름 외우기")
        self.geometry("1080x780")
        self.minsize(920, 680)
        self.configure(fg_color=COLORS["bg"])

        storage.ensure_dirs()
        self.current: dict | None = None
        self.quiz_state: dict | None = None
        self._photo_cache: dict[str, ctk.CTkImage] = {}

        self.grid_columnconfigure(0, weight=1)
        self.grid_rowconfigure(1, weight=1)

        self._build_header()

        self.container = ctk.CTkFrame(
            self,
            fg_color=COLORS["panel"],
            corner_radius=28,
            border_width=1,
            border_color=COLORS["line"],
        )
        self.container.grid(row=1, column=0, sticky="nsew", padx=22, pady=(0, 22))
        self.container.grid_columnconfigure(0, weight=1)
        self.container.grid_rowconfigure(0, weight=1)

        self.frames: dict[str, ctk.CTkFrame] = {}
        for name, cls in {"home": HomeFrame, "class": ClassFrame, "quiz": QuizFrame}.items():
            fr = cls(self.container, self)
            fr.grid(row=0, column=0, sticky="nsew", padx=22, pady=22)
            self.frames[name] = fr

        if _DND_OK:
            try:
                self.drop_target_register(DND_FILES)
                self.dnd_bind("<<Drop>>", self._on_window_drop)
            except Exception:
                pass

        self.show("home")

    def _build_header(self) -> None:
        self.head = ctk.CTkFrame(self, fg_color="transparent")
        self.head.grid(row=0, column=0, sticky="ew", padx=26, pady=(18, 14))
        self.head.grid_columnconfigure(0, weight=1)

        left = ctk.CTkFrame(self.head, fg_color="transparent")
        left.grid(row=0, column=0, sticky="w")

        ctk.CTkLabel(
            left,
            text="  선생님을 위한 이름 암기장  ",
            font=F(15),
            text_color=COLORS["accent"],
            fg_color=COLORS["accent_soft"],
            corner_radius=999,
        ).pack(anchor="w")

        self.title_lbl = ctk.CTkLabel(left, text="이름 외우기", font=DF(36), text_color=COLORS["text"])
        self.title_lbl.pack(anchor="w", pady=(6, 0))

        self.subtitle_lbl = ctk.CTkLabel(
            left,
            text="사진 명렬표를 불러오고, 퀴즈로 학생 이름을 익혀 보세요.",
            font=F(16),
            text_color=COLORS["muted"],
        )
        self.subtitle_lbl.pack(anchor="w", pady=(2, 0))

        self.head_btns = ctk.CTkFrame(self.head, fg_color="transparent")
        self.head_btns.grid(row=0, column=1, sticky="e")
        ctk.CTkButton(
            self.head_btns,
            text="빈 학급",
            width=120,
            height=48,
            corner_radius=24,
            fg_color=COLORS["sky_soft"],
            hover_color="#D5EEF8",
            text_color=COLORS["sky"],
            font=F(16),
            command=self.create_blank_class,
        ).pack(side="left", padx=6)
        ctk.CTkButton(
            self.head_btns,
            text="엑셀 불러오기",
            width=150,
            height=48,
            corner_radius=24,
            fg_color=COLORS["peach"],
            hover_color=COLORS["peach_hover"],
            text_color="#FFFFFF",
            font=F(16),
            command=self.open_import_dialog,
        ).pack(side="left", padx=6)

    def set_header_for(self, screen: str) -> None:
        if screen == "home":
            self.head_btns.grid()
            self.subtitle_lbl.configure(text="사진 명렬표를 불러오고, 퀴즈로 학생 이름을 익혀 보세요.")
        elif screen == "class":
            self.head_btns.grid_remove()
            self.subtitle_lbl.configure(text="퀴즈 · 명단 · 학습 현황을 탭에서 골라 주세요.")
        else:
            self.head_btns.grid_remove()
            self.subtitle_lbl.configure(text="천천히 익혀 봐요. 틀릴수록 복습에 더 자주 나와요.")

    def show(self, name: str) -> None:
        self.set_header_for(name)
        self.frames[name].tkraise()
        self.frames[name].on_show()

    def get_photo(self, path: str | None, size: tuple[int, int]) -> ctk.CTkImage | None:
        if not path or not Path(path).exists():
            return None
        key = f"{path}:{size[0]}x{size[1]}"
        if key in self._photo_cache:
            return self._photo_cache[key]
        try:
            img = Image.open(path).convert("RGB")
            cimg = ctk.CTkImage(light_image=img, dark_image=img, size=size)
            self._photo_cache[key] = cimg
            return cimg
        except Exception:
            return None

    def _on_window_drop(self, event) -> None:
        paths = parse_dnd_paths(getattr(event, "data", "") or "")
        xlsx = next((p for p in paths if p.lower().endswith(".xlsx")), None)
        if xlsx:
            self.import_excel_path(xlsx)

    def open_import_dialog(self) -> None:
        ImportDialog(self)

    def import_excel_path(self, path: str) -> None:
        if not path:
            return
        try:
            data = import_roster_xlsx(path)
            storage.save_class(data)
            self.current = storage.load_class(data["id"])
            messagebox.showinfo("완료", f"{len(data['students'])}명 학급을 저장했어요!", parent=self)
            self.show("class")
        except Exception as e:
            messagebox.showerror("불러오기 실패", str(e), parent=self)

    def import_excel(self) -> None:
        """호환용 — 파일 선택 대화상자."""
        path = filedialog.askopenfilename(
            title="사진 명렬표 선택",
            filetypes=[("Excel 파일", "*.xlsx"), ("모든 파일", "*.*")],
        )
        if path:
            self.import_excel_path(path)

    def create_blank_class(self) -> None:
        name = simpledialog.askstring("빈 학급", "학급 이름을 입력하세요:", parent=self)
        if not name:
            return
        data = {
            "id": storage.uid("class"),
            "name": name.strip(),
            "school": "",
            "subject": "",
            "teacher": "",
            "grade": None,
            "classNum": None,
            "dateLabel": "",
            "students": [],
        }
        storage.save_class(data)
        self.current = storage.load_class(data["id"])
        self.show("class")

    def open_class(self, class_id: str) -> None:
        self.current = storage.load_class(class_id)
        if not self.current:
            messagebox.showerror("오류", "학급을 찾을 수 없습니다.", parent=self)
            return
        self.show("class")

    def persist(self, reload: bool = False) -> None:
        if not self.current:
            return
        storage.save_class(self.current)
        if reload:
            self.current = storage.load_class(self.current["id"])
            self._photo_cache.clear()

    def start_quiz(self, mode_id: str) -> None:
        if not self.current:
            return
        self.persist(reload=True)
        students = self.current.get("students", [])
        pool = [s for s in students if s.get("photoPath") and s.get("name")]
        if len(pool) < 1:
            messagebox.showwarning("안내", "사진이 있는 학생이 필요합니다.", parent=self)
            return
        if mode_id in ("photoToName", "nameToPhoto") and len(pool) < 2:
            messagebox.showwarning("안내", "객관식은 사진 있는 학생이 2명 이상 필요합니다.", parent=self)
            return
        queue = build_queue(students, mode_id, count=min(12, len(pool)))
        self.quiz_state = {
            "mode": mode_id,
            "queue": queue,
            "index": 0,
            "correct": 0,
            "answered": 0,
            "pool": pool,
            "label": next((m[1] for m in MODES if m[0] == mode_id), mode_id),
        }
        self.show("quiz")


class ImportDialog(ctk.CTkToplevel):
    """엑셀 불러오기 — 클릭 선택 + 끌어다 놓기."""

    def __init__(self, app: NameQuizApp):
        super().__init__(app)
        self.app = app
        self.title("엑셀 명렬표 불러오기")
        self.geometry("520x360")
        self.resizable(False, False)
        self.configure(fg_color=COLORS["panel"])
        self.transient(app)
        self.grab_set()

        ctk.CTkLabel(self, text="엑셀 명렬표 불러오기", font=F(24), text_color=COLORS["text"]).pack(
            anchor="w", padx=24, pady=(22, 4)
        )
        ctk.CTkLabel(
            self,
            text="나이스에서 해당 학급 사진명렬표를 엑셀로 다운받아 입력하면 됩니다.",
            font=F(14),
            text_color=COLORS["muted"],
            wraplength=460,
            justify="left",
        ).pack(anchor="w", padx=24, pady=(0, 14))

        self.drop = ctk.CTkFrame(
            self,
            fg_color=COLORS["accent_soft"],
            corner_radius=20,
            border_width=2,
            border_color=COLORS["accent"],
            height=160,
        )
        self.drop.pack(fill="x", padx=24, pady=8)
        self.drop.pack_propagate(False)
        self.drop_title = ctk.CTkLabel(self.drop, text="여기로 파일을 끌어다 놓으세요", font=F(20), text_color=COLORS["accent"])
        self.drop_title.pack(pady=(48, 4))
        self.drop_sub = ctk.CTkLabel(self.drop, text="클릭해도 선택할 수 있어요", font=F(15), text_color=COLORS["muted"])
        self.drop_sub.pack()

        bind_click(self.drop, self._pick_file)

        if _DND_OK:
            try:
                # 창 전체 + 드롭 영역에 등록
                self.drop_target_register(DND_FILES)
                self.dnd_bind("<<Drop>>", self._on_drop)
                self.drop.drop_target_register(DND_FILES)
                self.drop.dnd_bind("<<Drop>>", self._on_drop)
                self.drop.dnd_bind("<<DragEnter>>", lambda e: self._set_drop_active(True))
                self.drop.dnd_bind("<<DragLeave>>", lambda e: self._set_drop_active(False))
            except Exception:
                self.drop_sub.configure(text="클릭해서 파일을 선택하세요")
        else:
            self.drop_sub.configure(text="클릭해서 파일을 선택하세요")

        ctk.CTkButton(
            self,
            text="닫기",
            width=100,
            height=40,
            corner_radius=20,
            fg_color=COLORS["bg2"],
            hover_color=COLORS["line"],
            text_color=COLORS["text"],
            font=F(15),
            command=self.destroy,
        ).pack(anchor="e", padx=24, pady=18)

        self.after(50, self._center)

    def _center(self) -> None:
        self.update_idletasks()
        x = self.app.winfo_rootx() + (self.app.winfo_width() - self.winfo_width()) // 2
        y = self.app.winfo_rooty() + (self.app.winfo_height() - self.winfo_height()) // 2
        self.geometry(f"+{x}+{y}")

    def _set_drop_active(self, active: bool) -> None:
        self.drop.configure(fg_color=COLORS["peach_soft"] if active else COLORS["accent_soft"])

    def _pick_file(self) -> None:
        path = filedialog.askopenfilename(
            parent=self,
            title="사진 명렬표 선택",
            filetypes=[("Excel 파일", "*.xlsx"), ("모든 파일", "*.*")],
        )
        if path:
            self._finish(path)

    def _on_drop(self, event) -> None:
        self._set_drop_active(False)
        paths = parse_dnd_paths(getattr(event, "data", "") or "")
        xlsx = next((p for p in paths if p.lower().endswith(".xlsx")), None)
        if not xlsx:
            messagebox.showwarning("안내", "xlsx 파일을 놓아 주세요.", parent=self)
            return
        self._finish(xlsx)

    def _finish(self, path: str) -> None:
        self.destroy()
        self.app.import_excel_path(path)


class HomeFrame(ctk.CTkFrame):
    def __init__(self, parent, app: NameQuizApp):
        super().__init__(parent, fg_color="transparent")
        self.app = app
        self.grid_columnconfigure(0, weight=1)
        self.grid_rowconfigure(1, weight=1)

        top = ctk.CTkFrame(self, fg_color="transparent")
        top.grid(row=0, column=0, sticky="ew")
        top.grid_columnconfigure(1, weight=1)
        ctk.CTkLabel(top, text="내 학급", font=F(26), text_color=COLORS["text"]).grid(row=0, column=0, sticky="w")
        ctk.CTkLabel(top, text="이 컴퓨터에 자동 저장됩니다", font=F(14), text_color=COLORS["muted"]).grid(
            row=0, column=1, sticky="e"
        )

        self.list_frame = ctk.CTkScrollableFrame(self, fg_color=COLORS["panel_soft"], corner_radius=18)
        self.list_frame.grid(row=1, column=0, sticky="nsew", pady=(12, 0))
        self.list_frame.grid_columnconfigure((0, 1), weight=1)

    def on_show(self) -> None:
        for w in self.list_frame.winfo_children():
            w.destroy()
        classes = storage.list_classes()
        if not classes:
            empty = ctk.CTkFrame(self.list_frame, fg_color="transparent")
            empty.grid(row=0, column=0, columnspan=2, pady=70)
            ctk.CTkLabel(empty, text="아직 학급이 없어요", font=F(24), text_color=COLORS["text"]).pack()
            ctk.CTkLabel(
                empty,
                text="오른쪽 위 ‘엑셀 불러오기’로 가져오거나,\n엑셀 파일을 창에 끌어다 놓아도 됩니다",
                font=F(15),
                text_color=COLORS["muted"],
            ).pack(pady=(8, 0))
            return

        for i, item in enumerate(classes):
            card = ctk.CTkFrame(
                self.list_frame,
                fg_color=COLORS["card"],
                corner_radius=20,
                border_width=1,
                border_color=COLORS["line"],
                height=120,
            )
            r, c = divmod(i, 2)
            card.grid(row=r, column=c, sticky="nsew", padx=8, pady=8)
            card.grid_propagate(False)

            accent = ctk.CTkFrame(card, fg_color=COLORS["accent"], width=8, corner_radius=8)
            accent.place(x=10, y=18, relheight=0.7)

            ctk.CTkLabel(card, text=item.get("name", "학급"), font=F(20), text_color=COLORS["text"], anchor="w").pack(
                fill="x", padx=(28, 16), pady=(22, 0)
            )
            meta = f"{item.get('school') or '학교 미입력'}  ·  {item.get('studentCount', 0)}명"
            if item.get("teacher"):
                meta += f"  ·  {item['teacher']}"
            ctk.CTkLabel(card, text=meta, font=F(14), text_color=COLORS["muted"], anchor="w").pack(
                fill="x", padx=(28, 16), pady=(6, 0)
            )
            ctk.CTkLabel(card, text="눌러서 열기 →", font=F(13), text_color=COLORS["accent"], anchor="e").pack(
                fill="x", padx=16, pady=(10, 0)
            )
            bind_click(card, lambda cid=item["id"]: self.app.open_class(cid))


class ClassFrame(ctk.CTkFrame):
    def __init__(self, parent, app: NameQuizApp):
        super().__init__(parent, fg_color="transparent")
        self.app = app
        self.grid_columnconfigure(0, weight=1)
        self.grid_rowconfigure(2, weight=1)

        top = ctk.CTkFrame(self, fg_color="transparent")
        top.grid(row=0, column=0, sticky="ew")
        top.grid_columnconfigure(0, weight=1)

        ctk.CTkButton(
            top,
            text="← 학급 목록",
            width=120,
            height=36,
            corner_radius=18,
            fg_color=COLORS["accent_soft"],
            hover_color="#C7EFDB",
            text_color=COLORS["accent"],
            font=F(14),
            command=lambda: (self.app.persist(reload=True), self.app.show("home")),
        ).grid(row=0, column=0, sticky="w")

        self.title_lbl = ctk.CTkLabel(top, text="", font=F(26, "bold"), text_color=COLORS["text"])
        self.title_lbl.grid(row=1, column=0, sticky="w", pady=(8, 0))
        self.sub_lbl = ctk.CTkLabel(top, text="", font=F(14), text_color=COLORS["muted"])
        self.sub_lbl.grid(row=2, column=0, sticky="w")

        actions = ctk.CTkFrame(top, fg_color="transparent")
        actions.grid(row=1, column=1, rowspan=2, sticky="e")
        ctk.CTkButton(
            actions,
            text="학급 편집",
            width=100,
            height=38,
            corner_radius=19,
            fg_color=COLORS["sky_soft"],
            hover_color="#D5EEF8",
            text_color=COLORS["sky"],
            font=F(14),
            command=self.edit_class,
        ).pack(side="left", padx=4)
        ctk.CTkButton(
            actions,
            text="삭제",
            width=70,
            height=38,
            corner_radius=19,
            fg_color=COLORS["peach_soft"],
            hover_color="#FFD8CC",
            text_color=COLORS["peach_hover"],
            font=F(14),
            command=self.delete_class,
        ).pack(side="left", padx=4)

        self.tab_bar = ctk.CTkFrame(self, fg_color=COLORS["bg2"], corner_radius=14, border_width=1, border_color=COLORS["line"])
        self.tab_bar.grid(row=1, column=0, sticky="ew", pady=(14, 10))
        self.tab_bar.grid_columnconfigure((0, 1, 2), weight=1)
        self._tab_btns: dict[str, ctk.CTkButton] = {}
        self._tab_value = "퀴즈"
        for i, label in enumerate(["퀴즈", "학생 명단", "학습 현황"]):
            btn = ctk.CTkButton(
                self.tab_bar,
                text=label,
                height=44,
                corner_radius=12,
                font=F(15, "bold"),
                command=lambda v=label: self._select_tab(v),
            )
            btn.grid(row=0, column=i, sticky="ew", padx=4, pady=4)
            self._tab_btns[label] = btn
        self._refresh_tabs()

        self.body = ctk.CTkScrollableFrame(self, fg_color=COLORS["panel_soft"], corner_radius=16)
        self.body.grid(row=2, column=0, sticky="nsew")
        self.body.grid_columnconfigure(0, weight=1)

    def _refresh_tabs(self) -> None:
        for label, btn in self._tab_btns.items():
            if label == self._tab_value:
                btn.configure(
                    fg_color=COLORS["accent"],
                    hover_color=COLORS["accent_hover"],
                    text_color="#FFFFFF",
                )
            else:
                btn.configure(
                    fg_color=COLORS["card"],
                    hover_color=COLORS["accent_soft"],
                    text_color=COLORS["text"],
                )

    def _select_tab(self, value: str) -> None:
        self._tab_value = value
        self._refresh_tabs()
        self._on_tab(value)

    def on_show(self) -> None:
        c = self.app.current
        if not c:
            return
        self.title_lbl.configure(text=c.get("name", "학급"))
        bits = [
            c.get("school") or "",
            f"{c['grade']}-{c['classNum']}반" if c.get("grade") is not None else "",
            f"담당 {c['teacher']}" if c.get("teacher") else "",
            c.get("dateLabel") or "",
        ]
        self.sub_lbl.configure(text=" · ".join(b for b in bits if b))
        self._tab_value = "퀴즈"
        self._refresh_tabs()
        self._render_quiz_tab()

    def _on_tab(self, value: str) -> None:
        if value == "퀴즈":
            self._render_quiz_tab()
        elif value == "학생 명단":
            self._render_students()
        else:
            self._render_stats()

    def _clear_body(self) -> None:
        for w in self.body.winfo_children():
            w.destroy()

    def _render_quiz_tab(self) -> None:
        self._clear_body()
        c = self.app.current
        s = class_summary(c.get("students", []))

        chip_row = ctk.CTkFrame(self.body, fg_color="transparent")
        chip_row.grid(row=0, column=0, sticky="ew", pady=(4, 12))
        for text, bg, fg in (
            (f"사진 {s['withPhoto']}/{s['total']}", COLORS["accent_soft"], COLORS["accent"]),
            (f"정확도 {pct(s['accuracy'])}", COLORS["sky_soft"], COLORS["sky"]),
            (f"약함 {s['weak']}", COLORS["peach_soft"], COLORS["peach_hover"]),
            (f"복습 {s['due']}", COLORS["peach_soft"], COLORS["peach_hover"]),
        ):
            ctk.CTkLabel(
                chip_row, text=f"  {text}  ", font=F(13), fg_color=bg, text_color=fg, corner_radius=999
            ).pack(side="left", padx=(0, 8))

        grid = ctk.CTkFrame(self.body, fg_color="transparent")
        grid.grid(row=1, column=0, sticky="ew")
        grid.grid_columnconfigure((0, 1), weight=1)

        for i, (mid, title, desc) in enumerate(MODES):
            card = ctk.CTkFrame(
                grid,
                fg_color=COLORS["card"],
                corner_radius=18,
                border_width=1,
                border_color=COLORS["line"],
                height=100,
            )
            r, col = divmod(i, 2)
            card.grid(row=r, column=col, sticky="ew", padx=6, pady=6)
            card.grid_propagate(False)
            ctk.CTkLabel(card, text=title, font=F(18), text_color=COLORS["text"], anchor="w").pack(
                fill="x", padx=18, pady=(20, 0)
            )
            ctk.CTkLabel(card, text=desc, font=F(13), text_color=COLORS["muted"], anchor="w").pack(
                fill="x", padx=18, pady=(6, 0)
            )
            bind_click(card, lambda m=mid: self.app.start_quiz(m))

    def _render_students(self) -> None:
        self._clear_body()
        ctk.CTkButton(
            self.body,
            text="+ 학생 추가",
            width=130,
            height=38,
            corner_radius=19,
            fg_color=COLORS["accent"],
            hover_color=COLORS["accent_hover"],
            font=F(14),
            command=self.add_student,
        ).grid(row=0, column=0, sticky="w", pady=(4, 10))

        students = sorted(self.app.current.get("students", []), key=lambda x: x.get("number", 0))
        for i, st in enumerate(students):
            row = ctk.CTkFrame(
                self.body, fg_color=COLORS["card"], corner_radius=16, border_width=1, border_color=COLORS["line"]
            )
            row.grid(row=i + 1, column=0, sticky="ew", pady=4)
            row.grid_columnconfigure(2, weight=1)
            photo = self.app.get_photo(st.get("photoPath"), (44, 54))
            if photo:
                ctk.CTkLabel(row, text="", image=photo).grid(row=0, column=0, padx=12, pady=10)
            else:
                ctk.CTkLabel(row, text="없음", width=50, text_color=COLORS["muted"], font=F(12)).grid(row=0, column=0, padx=12)
            ctk.CTkLabel(row, text=f"{st.get('number')}번", width=56, font=F(15), text_color=COLORS["accent"]).grid(
                row=0, column=1
            )
            ctk.CTkLabel(row, text=st.get("name", ""), anchor="w", font=F(17), text_color=COLORS["text"]).grid(
                row=0, column=2, sticky="w"
            )
            s = ensure_stats(st)
            ctk.CTkLabel(
                row, text=f"정답률 {pct(accuracy_of(s))} · 오답 {s['wrong']}", text_color=COLORS["muted"], font=F(13)
            ).grid(row=0, column=3, padx=8)
            ctk.CTkButton(
                row,
                text="편집",
                width=68,
                height=34,
                corner_radius=17,
                fg_color=COLORS["bg2"],
                hover_color=COLORS["accent_soft"],
                text_color=COLORS["text"],
                font=F(13),
                command=lambda sid=st["id"]: self.edit_student(sid),
            ).grid(row=0, column=4, padx=12)

    def _render_stats(self) -> None:
        self._clear_body()
        students = self.app.current.get("students", [])
        s = class_summary(students)
        ctk.CTkLabel(
            self.body,
            text=f"총 {s['total']}명 · 시도 {s['attempts']} · 정확도 {pct(s['accuracy'])}",
            font=F(16),
            text_color=COLORS["text"],
        ).grid(row=0, column=0, sticky="w", pady=(4, 12))
        ctk.CTkLabel(self.body, text="잘 안 외워지는 학생", font=F(20), text_color=COLORS["text"]).grid(
            row=1, column=0, sticky="w"
        )
        weak = get_weak_students(students, limit=20)
        if not weak:
            ctk.CTkLabel(
                self.body, text="아직 약점 데이터가 없어요. 퀴즈를 풀어보세요!", text_color=COLORS["muted"], font=F(14)
            ).grid(row=2, column=0, sticky="w", pady=8)
        else:
            for i, st in enumerate(weak):
                st_s = ensure_stats(st)
                line = ctk.CTkFrame(
                    self.body, fg_color=COLORS["card"], corner_radius=14, border_width=1, border_color=COLORS["line"]
                )
                line.grid(row=2 + i, column=0, sticky="ew", pady=3)
                photo = self.app.get_photo(st.get("photoPath"), (38, 48))
                if photo:
                    ctk.CTkLabel(line, text="", image=photo).pack(side="left", padx=10, pady=8)
                ctk.CTkLabel(
                    line,
                    text=f"{st.get('number')}. {st.get('name')}    정답률 {pct(accuracy_of(st_s))} · 오답 {st_s['wrong']}",
                    anchor="w",
                    font=F(14),
                ).pack(side="left", padx=6)

        due = get_due_students(students)
        ctk.CTkLabel(self.body, text=f"복습 대기 {len(due)}명", font=F(20)).grid(row=40, column=0, sticky="w", pady=(16, 6))
        ctk.CTkLabel(
            self.body,
            text=", ".join(f"{d.get('number')}.{d.get('name')}" for d in due) if due else "없음",
            text_color=COLORS["muted"],
            font=F(14),
            wraplength=820,
            justify="left",
        ).grid(row=41, column=0, sticky="w")
        ctk.CTkButton(
            self.body,
            text="약한 학생만 퀴즈",
            width=170,
            height=42,
            corner_radius=21,
            fg_color=COLORS["peach"],
            hover_color=COLORS["peach_hover"],
            font=F(15),
            command=lambda: self.app.start_quiz("weakOnly"),
        ).grid(row=42, column=0, sticky="w", pady=16)

    def edit_class(self) -> None:
        c = self.app.current
        name = simpledialog.askstring("학급 편집", "학급 이름:", initialvalue=c.get("name", ""), parent=self.app)
        if name is None:
            return
        c["name"] = name.strip() or c["name"]
        school = simpledialog.askstring("학급 편집", "학교:", initialvalue=c.get("school", ""), parent=self.app)
        if school is not None:
            c["school"] = school.strip()
        teacher = simpledialog.askstring("학급 편집", "담당 교사:", initialvalue=c.get("teacher", ""), parent=self.app)
        if teacher is not None:
            c["teacher"] = teacher.strip()
        self.app.persist(reload=True)
        self.on_show()

    def delete_class(self) -> None:
        if not messagebox.askyesno("삭제", "이 학급을 삭제할까요?", parent=self.app):
            return
        storage.delete_class(self.app.current["id"])
        self.app.current = None
        self.app.show("home")

    def add_student(self) -> None:
        c = self.app.current
        nums = [s.get("number", 0) for s in c.get("students", [])]
        number = (max(nums) if nums else 0) + 1
        name = simpledialog.askstring("학생 추가", "이름:", parent=self.app)
        if not name:
            return
        sid = storage.uid("stu")
        photo_file = None
        path = filedialog.askopenfilename(
            title="사진 선택 (취소 가능)", filetypes=[("이미지", "*.jpg;*.jpeg;*.png;*.webp")]
        )
        if path:
            photo_file = storage.save_student_photo(c["id"], sid, path)
        c.setdefault("students", []).append(
            {"id": sid, "number": number, "name": name.strip(), "photoFile": photo_file, "stats": storage.empty_stats()}
        )
        self.app.persist(reload=True)
        self._tab_value = "학생 명단"
        self._refresh_tabs()
        self._render_students()

    def edit_student(self, student_id: str) -> None:
        st = next((s for s in self.app.current["students"] if s["id"] == student_id), None)
        if not st:
            return
        name = simpledialog.askstring("학생 편집", "이름:", initialvalue=st.get("name", ""), parent=self.app)
        if name is None:
            return
        st["name"] = name.strip() or st["name"]
        if messagebox.askyesno("사진", "사진을 바꿀까요?", parent=self.app):
            path = filedialog.askopenfilename(filetypes=[("이미지", "*.jpg;*.jpeg;*.png;*.webp")])
            if path:
                st["photoFile"] = storage.save_student_photo(self.app.current["id"], st["id"], path)
                self.app._photo_cache.clear()
        self.app.persist(reload=True)
        self._render_students()


class QuizFrame(ctk.CTkFrame):
    def __init__(self, parent, app: NameQuizApp):
        super().__init__(parent, fg_color="transparent")
        self.app = app
        self.grid_columnconfigure(0, weight=1)
        self.grid_rowconfigure(4, weight=1)
        self.flipped = False
        self._locked = False

        ctk.CTkButton(
            self,
            text="← 돌아가기",
            width=120,
            height=36,
            corner_radius=18,
            fg_color=COLORS["accent_soft"],
            hover_color="#C7EFDB",
            text_color=COLORS["accent"],
            font=F(14),
            command=self._back,
        ).grid(row=0, column=0, sticky="w")

        self.mode_lbl = ctk.CTkLabel(self, text="", font=F(26), text_color=COLORS["text"])
        self.mode_lbl.grid(row=1, column=0, sticky="w", pady=(8, 0))

        prog_wrap = ctk.CTkFrame(self, fg_color="transparent")
        prog_wrap.grid(row=2, column=0, sticky="ew", pady=(8, 4))
        prog_wrap.grid_columnconfigure(0, weight=1)
        self.progress_lbl = ctk.CTkLabel(prog_wrap, text="", text_color=COLORS["muted"], font=F(14))
        self.progress_lbl.grid(row=0, column=0, sticky="w")
        self.score_lbl = ctk.CTkLabel(prog_wrap, text="", text_color=COLORS["accent"], font=F(15))
        self.score_lbl.grid(row=0, column=1, sticky="e")

        self.bar = ctk.CTkProgressBar(
            self, height=12, corner_radius=8, progress_color=COLORS["accent"], fg_color=COLORS["bg2"]
        )
        self.bar.grid(row=3, column=0, sticky="ew", pady=(0, 12))
        self.bar.set(0)

        self.stage = ctk.CTkFrame(
            self, fg_color=COLORS["card"], corner_radius=24, border_width=1, border_color=COLORS["line"]
        )
        self.stage.grid(row=4, column=0, sticky="nsew")

    def on_show(self) -> None:
        q = self.app.quiz_state
        if not q:
            return
        self.mode_lbl.configure(text=q["label"])
        self._render_question()

    def _back(self) -> None:
        self.app.persist(reload=True)
        self.app.show("class")

    def _clear_stage(self) -> None:
        for w in self.stage.winfo_children():
            w.destroy()

    def _render_question(self) -> None:
        q = self.app.quiz_state
        self._clear_stage()
        total = max(len(q["queue"]), 1)
        if q["index"] >= len(q["queue"]):
            self._finish()
            return
        student = q["queue"][q["index"]]
        self.progress_lbl.configure(text=f"{q['index'] + 1} / {len(q['queue'])}")
        self.score_lbl.configure(text=f"정답 {q['correct']} / {q['answered']}")
        self.bar.set(q["index"] / total)
        self.flipped = False
        self._locked = False
        mode = q["mode"]
        if mode == "practice":
            self._render_practice(student)
        elif mode == "typeName":
            self._render_type(student)
        elif mode == "nameToPhoto":
            self._render_name_to_photo(student)
        else:
            self._render_photo_to_name(student)

    def _render_photo_to_name(self, student: dict) -> None:
        q = self.app.quiz_state
        photo = self.app.get_photo(student.get("photoPath"), (180, 220))
        if photo:
            ctk.CTkLabel(self.stage, text="", image=photo).pack(pady=(28, 14))
        choices = pick_choices(student, q["pool"], min(4, len(q["pool"])))
        box = ctk.CTkFrame(self.stage, fg_color="transparent")
        box.pack(fill="x", padx=36, pady=8)
        box.grid_columnconfigure((0, 1), weight=1)
        self.feedback = ctk.CTkLabel(self.stage, text="", font=F(20))
        self.feedback.pack(pady=10)
        for i, ch in enumerate(choices):
            btn = ctk.CTkButton(
                box,
                text=f"{ch.get('number')}. {ch.get('name')}",
                height=54,
                corner_radius=16,
                fg_color=COLORS["bg"],
                hover_color=COLORS["accent_soft"],
                border_width=1,
                border_color=COLORS["line"],
                text_color=COLORS["text"],
                font=F(17),
                command=lambda c=ch: self._choose(student, c),
            )
            r, col = divmod(i, 2)
            btn.grid(row=r, column=col, sticky="ew", padx=6, pady=6)

    def _render_name_to_photo(self, student: dict) -> None:
        q = self.app.quiz_state
        ctk.CTkLabel(self.stage, text=student.get("name", ""), font=F(42), text_color=COLORS["text"]).pack(pady=(32, 4))
        ctk.CTkLabel(self.stage, text=f"{student.get('number')}번", font=F(15), text_color=COLORS["muted"]).pack()
        choices = pick_choices(student, q["pool"], min(4, len(q["pool"])))
        box = ctk.CTkFrame(self.stage, fg_color="transparent")
        box.pack(fill="x", padx=36, pady=18)
        box.grid_columnconfigure((0, 1), weight=1)
        self.feedback = ctk.CTkLabel(self.stage, text="", font=F(20))
        self.feedback.pack(pady=8)
        for i, ch in enumerate(choices):
            photo = self.app.get_photo(ch.get("photoPath"), (124, 148))
            btn = ctk.CTkButton(
                box,
                text="" if photo else ch.get("name"),
                image=photo,
                height=156,
                corner_radius=16,
                fg_color=COLORS["bg"],
                hover_color=COLORS["accent_soft"],
                border_width=1,
                border_color=COLORS["line"],
                command=lambda c=ch: self._choose(student, c),
            )
            r, col = divmod(i, 2)
            btn.grid(row=r, column=col, sticky="ew", padx=6, pady=6)

    def _render_practice(self, student: dict) -> None:
        self.card_lbl = ctk.CTkLabel(self.stage, text="", font=F(32), text_color=COLORS["text"])
        self.card_lbl.pack(pady=36)
        photo = self.app.get_photo(student.get("photoPath"), (180, 220))
        if photo:
            self.card_lbl.configure(image=photo, text="")
        self.card_lbl.bind("<Button-1>", lambda e: self._flip(student))
        ctk.CTkLabel(self.stage, text="사진을 클릭하면 이름이 보여요", text_color=COLORS["muted"], font=F(14)).pack()
        row = ctk.CTkFrame(self.stage, fg_color="transparent")
        row.pack(pady=22)
        ctk.CTkButton(
            row,
            text="모르겠어",
            width=140,
            height=46,
            corner_radius=23,
            fg_color=COLORS["peach_soft"],
            hover_color="#FFD8CC",
            text_color=COLORS["peach_hover"],
            font=F(16),
            command=lambda: self._practice_answer(student, False),
        ).pack(side="left", padx=8)
        ctk.CTkButton(
            row,
            text="알겠어",
            width=140,
            height=46,
            corner_radius=23,
            fg_color=COLORS["accent"],
            hover_color=COLORS["accent_hover"],
            font=F(16),
            command=lambda: self._practice_answer(student, True),
        ).pack(side="left", padx=8)

    def _flip(self, student: dict) -> None:
        self.flipped = not self.flipped
        if self.flipped:
            self.card_lbl.configure(image=None, text=f"{student.get('number')}. {student.get('name')}")
        else:
            photo = self.app.get_photo(student.get("photoPath"), (180, 220))
            self.card_lbl.configure(image=photo, text="")

    def _render_type(self, student: dict) -> None:
        photo = self.app.get_photo(student.get("photoPath"), (180, 220))
        if photo:
            ctk.CTkLabel(self.stage, text="", image=photo).pack(pady=(28, 14))
        row = ctk.CTkFrame(self.stage, fg_color="transparent")
        row.pack(pady=10)
        entry = ctk.CTkEntry(
            row, width=260, height=48, corner_radius=14, placeholder_text="이름을 입력하세요", font=F(17), border_color=COLORS["line"]
        )
        entry.pack(side="left", padx=6)
        entry.focus_set()
        self.feedback = ctk.CTkLabel(self.stage, text="", font=F(20))
        self.feedback.pack(pady=10)

        def submit(_event=None):
            if self._locked:
                return
            self._locked = True
            ok = names_match(entry.get(), student.get("name", ""))
            record_answer(student, ok)
            q = self.app.quiz_state
            q["answered"] += 1
            if ok:
                q["correct"] += 1
            self.feedback.configure(
                text="정답!" if ok else f"오답 → {student.get('name')}",
                text_color=COLORS["ok"] if ok else COLORS["bad"],
            )
            self.app.persist(reload=False)
            self.after(700 if ok else 1100, self._next)

        ctk.CTkButton(
            row,
            text="확인",
            width=96,
            height=48,
            corner_radius=14,
            fg_color=COLORS["accent"],
            hover_color=COLORS["accent_hover"],
            font=F(15),
            command=submit,
        ).pack(side="left", padx=6)
        entry.bind("<Return>", submit)

    def _choose(self, student: dict, choice: dict) -> None:
        if self._locked:
            return
        self._locked = True
        ok = choice["id"] == student["id"]
        record_answer(student, ok)
        q = self.app.quiz_state
        q["answered"] += 1
        if ok:
            q["correct"] += 1
        if hasattr(self, "feedback"):
            self.feedback.configure(
                text="정답!" if ok else f"오답 → {student.get('number')}. {student.get('name')}",
                text_color=COLORS["ok"] if ok else COLORS["bad"],
            )
        self.app.persist(reload=False)
        self.after(600 if ok else 1000, self._next)

    def _practice_answer(self, student: dict, easy: bool) -> None:
        if self._locked:
            return
        self._locked = True
        apply_review(student, 4 if easy else 1)
        q = self.app.quiz_state
        q["answered"] += 1
        if easy:
            q["correct"] += 1
        self.app.persist(reload=False)
        self._next()

    def _next(self) -> None:
        self.app.quiz_state["index"] += 1
        self._render_question()

    def _finish(self) -> None:
        q = self.app.quiz_state
        self.app.persist(reload=True)
        self.bar.set(1)
        self._clear_stage()
        ctk.CTkLabel(self.stage, text="퀴즈 완료!", font=F(26), text_color=COLORS["text"]).pack(pady=(48, 8))
        ctk.CTkLabel(self.stage, text=f"{q['correct']} / {q['answered']}", font=F(54), text_color=COLORS["accent"]).pack()
        row = ctk.CTkFrame(self.stage, fg_color="transparent")
        row.pack(pady=28)
        ctk.CTkButton(
            row,
            text="같은 모드 다시",
            width=160,
            height=46,
            corner_radius=23,
            fg_color=COLORS["sky_soft"],
            hover_color="#D5EEF8",
            text_color=COLORS["sky"],
            font=F(16),
            command=lambda: self.app.start_quiz(q["mode"]),
        ).pack(side="left", padx=8)
        ctk.CTkButton(
            row,
            text="학급으로",
            width=140,
            height=46,
            corner_radius=23,
            fg_color=COLORS["accent"],
            hover_color=COLORS["accent_hover"],
            font=F(16),
            command=lambda: self.app.show("class"),
        ).pack(side="left", padx=8)


def main() -> None:
    app = NameQuizApp()
    app.mainloop()


if __name__ == "__main__":
    main()
