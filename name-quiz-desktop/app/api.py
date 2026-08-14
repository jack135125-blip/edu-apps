"""HTML UI ↔ 파이썬 로직 브릿지 (pywebview js_api)."""
from __future__ import annotations

import base64
import os
import tempfile
from pathlib import Path
from typing import Any

import webview

from . import storage
from .excel_import import import_roster_xlsx
from .quiz import (
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

_MIME = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
}


def _pct(v: float | None) -> str:
    if v is None:
        return "—"
    return f"{round(v * 100)}%"


def _photo_url(path: str | None, cache: dict[str, str]) -> str | None:
    if not path:
        return None
    if path in cache:
        return cache[path]
    p = Path(path)
    if not p.exists():
        return None
    try:
        raw = p.read_bytes()
    except OSError:
        return None
    mime = _MIME.get(p.suffix.lower(), "image/jpeg")
    url = f"data:{mime};base64,{base64.b64encode(raw).decode('ascii')}"
    cache[path] = url
    return url


def _student_out(st: dict[str, Any], cache: dict[str, str]) -> dict[str, Any]:
    stats = ensure_stats(st)
    acc = accuracy_of(stats)
    return {
        "id": st["id"],
        "number": st.get("number"),
        "name": st.get("name", ""),
        "photoUrl": _photo_url(st.get("photoPath"), cache),
        "stats": {
            "seen": stats.get("seen", 0),
            "correct": stats.get("correct", 0),
            "wrong": stats.get("wrong", 0),
        },
        "accuracy": acc,
        "accuracyLabel": _pct(acc),
    }


def _class_meta(data: dict[str, Any]) -> dict[str, Any]:
    bits = [
        data.get("school") or "",
        f"{data['grade']}-{data['classNum']}반" if data.get("grade") is not None else "",
        f"담당 {data['teacher']}" if data.get("teacher") else "",
        data.get("dateLabel") or "",
    ]
    return {
        "id": data["id"],
        "name": data.get("name", "학급"),
        "school": data.get("school") or "",
        "subject": data.get("subject") or "",
        "teacher": data.get("teacher") or "",
        "grade": data.get("grade"),
        "classNum": data.get("classNum"),
        "dateLabel": data.get("dateLabel") or "",
        "subtitle": " · ".join(b for b in bits if b),
        "studentCount": len(data.get("students", [])),
    }


class Api:
    def __init__(self) -> None:
        self.window: webview.Window | None = None
        self.current: dict[str, Any] | None = None
        self.quiz_state: dict[str, Any] | None = None
        self._photo_cache: dict[str, str] = {}
        self._pending_photo: str | None = None

    def _ok(self, **kwargs: Any) -> dict[str, Any]:
        return {"ok": True, **kwargs}

    def _err(self, message: str) -> dict[str, Any]:
        return {"ok": False, "error": message}

    def _persist(self, reload: bool = False) -> None:
        if not self.current:
            return
        storage.save_class(self.current)
        if reload:
            self.current = storage.load_class(self.current["id"])
            self._photo_cache.clear()

    def _pack_class(self) -> dict[str, Any]:
        c = self.current or {}
        students = c.get("students", [])
        summary = class_summary(students)
        weak = get_weak_students(students, limit=20)
        due = get_due_students(students)
        return {
            "class": _class_meta(c),
            "summary": {
                **summary,
                "accuracyLabel": _pct(summary.get("accuracy")),
            },
            "students": [
                _student_out(st, self._photo_cache)
                for st in sorted(students, key=lambda x: x.get("number", 0))
            ],
            "modes": [{"id": m[0], "title": m[1], "desc": m[2]} for m in MODES],
            "weak": [_student_out(st, self._photo_cache) for st in weak],
            "due": [{"id": d["id"], "number": d.get("number"), "name": d.get("name")} for d in due],
        }

    def _question_payload(self) -> dict[str, Any]:
        q = self.quiz_state
        assert q is not None
        total = max(len(q["queue"]), 1)
        if q["index"] >= len(q["queue"]):
            return {
                "done": True,
                "mode": q["mode"],
                "label": q["label"],
                "correct": q["correct"],
                "answered": q["answered"],
                "total": len(q["queue"]),
            }
        student = q["queue"][q["index"]]
        mode = q["mode"]
        payload: dict[str, Any] = {
            "done": False,
            "mode": mode,
            "label": q["label"],
            "index": q["index"] + 1,
            "total": len(q["queue"]),
            "correct": q["correct"],
            "answered": q["answered"],
            "progress": q["index"] / total,
            "student": _student_out(student, self._photo_cache),
            "choices": [],
        }
        if mode in ("photoToName", "nameToPhoto", "weakOnly", "dueReview"):
            visual = "nameToPhoto" if mode == "nameToPhoto" else "photoToName"
            payload["visual"] = visual
            n = min(4, len(q["pool"]))
            payload["choices"] = [_student_out(ch, self._photo_cache) for ch in pick_choices(student, q["pool"], n)]
        else:
            payload["visual"] = mode
        return payload

    def home(self) -> dict[str, Any]:
        storage.ensure_dirs()
        return self._ok(classes=storage.list_classes())

    def open_class(self, class_id: str) -> dict[str, Any]:
        data = storage.load_class(class_id)
        if not data:
            return self._err("학급을 찾을 수 없습니다.")
        self.current = data
        return self._ok(**self._pack_class())

    def refresh_class(self) -> dict[str, Any]:
        if not self.current:
            return self._err("열린 학급이 없습니다.")
        self._persist(reload=True)
        return self._ok(**self._pack_class())

    def create_blank_class(self, name: str) -> dict[str, Any]:
        name = (name or "").strip()
        if not name:
            return self._err("학급 이름을 입력하세요.")
        data = {
            "id": storage.uid("class"),
            "name": name,
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
        return self._ok(**self._pack_class())

    def save_class_meta(self, name: str, school: str, teacher: str) -> dict[str, Any]:
        if not self.current:
            return self._err("열린 학급이 없습니다.")
        name = (name or "").strip()
        if name:
            self.current["name"] = name
        self.current["school"] = (school or "").strip()
        self.current["teacher"] = (teacher or "").strip()
        self._persist(reload=True)
        return self._ok(**self._pack_class())

    def delete_class(self) -> dict[str, Any]:
        if not self.current:
            return self._err("열린 학급이 없습니다.")
        storage.delete_class(self.current["id"])
        self.current = None
        self.quiz_state = None
        return self.home()

    def pick_excel(self) -> dict[str, Any]:
        if not self.window:
            return self._err("창이 아직 준비되지 않았습니다.")
        result = self.window.create_file_dialog(
            webview.OPEN_DIALOG,
            allow_multiple=False,
            file_types=("Excel 파일 (*.xlsx)", "모든 파일 (*.*)"),
        )
        if not result:
            return {"ok": True, "cancelled": True}
        return self.import_excel_path(result[0])

    def import_excel_path(self, path: str) -> dict[str, Any]:
        if not path:
            return self._err("파일 경로가 없습니다.")
        try:
            data = import_roster_xlsx(path)
            storage.save_class(data)
            self.current = storage.load_class(data["id"])
            n = len(data.get("students", []))
            return self._ok(imported=n, **self._pack_class())
        except Exception as e:
            return self._err(str(e))

    def import_excel_b64(self, b64: str) -> dict[str, Any]:
        if not b64:
            return self._err("파일이 비어 있습니다.")
        tmp = None
        try:
            raw = base64.b64decode(b64)
            fd, tmp = tempfile.mkstemp(suffix=".xlsx")
            os.close(fd)
            Path(tmp).write_bytes(raw)
            return self.import_excel_path(tmp)
        except Exception as e:
            return self._err(str(e))
        finally:
            if tmp:
                try:
                    os.unlink(tmp)
                except OSError:
                    pass

    def pick_image(self) -> dict[str, Any]:
        if not self.window:
            return self._err("창이 아직 준비되지 않았습니다.")
        result = self.window.create_file_dialog(
            webview.OPEN_DIALOG,
            allow_multiple=False,
            file_types=("이미지 (*.jpg;*.jpeg;*.png;*.webp)", "모든 파일 (*.*)"),
        )
        if not result:
            return {"ok": True, "cancelled": True}
        self._pending_photo = result[0]
        return self._ok(photoUrl=_photo_url(result[0], self._photo_cache))

    def clear_pending_photo(self) -> dict[str, Any]:
        self._pending_photo = None
        return self._ok()

    def add_student(self, name: str) -> dict[str, Any]:
        if not self.current:
            return self._err("열린 학급이 없습니다.")
        name = (name or "").strip()
        if not name:
            return self._err("이름을 입력하세요.")
        nums = [s.get("number", 0) for s in self.current.get("students", [])]
        number = (max(nums) if nums else 0) + 1
        sid = storage.uid("stu")
        photo_file = None
        if self._pending_photo:
            photo_file = storage.save_student_photo(self.current["id"], sid, self._pending_photo)
            self._pending_photo = None
        self.current.setdefault("students", []).append(
            {
                "id": sid,
                "number": number,
                "name": name,
                "photoFile": photo_file,
                "stats": storage.empty_stats(),
            }
        )
        self._persist(reload=True)
        return self._ok(**self._pack_class())

    def edit_student(self, student_id: str, name: str, change_photo: bool = False) -> dict[str, Any]:
        if not self.current:
            return self._err("열린 학급이 없습니다.")
        st = next((s for s in self.current.get("students", []) if s["id"] == student_id), None)
        if not st:
            return self._err("학생을 찾을 수 없습니다.")
        name = (name or "").strip()
        if name:
            st["name"] = name
        photo_src = self._pending_photo if change_photo else None
        if photo_src:
            st["photoFile"] = storage.save_student_photo(self.current["id"], st["id"], photo_src)
            self._photo_cache.clear()
            self._pending_photo = None
        self._persist(reload=True)
        return self._ok(**self._pack_class())

    def start_quiz(self, mode_id: str) -> dict[str, Any]:
        if not self.current:
            return self._err("열린 학급이 없습니다.")
        self._persist(reload=True)
        students = self.current.get("students", [])
        pool = [s for s in students if s.get("photoPath") and s.get("name")]
        if len(pool) < 1:
            return self._err("사진이 있는 학생이 필요합니다.")
        if mode_id in ("photoToName", "nameToPhoto") and len(pool) < 2:
            return self._err("객관식은 사진 있는 학생이 2명 이상 필요합니다.")
        queue = build_queue(students, mode_id, count=min(12, len(pool)))
        self.quiz_state = {
            "mode": mode_id,
            "queue": queue,
            "index": 0,
            "correct": 0,
            "answered": 0,
            "pool": pool,
            "label": next((m[1] for m in MODES if m[0] == mode_id), mode_id),
            "locked": False,
        }
        return self._ok(quiz=self._question_payload())

    def quiz_choose(self, choice_id: str) -> dict[str, Any]:
        q = self.quiz_state
        if not q or q.get("locked"):
            return self._err("이미 답을 골랐어요.")
        student = q["queue"][q["index"]]
        q["locked"] = True
        ok = choice_id == student["id"]
        record_answer(student, ok)
        q["answered"] += 1
        if ok:
            q["correct"] += 1
        self._persist(reload=False)
        return self._ok(
            correct=ok,
            message="정답!" if ok else f"오답 → {student.get('number')}. {student.get('name')}",
        )

    def quiz_type(self, text: str) -> dict[str, Any]:
        q = self.quiz_state
        if not q or q.get("locked"):
            return self._err("이미 답을 입력했어요.")
        student = q["queue"][q["index"]]
        q["locked"] = True
        ok = names_match(text, student.get("name", ""))
        record_answer(student, ok)
        q["answered"] += 1
        if ok:
            q["correct"] += 1
        self._persist(reload=False)
        return self._ok(
            correct=ok,
            message="정답!" if ok else f"오답 → {student.get('name')}",
        )

    def quiz_practice(self, easy: bool) -> dict[str, Any]:
        q = self.quiz_state
        if not q or q.get("locked"):
            return self._err("이미 평가했어요.")
        student = q["queue"][q["index"]]
        q["locked"] = True
        apply_review(student, 4 if easy else 1)
        q["answered"] += 1
        if easy:
            q["correct"] += 1
        self._persist(reload=False)
        return self._ok(correct=bool(easy))

    def quiz_next(self) -> dict[str, Any]:
        q = self.quiz_state
        if not q:
            return self._err("진행 중인 퀴즈가 없습니다.")
        q["index"] += 1
        q["locked"] = False
        if q["index"] >= len(q["queue"]):
            self._persist(reload=True)
        return self._ok(quiz=self._question_payload())
