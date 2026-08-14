"""교과별 수강 학생 사진 명렬표 xlsx 파서."""
from __future__ import annotations

import re
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any

from .storage import empty_stats, save_photo_bytes, uid

SS_NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
NAME_RE = re.compile(r"(\d+)\s*학년\s*(\d+)\s*반\s*(\d+)\s*번\s+(.+)")


def _col_to_idx(col: str) -> int:
    n = 0
    for ch in col:
        n = n * 26 + (ord(ch) - 64)
    return n - 1


def _parse_ref(ref: str) -> tuple[int, int] | None:
    m = re.match(r"^([A-Z]+)(\d+)$", ref)
    if not m:
        return None
    return _col_to_idx(m.group(1)), int(m.group(2)) - 1


def _shared_strings(z: zipfile.ZipFile) -> list[str]:
    try:
        root = ET.fromstring(z.read("xl/sharedStrings.xml"))
    except KeyError:
        return []
    out = []
    for si in root.findall("m:si", SS_NS):
        texts = [t.text or "" for t in si.findall(".//m:t", SS_NS)]
        out.append("".join(texts))
    return out


def _sheet_cells(z: zipfile.ZipFile, strings: list[str]) -> list[dict[str, Any]]:
    name = "xl/worksheets/sheet1.xml"
    if name not in z.namelist():
        cands = [n for n in z.namelist() if n.startswith("xl/worksheets/sheet") and n.endswith(".xml")]
        if not cands:
            raise ValueError("시트 파일을 찾을 수 없습니다.")
        name = cands[0]
    root = ET.fromstring(z.read(name))
    cells = []
    for c in root.findall("m:sheetData/m:row/m:c", SS_NS):
        ref = c.get("r")
        v = c.find("m:v", SS_NS)
        if not ref or v is None or v.text is None:
            continue
        pos = _parse_ref(ref)
        if not pos:
            continue
        val = strings[int(v.text)] if c.get("t") == "s" else v.text
        val = str(val).strip()
        if val:
            cells.append({"col": pos[0], "row": pos[1], "value": val})
    return cells


def _drawings(z: zipfile.ZipFile) -> list[dict[str, Any]]:
    if "xl/drawings/drawing1.xml" not in z.namelist():
        return []
    relmap = {}
    if "xl/drawings/_rels/drawing1.xml.rels" in z.namelist():
        rels = ET.fromstring(z.read("xl/drawings/_rels/drawing1.xml.rels"))
        for rel in rels:
            rid = rel.get("Id")
            target = rel.get("Target")
            if rid and target:
                if target.startswith("../"):
                    target = "xl/" + target[3:]
                elif not target.startswith("xl/"):
                    target = "xl/drawings/" + target
                relmap[rid] = target.replace("\\", "/")

    root = ET.fromstring(z.read("xl/drawings/drawing1.xml"))
    pics = []
    for anchor in root:
        if not (anchor.tag.endswith("twoCellAnchor") or anchor.tag.endswith("oneCellAnchor")):
            continue
        fr = None
        for child in anchor:
            if child.tag.endswith("from"):
                fr = child
                break
        if fr is None:
            continue
        col = row = None
        for child in fr:
            if child.tag.endswith("col"):
                col = int(child.text)
            elif child.tag.endswith("row"):
                row = int(child.text)
        rid = None
        for el in anchor.iter():
            if el.tag.endswith("blip"):
                for k, v in el.attrib.items():
                    if k.endswith("embed"):
                        rid = v
        if col is None or row is None or not rid or rid not in relmap:
            continue
        pics.append({"col": col, "row": row, "path": relmap[rid]})
    return pics


def _extract_meta(cells: list[dict[str, Any]]) -> dict[str, Any]:
    meta = {
        "title": "",
        "school": "",
        "subject": "",
        "teacher": "",
        "date": "",
        "grade": None,
        "classNum": None,
    }
    for c in cells:
        v = c["value"]
        if "명렬표" in v:
            meta["title"] = v
        elif any(x in v for x in ("고등학교", "중학교", "초등학교")):
            meta["school"] = v
        elif v.startswith("교과") or "교과 :" in v or "교과:" in v:
            meta["subject"] = re.sub(r"^교과\s*[:：]\s*", "", v)
            m = re.search(r"(\d+)\s*학년.*?(\d+)\s*[-－]?\s*(\d+)\s*반", v)
            if m:
                meta["grade"] = int(m.group(1))
                meta["classNum"] = int(m.group(3) or m.group(2))
        elif "담당교사" in v:
            meta["teacher"] = re.sub(r"^담당교사\s*[:：]\s*", "", v)
        elif re.match(r"^\d{4}[.\-/]\d{1,2}[.\-/]\d{1,2}", v):
            meta["date"] = v
    return meta


def _match(name_cells: list[dict], pics: list[dict]) -> list[tuple[dict, dict]]:
    used: set[int] = set()
    pairs = []
    for pic in pics:
        best = None
        best_dist = 10**9
        for i, nc in enumerate(name_cells):
            if i in used or nc["col"] != pic["col"]:
                continue
            dist = nc["row"] - pic["row"]
            if 0 <= dist <= 4 and dist < best_dist:
                best_dist = dist
                best = i
        if best is None:
            for i, nc in enumerate(name_cells):
                if i in used:
                    continue
                col_dist = abs(nc["col"] - pic["col"])
                row_dist = nc["row"] - pic["row"]
                if col_dist > 2 or row_dist < 0 or row_dist > 4:
                    continue
                score = row_dist * 10 + col_dist
                if score < best_dist:
                    best_dist = score
                    best = i
        if best is None:
            continue
        used.add(best)
        pairs.append((name_cells[best], pic))
    return pairs


def import_roster_xlsx(xlsx_path: str | Path) -> dict[str, Any]:
    xlsx_path = Path(xlsx_path)
    class_id = uid("class")

    with zipfile.ZipFile(xlsx_path, "r") as z:
        strings = _shared_strings(z)
        cells = _sheet_cells(z, strings)
        pics = _drawings(z)
        meta = _extract_meta(cells)

        name_cells = []
        for c in cells:
            m = NAME_RE.match(c["value"])
            if not m:
                continue
            name_cells.append(
                {
                    **c,
                    "grade": int(m.group(1)),
                    "classNum": int(m.group(2)),
                    "number": int(m.group(3)),
                    "name": m.group(4).strip(),
                }
            )
        if not name_cells:
            raise ValueError("학생 이름(예: 2학년 2반 1번  홍길동)을 찾지 못했습니다.")

        pairs = _match(name_cells, pics)
        photo_bytes: dict[str, bytes] = {}
        for nc, pic in pairs:
            try:
                photo_bytes[pic["path"]] = z.read(pic["path"])
            except KeyError:
                pass

    students = []
    for nc in sorted(name_cells, key=lambda x: x["number"]):
        sid = uid("stu")
        pair = next((p for p in pairs if p[0] is nc), None)
        photo_file = None
        if pair:
            raw = photo_bytes.get(pair[1]["path"])
            if raw:
                ext = ".png" if pair[1]["path"].lower().endswith(".png") else ".jpg"
                photo_file = save_photo_bytes(class_id, sid, raw, ext)
        students.append(
            {
                "id": sid,
                "number": nc["number"],
                "name": nc["name"],
                "photoFile": photo_file,
                "stats": empty_stats(),
            }
        )

    grade = meta["grade"] if meta["grade"] is not None else name_cells[0]["grade"]
    class_num = meta["classNum"] if meta["classNum"] is not None else name_cells[0]["classNum"]
    display = meta["subject"] or f"{grade}-{class_num}반"

    return {
        "id": class_id,
        "name": display,
        "school": meta["school"] or "",
        "subject": meta["subject"] or "",
        "teacher": meta["teacher"] or "",
        "grade": grade,
        "classNum": class_num,
        "dateLabel": meta["date"] or "",
        "students": students,
    }
