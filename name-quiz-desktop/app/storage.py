"""로컬 저장소 — %APPDATA%/NameQuiz 에 학급·사진·기록을 보관합니다."""
from __future__ import annotations

import json
import shutil
import tempfile
import time
import uuid
import zipfile
from pathlib import Path
from typing import Any

APP_DIR = Path.home() / "AppData" / "Roaming" / "NameQuiz"
CLASSES_DIR = APP_DIR / "classes"
INDEX_FILE = APP_DIR / "index.json"
CLASS_ORDER_FILE = APP_DIR / "class_order.json"
BACKUP_FORMAT = "namequiz-backup"
BACKUP_VERSION = 1


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
    custom_order = _read_class_order()
    if custom_order:
        positions = {class_id: index for index, class_id in enumerate(custom_order)}
        items.sort(
            key=lambda item: (
                positions.get(item.get("id"), len(positions)),
                _class_sort_key(item),
            )
        )
    else:
        items.sort(key=_class_sort_key)
    return items


def _class_sort_key(item: dict[str, Any]) -> tuple[Any, ...]:
    """학년·반 숫자를 우선하고 이름을 자연스러운 오름차순으로 정렬."""
    grade = item.get("grade")
    class_num = item.get("classNum")
    return (
        grade is None,
        grade if grade is not None else 10**9,
        class_num is None,
        class_num if class_num is not None else 10**9,
        (item.get("name") or "").strip().casefold(),
    )


def _read_class_order() -> list[str]:
    if not CLASS_ORDER_FILE.exists():
        return []
    try:
        data = json.loads(CLASS_ORDER_FILE.read_text(encoding="utf-8"))
        return [str(class_id) for class_id in data.get("classIds", [])]
    except Exception:
        return []


def save_class_order(class_ids: list[str]) -> None:
    ensure_dirs()
    current_ids = {item.get("id") for item in _read_index()}
    if len(class_ids) != len(current_ids) or set(class_ids) != current_ids:
        raise ValueError("학급 순서 정보가 올바르지 않습니다.")
    CLASS_ORDER_FILE.write_text(
        json.dumps({"classIds": class_ids}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def reset_class_order() -> None:
    if CLASS_ORDER_FILE.exists():
        CLASS_ORDER_FILE.unlink()


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
    order = [item_id for item_id in _read_class_order() if item_id != class_id]
    if order:
        CLASS_ORDER_FILE.write_text(
            json.dumps({"classIds": order}, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
    elif CLASS_ORDER_FILE.exists():
        CLASS_ORDER_FILE.unlink()


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


def _safe_zip_member(name: str) -> Path | None:
    """zip 내부 경로가 APP_DIR 밖으로 나가지 않도록 검증."""
    cleaned = name.replace("\\", "/").lstrip("/")
    if not cleaned or cleaned.endswith("/"):
        return None
    if ".." in Path(cleaned).parts:
        return None
    target = (APP_DIR / cleaned).resolve()
    root = APP_DIR.resolve()
    if root != target and root not in target.parents:
        return None
    return Path(cleaned)


def export_backup(dest_path: str | Path) -> dict[str, Any]:
    """학급·사진·학습 기록을 zip 백업 파일로 저장."""
    ensure_dirs()
    dest = Path(dest_path)
    dest.parent.mkdir(parents=True, exist_ok=True)
    classes = list_classes()
    meta = {
        "format": BACKUP_FORMAT,
        "version": BACKUP_VERSION,
        "exportedAt": int(time.time() * 1000),
        "classCount": len(classes),
        "studentCount": sum(item.get("studentCount", 0) for item in classes),
    }

    with zipfile.ZipFile(dest, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(
            "backup.json",
            json.dumps(meta, ensure_ascii=False, indent=2),
            compress_type=zipfile.ZIP_DEFLATED,
        )
        if INDEX_FILE.exists():
            zf.write(INDEX_FILE, arcname="index.json")
        if CLASS_ORDER_FILE.exists():
            zf.write(CLASS_ORDER_FILE, arcname="class_order.json")
        for folder in CLASSES_DIR.iterdir() if CLASSES_DIR.exists() else []:
            if not folder.is_dir():
                continue
            for path in folder.rglob("*"):
                if path.is_file():
                    zf.write(path, arcname=str(Path("classes") / folder.name / path.relative_to(folder)))

    return meta


def _read_backup_meta(zf: zipfile.ZipFile) -> dict[str, Any]:
    names = set(zf.namelist())
    if "backup.json" in names:
        meta = json.loads(zf.read("backup.json").decode("utf-8"))
        if meta.get("format") != BACKUP_FORMAT:
            raise ValueError("네임브릿지 백업 파일이 아닙니다.")
        return meta
    if "index.json" in names or any(name.startswith("classes/") for name in names):
        return {"format": BACKUP_FORMAT, "version": 1}
    raise ValueError("올바른 백업 파일이 아닙니다.")


def _clear_local_data() -> None:
    ensure_dirs()
    if CLASSES_DIR.exists():
        shutil.rmtree(CLASSES_DIR, ignore_errors=True)
    CLASSES_DIR.mkdir(parents=True, exist_ok=True)
    if INDEX_FILE.exists():
        INDEX_FILE.unlink()
    if CLASS_ORDER_FILE.exists():
        CLASS_ORDER_FILE.unlink()


def _extract_backup(zf: zipfile.ZipFile, target_root: Path) -> None:
    for info in zf.infolist():
        if info.is_dir():
            continue
        name = info.filename.replace("\\", "/")
        if name == "backup.json":
            continue
        relative = _safe_zip_member(name)
        if relative is None:
            continue
        if relative.parts and relative.parts[0] not in {"index.json", "class_order.json", "classes"}:
            if relative.name in {"index.json", "class_order.json"}:
                relative = Path(relative.name)
            else:
                continue
        out = target_root / relative
        out.parent.mkdir(parents=True, exist_ok=True)
        with zf.open(info) as src, open(out, "wb") as dst:
            shutil.copyfileobj(src, dst)


def _rebuild_index_from_classes() -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    if not CLASSES_DIR.exists():
        _write_index([])
        return items
    for folder in CLASSES_DIR.iterdir():
        if not folder.is_dir():
            continue
        data = load_class(folder.name)
        if not data:
            continue
        items.append(
            {
                "id": data["id"],
                "name": data.get("name", "학급"),
                "school": data.get("school", ""),
                "teacher": data.get("teacher", ""),
                "grade": data.get("grade"),
                "classNum": data.get("classNum"),
                "studentCount": len(data.get("students", [])),
                "updatedAt": data.get("updatedAt"),
                "createdAt": data.get("createdAt"),
            }
        )
    items.sort(key=_class_sort_key)
    _write_index(items)
    return items


def import_backup(src_path: str | Path, mode: str = "replace") -> dict[str, Any]:
    """백업 zip을 불러온다. mode: replace(덮어쓰기) | merge(합치기)."""
    if mode not in {"replace", "merge"}:
        raise ValueError("불러오기 방식이 올바르지 않습니다.")
    src = Path(src_path)
    if not src.exists():
        raise FileNotFoundError("백업 파일을 찾을 수 없습니다.")

    ensure_dirs()
    with zipfile.ZipFile(src, "r") as zf:
        meta = _read_backup_meta(zf)
        with tempfile.TemporaryDirectory(prefix="namequiz_backup_") as tmp:
            staging = Path(tmp) / "root"
            staging.mkdir(parents=True, exist_ok=True)
            _extract_backup(zf, staging)

            if mode == "replace":
                _clear_local_data()
                for child in staging.iterdir():
                    target = APP_DIR / child.name
                    if child.is_dir():
                        if target.exists():
                            shutil.rmtree(target, ignore_errors=True)
                        shutil.copytree(child, target)
                    else:
                        shutil.copy2(child, target)
            else:
                staging_classes = staging / "classes"
                imported_ids: list[str] = []
                if staging_classes.exists():
                    for folder in staging_classes.iterdir():
                        if not folder.is_dir():
                            continue
                        class_id = folder.name
                        dest = class_dir(class_id)
                        if dest.exists():
                            shutil.rmtree(dest, ignore_errors=True)
                        shutil.copytree(folder, dest)
                        imported_ids.append(class_id)
                        data = load_class(class_id)
                        if data:
                            save_class(data)

                staging_order = staging / "class_order.json"
                if staging_order.exists():
                    try:
                        incoming = json.loads(staging_order.read_text(encoding="utf-8")).get("classIds", [])
                        current = _read_class_order() or [item["id"] for item in _read_index()]
                        merged = list(dict.fromkeys([*current, *[str(x) for x in incoming]]))
                        current_ids = {item.get("id") for item in _read_index()}
                        merged = [cid for cid in merged if cid in current_ids]
                        if merged and set(merged) == current_ids:
                            save_class_order(merged)
                    except Exception:
                        pass

            if not INDEX_FILE.exists() or not _read_index():
                _rebuild_index_from_classes()
            else:
                # 손상된 index 대비: classes 폴더와 동기화
                known = {item.get("id") for item in _read_index()}
                for folder in CLASSES_DIR.iterdir() if CLASSES_DIR.exists() else []:
                    if folder.is_dir() and folder.name not in known:
                        data = load_class(folder.name)
                        if data:
                            save_class(data)

    classes = list_classes()
    return {
        **meta,
        "mode": mode,
        "classCount": len(classes),
        "studentCount": sum(item.get("studentCount", 0) for item in classes),
    }
