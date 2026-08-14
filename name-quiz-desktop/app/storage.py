"""로컬 저장소 — %APPDATA%/NameQuiz 에 학급·사진·기록을 보관합니다."""
from __future__ import annotations

import json
import shutil
import time
import uuid
from pathlib import Path
from typing import Any

APP_DIR = Path.home() / "AppData" / "Roaming" / "NameQuiz"
CLASSES_DIR = APP_DIR / "classes"
INDEX_FILE = APP_DIR / "index.json"


def ensure_dirs() -> None:
    CLASSES_DIR.mkdir(parents=True, exist_ok=True)


def uid(prefix: str = "id") -> str:
    return f"{prefix}_{uuid.uuid4().hex[:10]}"


def empty_stats() -> dict[str, Any]:
    return {
        "seen": 0,
        "correct": 0,
        "wrong": 0,
        "streak": 0,
        "ease": 2.5,
        "interval": 0,
        "nextReview": 0,
        "lastSeen": 0,
    }


def _read_index() -> list[dict[str, Any]]:
    ensure_dirs()
    if not INDEX_FILE.exists():
        return []
    try:
        data = json.loads(INDEX_FILE.read_text(encoding="utf-8"))
        return data.get("classes", [])
    except Exception:
        return []


def _write_index(items: list[dict[str, Any]]) -> None:
    ensure_dirs()
    INDEX_FILE.write_text(
        json.dumps({"classes": items}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def class_dir(class_id: str) -> Path:
    return CLASSES_DIR / class_id


def list_classes() -> list[dict[str, Any]]:
    items = _read_index()
    items.sort(key=lambda x: x.get("updatedAt", 0), reverse=True)
    return items


def load_class(class_id: str) -> dict[str, Any] | None:
    path = class_dir(class_id) / "class.json"
    if not path.exists():
        return None
    data = json.loads(path.read_text(encoding="utf-8"))
    for st in data.get("students", []):
        st.setdefault("stats", empty_stats())
        photo = st.get("photoFile")
        if photo:
            full = class_dir(class_id) / "photos" / photo
            st["photoPath"] = str(full) if full.exists() else None
        else:
            st["photoPath"] = None
    return data


def save_class(data: dict[str, Any]) -> dict[str, Any]:
    ensure_dirs()
    class_id = data["id"]
    folder = class_dir(class_id)
    photos = folder / "photos"
    photos.mkdir(parents=True, exist_ok=True)

    data["updatedAt"] = int(time.time() * 1000)
    data.setdefault("createdAt", data["updatedAt"])

    # 인덱스용 요약
    summary = {
        "id": class_id,
        "name": data.get("name", "학급"),
        "school": data.get("school", ""),
        "teacher": data.get("teacher", ""),
        "grade": data.get("grade"),
        "classNum": data.get("classNum"),
        "studentCount": len(data.get("students", [])),
        "updatedAt": data["updatedAt"],
        "createdAt": data.get("createdAt"),
    }
    items = [x for x in _read_index() if x.get("id") != class_id]
    items.insert(0, summary)
    _write_index(items)

    # 저장 시 photoPath는 파일로만 유지, json에는 photoFile만
    to_save = json.loads(json.dumps(data))
    for st in to_save.get("students", []):
        st.pop("photoPath", None)
        st.setdefault("stats", empty_stats())

    (folder / "class.json").write_text(
        json.dumps(to_save, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return data


def delete_class(class_id: str) -> None:
    folder = class_dir(class_id)
    if folder.exists():
        shutil.rmtree(folder, ignore_errors=True)
    items = [x for x in _read_index() if x.get("id") != class_id]
    _write_index(items)


def save_student_photo(class_id: str, student_id: str, source_path: str | Path) -> str:
    """이미지 파일을 학급 photos 폴더에 복사하고 파일명을 반환."""
    photos = class_dir(class_id) / "photos"
    photos.mkdir(parents=True, exist_ok=True)
    src = Path(source_path)
    ext = src.suffix.lower() or ".jpg"
    if ext not in {".jpg", ".jpeg", ".png", ".webp", ".gif"}:
        ext = ".jpg"
    name = f"{student_id}{ext}"
    dest = photos / name
    shutil.copyfile(src, dest)
    return name


def save_photo_bytes(class_id: str, student_id: str, data: bytes, ext: str = ".jpg") -> str:
    photos = class_dir(class_id) / "photos"
    photos.mkdir(parents=True, exist_ok=True)
    if not ext.startswith("."):
        ext = "." + ext
    name = f"{student_id}{ext}"
    (photos / name).write_bytes(data)
    return name
