"""HTML UI ↔ 파이썬 로직 브릿지 (pywebview js_api)."""
from __future__ import annotations

import base64
import os
import tempfile
import time
from pathlib import Path
from typing import Any

import webview

from . import storage
from .excel_import import import_roster_xlsx
from .quiz import (
    MODES,
    OVERVIEW_GROUPS,
    OVERVIEW_MODES,
    accuracy_of,
    apply_review,
    build_queue,
    class_summary,
    ensure_stats,
    filter_overview_group,
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
            "streak": stats.get("streak", 0),
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


def _ordered_students(data: dict[str, Any]) -> list[dict[str, Any]]:
    students = data.get("students", [])
    return sorted(
        students,
        key=lambda st: (
            (st.get("name") or "").strip().casefold(),
            st.get("number") or 0,
        ),
    )


class Api:
    """pywebview는 js_api의 공개 속성을 재귀 탐색하므로 내부 상태는 _ 접두사로 감춘다.

    특히 Window를 공개 속성으로 두면 .NET 객체까지 무한 탐색해 시작이 멈춘다.
    """

    def __init__(self) -> None:
        self._window: webview.Window | None = None
        self._current: dict[str, Any] | None = None
        self._quiz_state: dict[str, Any] | None = None
        self._photo_cache: dict[str, str] = {}
        self._pending_photo: str | None = None

    def _attach_window(self, window: webview.Window) -> None:
        self._window = window

    def _ok(self, **kwargs: Any) -> dict[str, Any]:
        return {"ok": True, **kwargs}

    def _err(self, message: str) -> dict[str, Any]:
        return {"ok": False, "error": message}

    def _persist(self, reload: bool = False) -> None:
        if not self._current:
            return
        storage.save_class(self._current)
        if reload:
            self._current = storage.load_class(self._current["id"])
            self._photo_cache.clear()

    def _pack_class(self) -> dict[str, Any]:
        c = self._current or {}
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
                for st in _ordered_students(c)
            ],
            "modes": [{"id": m[0], "title": m[1], "desc": m[2]} for m in MODES],
            "weak": [_student_out(st, self._photo_cache) for st in weak],
            "due": [{"id": d["id"], "number": d.get("number"), "name": d.get("name")} for d in due],
        }

    def _home_classes(self) -> list[dict[str, Any]]:
        classes = []
        for item in storage.list_classes():
            data = storage.load_class(item["id"])
            if not data:
                continue
            summary = class_summary(data.get("students", []))
            accuracy = summary.get("accuracy")
            classes.append(
                {
                    **item,
                    "accuracyLabel": _pct(accuracy),
                    "accuracyPercent": round(accuracy * 100) if accuracy is not None else 0,
                    "attempts": summary.get("attempts", 0),
                    "correct": round((accuracy or 0) * summary.get("attempts", 0)),
                    "weak": summary.get("weak", 0),
                    "due": summary.get("due", 0),
                    "mastered": summary.get("mastered", 0),
                    "withPhoto": summary.get("withPhoto", 0),
                }
            )
        return classes

    def _home_overview(self, classes: list[dict[str, Any]]) -> dict[str, Any]:
        attempts = sum(item.get("attempts", 0) for item in classes)
        correct = sum(item.get("correct", 0) for item in classes)
        accuracy = (correct / attempts) if attempts else None
        return {
            "classCount": len(classes),
            "studentCount": sum(item.get("studentCount", 0) for item in classes),
            "withPhoto": sum(item.get("withPhoto", 0) for item in classes),
            "attempts": attempts,
            "accuracy": accuracy,
            "accuracyLabel": _pct(accuracy),
            "accuracyPercent": round(accuracy * 100) if accuracy is not None else 0,
            "weak": sum(item.get("weak", 0) for item in classes),
            "due": sum(item.get("due", 0) for item in classes),
            "mastered": sum(item.get("mastered", 0) for item in classes),
        }

    def _quiz_student_out(self, student: dict[str, Any]) -> dict[str, Any]:
        out = _student_out(student, self._photo_cache)
        q = self._quiz_state or {}
        class_name = q.get("classLabels", {}).get(student.get("id"))
        if class_name:
            out["className"] = class_name
        return out

    def _load_all_classes(self) -> tuple[list[dict[str, Any]], list[dict[str, Any]], dict[str, str], list[str]]:
        class_data: list[dict[str, Any]] = []
        students: list[dict[str, Any]] = []
        class_labels: dict[str, str] = {}
        class_ids: list[str] = []
        for item in storage.list_classes():
            class_id = item.get("id")
            data = storage.load_class(class_id)
            if not data:
                continue
            class_ids.append(class_id)
            class_data.append(data)
            class_name = data.get("name") or "학급"
            for student in data.get("students", []):
                students.append(student)
                class_labels[student["id"]] = class_name
        return class_data, students, class_labels, class_ids

    def _overview_student_out(self, student: dict[str, Any], class_name: str | None = None) -> dict[str, Any]:
        out = _student_out(student, self._photo_cache)
        if class_name:
            out["className"] = class_name
        return out

    def _pack_overview_group(self, group: str) -> dict[str, Any]:
        title, desc = OVERVIEW_GROUPS[group]
        class_data, students, class_labels, _class_ids = self._load_all_classes()
        candidates = filter_overview_group(students, group)
        candidates.sort(
            key=lambda st: (
                (class_labels.get(st.get("id")) or "").casefold(),
                (st.get("name") or "").strip().casefold(),
                st.get("number") or 0,
            )
        )
        quizable = [st for st in candidates if st.get("photoPath") and st.get("name")]
        photo_pool = [st for st in students if st.get("photoPath") and st.get("name")]
        return {
            "group": group,
            "title": title,
            "desc": desc,
            "studentCount": len(candidates),
            "quizableCount": len(quizable),
            "canQuiz": bool(quizable),
            "needChoices": len(photo_pool) >= 2,
            "classCount": len(class_data),
            "students": [
                self._overview_student_out(st, class_labels.get(st.get("id")))
                for st in candidates
            ],
            "modes": [{"id": m[0], "title": m[1], "desc": m[2]} for m in OVERVIEW_MODES],
        }

    def _persist_quiz_progress(self, reload: bool = False) -> None:
        q = self._quiz_state or {}
        class_data = q.get("classData", [])
        if class_data:
            for data in class_data:
                storage.save_class(data)
            return
        self._persist(reload=reload)

    def _question_payload(self) -> dict[str, Any]:
        q = self._quiz_state
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
                "returnTo": q.get("returnTo", "class"),
                "classCount": q.get("classCount", 1),
                "classIds": q.get("classIds", []),
                "overviewGroup": q.get("overviewGroup"),
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
            "student": self._quiz_student_out(student),
            "choices": [],
            "returnTo": q.get("returnTo", "class"),
            "classCount": q.get("classCount", 1),
            "classIds": q.get("classIds", []),
            "overviewGroup": q.get("overviewGroup"),
        }
        if mode in ("photoToName", "nameToPhoto", "weakOnly", "dueReview"):
            visual = "nameToPhoto" if mode == "nameToPhoto" else "photoToName"
            payload["visual"] = visual
            n = min(4, len(q["pool"]))
            payload["choices"] = [self._quiz_student_out(ch) for ch in pick_choices(student, q["pool"], n)]
        else:
            payload["visual"] = mode
        return payload

    def home(self) -> dict[str, Any]:
        storage.ensure_dirs()
        classes = self._home_classes()
        return self._ok(
            classes=classes,
            overview=self._home_overview(classes),
            modes=[{"id": m[0], "title": m[1], "desc": m[2]} for m in MODES],
        )

    def reorder_classes(self, class_ids: list[str]) -> dict[str, Any]:
        try:
            storage.save_class_order(class_ids)
            return self.home()
        except ValueError as e:
            return self._err(str(e))

    def reset_class_order(self) -> dict[str, Any]:
        storage.reset_class_order()
        return self.home()

    def export_data(self) -> dict[str, Any]:
        if not self._window:
            return self._err("창이 아직 준비되지 않았습니다.")
        stamp = time.strftime("%Y%m%d")
        result = self._window.create_file_dialog(
            webview.SAVE_DIALOG,
            directory=str(Path.home() / "Desktop"),
            save_filename=f"네임브릿지_백업_{stamp}.zip",
            file_types=("백업 파일 (*.zip)",),
        )
        if not result:
            return {"ok": True, "cancelled": True}
        path = result if isinstance(result, str) else result[0]
        if not str(path).lower().endswith(".zip"):
            path = f"{path}.zip"
        try:
            meta = storage.export_backup(path)
            return self._ok(path=str(path), **meta)
        except Exception as e:
            return self._err(f"내보내기에 실패했습니다: {e}")

    def import_data(self, mode: str = "replace") -> dict[str, Any]:
        if mode not in {"replace", "merge"}:
            return self._err("불러오기 방식이 올바르지 않습니다.")
        if not self._window:
            return self._err("창이 아직 준비되지 않았습니다.")
        result = self._window.create_file_dialog(
            webview.OPEN_DIALOG,
            allow_multiple=False,
            file_types=("백업 파일 (*.zip)", "모든 파일 (*.*)"),
        )
        if not result:
            return {"ok": True, "cancelled": True}
        path = result[0]
        try:
            meta = storage.import_backup(path, mode=mode)
            self._current = None
            self._quiz_state = None
            self._photo_cache.clear()
            self._pending_photo = None
            home = self.home()
            return self._ok(
                path=str(path),
                mode=meta.get("mode", mode),
                importedClassCount=meta.get("classCount", 0),
                importedStudentCount=meta.get("studentCount", 0),
                classes=home["classes"],
                overview=home["overview"],
                modes=home["modes"],
            )
        except Exception as e:
            return self._err(f"불러오기에 실패했습니다: {e}")

    def open_class(self, class_id: str) -> dict[str, Any]:
        data = storage.load_class(class_id)
        if not data:
            return self._err("학급을 찾을 수 없습니다.")
        self._current = data
        return self._ok(**self._pack_class())

    def refresh_class(self) -> dict[str, Any]:
        if not self._current:
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
        self._current = storage.load_class(data["id"])
        return self._ok(**self._pack_class())

    def save_class_meta(self, name: str, school: str, teacher: str) -> dict[str, Any]:
        if not self._current:
            return self._err("열린 학급이 없습니다.")
        name = (name or "").strip()
        if name:
            self._current["name"] = name
        self._current["school"] = (school or "").strip()
        self._current["teacher"] = (teacher or "").strip()
        self._persist(reload=True)
        return self._ok(**self._pack_class())

    def delete_class(self) -> dict[str, Any]:
        if not self._current:
            return self._err("열린 학급이 없습니다.")
        return self.delete_class_by_id(self._current["id"])

    def delete_class_by_id(self, class_id: str) -> dict[str, Any]:
        exists = any(item.get("id") == class_id for item in storage.list_classes())
        if not exists:
            return self._err("학급을 찾을 수 없습니다.")
        storage.delete_class(class_id)
        if self._current and self._current.get("id") == class_id:
            self._current = None
            self._quiz_state = None
            self._photo_cache.clear()
        return self.home()

    def pick_excel(self) -> dict[str, Any]:
        if not self._window:
            return self._err("창이 아직 준비되지 않았습니다.")
        result = self._window.create_file_dialog(
            webview.OPEN_DIALOG,
            allow_multiple=True,
            file_types=("Excel 파일 (*.xlsx)", "모든 파일 (*.*)"),
        )
        if not result:
            return {"ok": True, "cancelled": True}
        return self.import_excel_paths(list(result))

    def import_excel_paths(
        self,
        paths: list[str],
        labels: list[str] | None = None,
        initial_errors: list[dict[str, str]] | None = None,
    ) -> dict[str, Any]:
        imported_classes = []
        errors = list(initial_errors or [])
        imported_students = 0

        for index, path in enumerate(paths):
            if not path:
                continue
            label = labels[index] if labels and index < len(labels) else Path(path).name
            try:
                data = import_roster_xlsx(path)
                storage.save_class(data)
                imported_classes.append(_class_meta(data))
                imported_students += len(data.get("students", []))
                self._current = storage.load_class(data["id"])
            except Exception as e:
                errors.append({"file": label, "error": str(e)})

        if not imported_classes:
            message = errors[0]["error"] if errors else "불러올 엑셀 파일이 없습니다."
            return {"ok": False, "error": message, "errors": errors}

        self._photo_cache.clear()
        home = self.home()
        return self._ok(
            imported=imported_students,
            importedCount=len(imported_classes),
            importedClasses=imported_classes,
            failedCount=len(errors),
            errors=errors,
            classes=home["classes"],
            overview=home["overview"],
            modes=home["modes"],
        )

    def import_excel_path(self, path: str) -> dict[str, Any]:
        if not path:
            return self._err("파일 경로가 없습니다.")
        try:
            data = import_roster_xlsx(path)
            storage.save_class(data)
            self._current = storage.load_class(data["id"])
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

    def import_excel_files_b64(self, files: list[dict[str, str]]) -> dict[str, Any]:
        if not files:
            return self._err("파일이 비어 있습니다.")

        temp_paths = []
        labels = []
        errors = []
        try:
            for item in files:
                name = Path(item.get("name") or "roster.xlsx").name
                encoded = item.get("data") or ""
                if not encoded:
                    errors.append({"file": name, "error": "파일이 비어 있습니다."})
                    continue
                try:
                    raw = base64.b64decode(encoded, validate=True)
                    fd, tmp = tempfile.mkstemp(suffix=".xlsx")
                    os.close(fd)
                    Path(tmp).write_bytes(raw)
                    temp_paths.append(tmp)
                    labels.append(name)
                except Exception as e:
                    errors.append({"file": name, "error": str(e)})
            return self.import_excel_paths(temp_paths, labels, errors)
        finally:
            for tmp in temp_paths:
                try:
                    os.unlink(tmp)
                except OSError:
                    pass

    def pick_image(self) -> dict[str, Any]:
        if not self._window:
            return self._err("창이 아직 준비되지 않았습니다.")
        result = self._window.create_file_dialog(
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
        if not self._current:
            return self._err("열린 학급이 없습니다.")
        name = (name or "").strip()
        if not name:
            return self._err("이름을 입력하세요.")
        nums = [s.get("number", 0) for s in self._current.get("students", [])]
        number = (max(nums) if nums else 0) + 1
        sid = storage.uid("stu")
        photo_file = None
        if self._pending_photo:
            photo_file = storage.save_student_photo(self._current["id"], sid, self._pending_photo)
            self._pending_photo = None
        self._current.setdefault("students", []).append(
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
        if not self._current:
            return self._err("열린 학급이 없습니다.")
        st = next((s for s in self._current.get("students", []) if s["id"] == student_id), None)
        if not st:
            return self._err("학생을 찾을 수 없습니다.")
        name = (name or "").strip()
        if name:
            st["name"] = name
        photo_src = self._pending_photo if change_photo else None
        if photo_src:
            st["photoFile"] = storage.save_student_photo(self._current["id"], st["id"], photo_src)
            self._photo_cache.clear()
            self._pending_photo = None
        self._persist(reload=True)
        return self._ok(**self._pack_class())

    def start_quiz(self, mode_id: str) -> dict[str, Any]:
        if not self._current:
            return self._err("열린 학급이 없습니다.")
        self._persist(reload=True)
        students = self._current.get("students", [])
        pool = [s for s in students if s.get("photoPath") and s.get("name")]
        if len(pool) < 1:
            return self._err("사진이 있는 학생이 필요합니다.")
        if mode_id in ("photoToName", "nameToPhoto") and len(pool) < 2:
            return self._err("객관식은 사진 있는 학생이 2명 이상 필요합니다.")
        queue = build_queue(students, mode_id, count=min(12, len(pool)))
        self._quiz_state = {
            "mode": mode_id,
            "queue": queue,
            "index": 0,
            "correct": 0,
            "answered": 0,
            "pool": pool,
            "label": next((m[1] for m in MODES if m[0] == mode_id), mode_id),
            "locked": False,
            "returnTo": "class",
            "classCount": 1,
            "classLabels": {},
            "classData": [],
            "classIds": [],
        }
        return self._ok(quiz=self._question_payload())

    def start_multi_class_quiz(self, class_ids: list[str], mode_id: str) -> dict[str, Any]:
        valid_modes = {mode[0] for mode in MODES}
        if mode_id not in valid_modes:
            return self._err("지원하지 않는 퀴즈 방식입니다.")
        unique_ids = list(dict.fromkeys(class_ids or []))
        if not unique_ids:
            return self._err("퀴즈에 포함할 학급을 선택하세요.")

        class_data = []
        students = []
        class_labels = {}
        for class_id in unique_ids:
            data = storage.load_class(class_id)
            if not data:
                return self._err("선택한 학급 중 찾을 수 없는 학급이 있습니다.")
            class_data.append(data)
            class_name = data.get("name") or "학급"
            for student in data.get("students", []):
                students.append(student)
                class_labels[student["id"]] = class_name

        pool = [student for student in students if student.get("photoPath") and student.get("name")]
        if not pool:
            return self._err("선택한 학급에 사진이 있는 학생이 필요합니다.")
        if mode_id in ("photoToName", "nameToPhoto") and len(pool) < 2:
            return self._err("객관식은 사진 있는 학생이 2명 이상 필요합니다.")

        mode_label = next((m[1] for m in MODES if m[0] == mode_id), mode_id)
        queue = build_queue(students, mode_id, count=min(20, len(pool)))
        self._quiz_state = {
            "mode": mode_id,
            "queue": queue,
            "index": 0,
            "correct": 0,
            "answered": 0,
            "pool": pool,
            "label": f"{len(class_data)}개 학급 · {mode_label}",
            "locked": False,
            "returnTo": "home",
            "classCount": len(class_data),
            "classLabels": class_labels,
            "classData": class_data,
            "classIds": unique_ids,
        }
        return self._ok(quiz=self._question_payload())

    def open_overview_group(self, group: str) -> dict[str, Any]:
        if group not in OVERVIEW_GROUPS:
            return self._err("지원하지 않는 종합 분석 항목입니다.")
        self._photo_cache.clear()
        return self._ok(**self._pack_overview_group(group))

    def start_overview_quiz(self, group: str, mode_id: str = "photoToName") -> dict[str, Any]:
        if group not in OVERVIEW_GROUPS:
            return self._err("지원하지 않는 종합 분석 항목입니다.")
        valid_modes = {mode[0] for mode in OVERVIEW_MODES}
        if mode_id not in valid_modes:
            return self._err("지원하지 않는 퀴즈 방식입니다.")

        class_data, students, class_labels, class_ids = self._load_all_classes()
        candidates = filter_overview_group(students, group)
        quizable = [student for student in candidates if student.get("photoPath") and student.get("name")]
        pool = [student for student in students if student.get("photoPath") and student.get("name")]
        title = OVERVIEW_GROUPS[group][0]

        if not quizable:
            return self._err(f"퀴즈를 진행할 {title}이 없습니다.")
        if mode_id in ("photoToName", "nameToPhoto") and len(pool) < 2:
            return self._err("객관식은 사진 있는 학생이 2명 이상 필요합니다.")

        mode_label = next((m[1] for m in OVERVIEW_MODES if m[0] == mode_id), mode_id)
        queue = build_queue(quizable, mode_id, count=min(20, len(quizable)))
        self._quiz_state = {
            "mode": mode_id,
            "queue": queue,
            "index": 0,
            "correct": 0,
            "answered": 0,
            "pool": pool,
            "label": f"종합 분석 · {title} · {mode_label}",
            "locked": False,
            "returnTo": "overview",
            "classCount": len(class_data),
            "classLabels": class_labels,
            "classData": class_data,
            "classIds": class_ids,
            "overviewGroup": group,
        }
        return self._ok(quiz=self._question_payload())

    def quiz_choose(self, choice_id: str) -> dict[str, Any]:
        q = self._quiz_state
        if not q or q.get("locked"):
            return self._err("이미 답을 골랐어요.")
        student = q["queue"][q["index"]]
        q["locked"] = True
        ok = choice_id == student["id"]
        record_answer(student, ok)
        q["answered"] += 1
        if ok:
            q["correct"] += 1
        self._persist_quiz_progress(reload=False)
        return self._ok(
            correct=ok,
            message="정답!" if ok else f"오답 → {student.get('number')}. {student.get('name')}",
        )

    def quiz_unknown(self) -> dict[str, Any]:
        q = self._quiz_state
        if not q or q.get("locked"):
            return self._err("이미 답을 골랐어요.")
        student = q["queue"][q["index"]]
        q["locked"] = True
        record_answer(student, False)
        q["answered"] += 1
        self._persist_quiz_progress(reload=False)
        return self._ok(
            correct=False,
            message=f"정답 → {student.get('number')}. {student.get('name')}",
        )

    def quiz_type(self, text: str) -> dict[str, Any]:
        q = self._quiz_state
        if not q or q.get("locked"):
            return self._err("이미 답을 입력했어요.")
        student = q["queue"][q["index"]]
        q["locked"] = True
        ok = names_match(text, student.get("name", ""))
        record_answer(student, ok)
        q["answered"] += 1
        if ok:
            q["correct"] += 1
        self._persist_quiz_progress(reload=False)
        return self._ok(
            correct=ok,
            message="정답!" if ok else f"오답 → {student.get('name')}",
        )

    def quiz_practice(self, easy: bool) -> dict[str, Any]:
        q = self._quiz_state
        if not q or q.get("locked"):
            return self._err("이미 평가했어요.")
        student = q["queue"][q["index"]]
        q["locked"] = True
        apply_review(student, 4 if easy else 1)
        q["answered"] += 1
        if easy:
            q["correct"] += 1
        self._persist_quiz_progress(reload=False)
        return self._ok(correct=bool(easy))

    def quiz_next(self) -> dict[str, Any]:
        q = self._quiz_state
        if not q:
            return self._err("진행 중인 퀴즈가 없습니다.")
        q["index"] += 1
        q["locked"] = False
        if q["index"] >= len(q["queue"]):
            self._persist_quiz_progress(reload=True)
        return self._ok(quiz=self._question_payload())
