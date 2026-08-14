"""퀴즈 로직 · 약점 학생 · 간단 간격 반복."""
from __future__ import annotations

import random
import time
from typing import Any

from .storage import empty_stats

MODES = [
    ("photoToName", "사진 보고 이름 고르기", "사진을 보고 친구 이름을 골라요."),
    ("nameToPhoto", "이름 보고 사진 고르기", "이름을 보고 짝이 맞는 사진을 찾아요."),
    ("practice", "연습하기 (카드 뒤집기)", "카드를 뒤집어 확인하고 알았는지 눌러요."),
    ("typeName", "이름 직접 입력", "사진을 보고 이름을 직접 써 봐요."),
    ("weakOnly", "약한 학생만", "아직 헷갈리는 친구들만 모아 복습해요."),
    ("dueReview", "복습 대기", "복습 타이밍이 된 친구만 다시 만나요."),
]

OVERVIEW_MODES = [mode for mode in MODES if mode[0] in ("photoToName", "nameToPhoto", "practice", "typeName")]
MASTERY_STREAK = 3
OVERVIEW_GROUPS = {
    "students": ("전체 학생", "모든 학급의 학생입니다. 아래에서 퀴즈 방식을 골라 진행하세요."),
    "weak": ("약한 학생", "정답률이 70% 미만인 학생입니다. 아래에서 퀴즈 방식을 골라 진행하세요."),
    "due": ("복습", "복습 타이밍이 된 학생입니다. 아래에서 퀴즈 방식을 골라 진행하세요."),
    "mastered": ("잘 맞춤", "연속 3회 정확하게 맞춘 학생입니다. 이 명단 퀴즈에서 틀리면 바로 빠집니다."),
}


def ensure_stats(student: dict[str, Any]) -> dict[str, Any]:
    if not student.get("stats"):
        student["stats"] = empty_stats()
    return student["stats"]


def accuracy_of(stats: dict[str, Any]) -> float | None:
    if not stats or stats.get("seen", 0) == 0:
        return None
    return stats["correct"] / stats["seen"]


def weakness_score(student: dict[str, Any]) -> float:
    s = ensure_stats(student)
    if s["seen"] == 0:
        return 0.35
    acc = s["correct"] / s["seen"]
    wrong_w = min(s["wrong"], 10) / 10
    return (1 - acc) * 0.7 + wrong_w * 0.3


def get_weak_students(students: list[dict], limit: int = 12) -> list[dict]:
    pool = [
        st
        for st in students
        if st.get("photoPath") and st.get("name")
        and (
            ensure_stats(st)["seen"] < 1
            or (ensure_stats(st)["correct"] / max(ensure_stats(st)["seen"], 1) < 0.7)
            or ensure_stats(st)["wrong"] >= 2
        )
    ]
    pool.sort(key=weakness_score, reverse=True)
    return pool[:limit]


def get_due_students(students: list[dict]) -> list[dict]:
    now = int(time.time() * 1000)
    due = [
        st
        for st in students
        if st.get("photoPath")
        and ensure_stats(st).get("nextReview", 0) > 0
        and ensure_stats(st)["nextReview"] <= now
    ]
    due.sort(key=lambda s: ensure_stats(s)["nextReview"])
    return due


def is_weak_counted(student: dict[str, Any]) -> bool:
    s = ensure_stats(student)
    return s["seen"] > 0 and s["correct"] / s["seen"] < 0.7


def is_due_counted(student: dict[str, Any]) -> bool:
    now = int(time.time() * 1000)
    s = ensure_stats(student)
    return s.get("nextReview", 0) > 0 and s["nextReview"] <= now


def is_mastered_student(student: dict[str, Any]) -> bool:
    return ensure_stats(student).get("streak", 0) >= MASTERY_STREAK


def get_mastered_students(students: list[dict]) -> list[dict]:
    pool = [st for st in students if is_mastered_student(st)]
    pool.sort(
        key=lambda st: (
            -ensure_stats(st).get("streak", 0),
            (st.get("name") or "").strip().casefold(),
        )
    )
    return pool


def filter_overview_group(students: list[dict], group: str) -> list[dict]:
    if group == "weak":
        return [st for st in students if is_weak_counted(st)]
    if group == "due":
        return [st for st in students if is_due_counted(st)]
    if group == "mastered":
        return get_mastered_students(students)
    return list(students)


def apply_review(student: dict[str, Any], quality: int) -> dict[str, Any]:
    s = ensure_stats(student)
    s["seen"] += 1
    s["lastSeen"] = int(time.time() * 1000)
    if quality >= 3:
        s["correct"] += 1
        s["streak"] += 1
        if s["interval"] == 0:
            s["interval"] = 1
        elif s["interval"] == 1:
            s["interval"] = 3
        else:
            s["interval"] = round(s["interval"] * s["ease"])
        s["ease"] = max(1.3, s["ease"] + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)))
        s["nextReview"] = s["lastSeen"] + max(s["interval"], 1) * 24 * 60 * 60 * 1000
    else:
        s["wrong"] += 1
        s["streak"] = 0
        s["interval"] = 0
        s["ease"] = max(1.3, s["ease"] - 0.2)
        s["nextReview"] = s["lastSeen"]
    return s


def record_answer(student: dict[str, Any], correct: bool) -> dict[str, Any]:
    return apply_review(student, 4 if correct else 1)


def build_queue(students: list[dict], mode_id: str, count: int = 12) -> list[dict]:
    with_photo = [s for s in students if s.get("photoPath") and s.get("name")]
    pool = with_photo
    if mode_id == "weakOnly":
        pool = get_weak_students(with_photo) or with_photo
    elif mode_id == "dueReview":
        pool = get_due_students(with_photo) or get_weak_students(with_photo) or with_photo
    ranked = sorted(pool, key=weakness_score, reverse=True)
    n = min(count, len(ranked))
    top = ranked[: max(1, int(n * 0.6))]
    rest = ranked[len(top) :]
    random.shuffle(rest)
    picked = (top + rest)[:n]
    random.shuffle(picked)
    return picked


def pick_choices(correct: dict, pool: list[dict], n: int = 4) -> list[dict]:
    others = [s for s in pool if s["id"] != correct["id"]]
    random.shuffle(others)
    choices = [correct] + others[: max(0, n - 1)]
    random.shuffle(choices)
    return choices


def names_match(a: str, b: str) -> bool:
    return "".join((a or "").split()).lower() == "".join((b or "").split()).lower()


def class_summary(students: list[dict]) -> dict[str, Any]:
    seen = correct = weak = due = mastered = 0
    now = int(time.time() * 1000)
    for st in students:
        s = ensure_stats(st)
        seen += s["seen"]
        correct += s["correct"]
        if s["seen"] > 0 and s["correct"] / s["seen"] < 0.7:
            weak += 1
        if s.get("nextReview", 0) > 0 and s["nextReview"] <= now:
            due += 1
        if s.get("streak", 0) >= MASTERY_STREAK:
            mastered += 1
    return {
        "total": len(students),
        "withPhoto": sum(1 for s in students if s.get("photoPath")),
        "accuracy": (correct / seen) if seen else None,
        "weak": weak,
        "due": due,
        "mastered": mastered,
        "attempts": seen,
    }
