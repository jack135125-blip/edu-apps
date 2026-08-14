/**
 * 퀴즈 로직 + 간단 SM-2 간격 반복 + 약점 학생 산출
 */
import { emptyStats } from './excel.js';

export const MODES = {
  photoToName: {
    id: 'photoToName',
    label: '사진 보고 이름 고르기',
    desc: '사진을 보고 친구 이름을 골라요.',
  },
  nameToPhoto: {
    id: 'nameToPhoto',
    label: '이름 보고 사진 고르기',
    desc: '이름을 보고 짝이 맞는 사진을 찾아요.',
  },
  practice: {
    id: 'practice',
    label: '연습하기 (카드 뒤집기)',
    desc: '카드를 뒤집어 확인하고, 알았는지 눌러요.',
  },
  typeName: {
    id: 'typeName',
    label: '이름 직접 입력',
    desc: '사진을 보고 이름을 직접 써 봐요. 암기에 좋아요!',
  },
  matching: {
    id: 'matching',
    label: '짝 맞추기',
    desc: '이름과 사진을 서로 연결해 봐요.',
  },
  weakOnly: {
    id: 'weakOnly',
    label: '약한 학생만',
    desc: '아직 헷갈리는 친구들만 모아 복습해요.',
  },
  dueReview: {
    id: 'dueReview',
    label: '복습 대기',
    desc: '복습 타이밍이 된 친구만 다시 만나요.',
  },
};

export function ensureStats(student) {
  if (!student.stats) student.stats = emptyStats();
  return student.stats;
}

export function accuracyOf(stats) {
  if (!stats || stats.seen === 0) return null;
  return stats.correct / stats.seen;
}

/** 약점 점수: 높을수록 더 못 외움 */
export function weaknessScore(student) {
  const s = ensureStats(student);
  if (s.seen === 0) return 0.35; // 아직 안 본 학생도 약간 우선
  const acc = s.correct / s.seen;
  const wrongWeight = Math.min(s.wrong, 10) / 10;
  return (1 - acc) * 0.7 + wrongWeight * 0.3;
}

export function getWeakStudents(students, { minSeen = 1, maxAccuracy = 0.7, limit = 12 } = {}) {
  return students
    .filter((st) => {
      const s = ensureStats(st);
      if (s.seen < minSeen) return true;
      return s.correct / s.seen < maxAccuracy || s.wrong >= 2;
    })
    .sort((a, b) => weaknessScore(b) - weaknessScore(a))
    .slice(0, limit);
}

export function getDueStudents(students, now = Date.now()) {
  return students
    .filter((st) => {
      const s = ensureStats(st);
      return s.nextReview > 0 && s.nextReview <= now;
    })
    .sort((a, b) => ensureStats(a).nextReview - ensureStats(b).nextReview);
}

export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function pickChoices(correct, pool, count = 4) {
  const others = shuffle(pool.filter((s) => s.id !== correct.id)).slice(0, Math.max(0, count - 1));
  return shuffle([correct, ...others]);
}

/**
 * SM-2 간소화: quality 0(틀림)~5(완벽)
 */
export function applyReview(student, quality) {
  const s = ensureStats(student);
  s.seen += 1;
  s.lastSeen = Date.now();

  if (quality >= 3) {
    s.correct += 1;
    s.streak += 1;
    if (s.interval === 0) s.interval = 1;
    else if (s.interval === 1) s.interval = 3;
    else s.interval = Math.round(s.interval * s.ease);
    s.ease = Math.max(1.3, s.ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));
  } else {
    s.wrong += 1;
    s.streak = 0;
    s.interval = 0;
    s.ease = Math.max(1.3, s.ease - 0.2);
  }

  const days = Math.max(s.interval, quality >= 3 ? 1 : 0);
  // 틀린 경우 바로 복습 대기(지금), 맞은 경우 interval일 후
  s.nextReview = quality >= 3 ? Date.now() + days * 24 * 60 * 60 * 1000 : Date.now();
  return s;
}

export function recordAnswer(student, isCorrect) {
  return applyReview(student, isCorrect ? 4 : 1);
}

export function buildQuizQueue(students, modeId, options = {}) {
  const withPhoto = students.filter((s) => s.photo && s.name);
  let pool = withPhoto;

  if (modeId === 'weakOnly') {
    pool = getWeakStudents(withPhoto, options.weakOpts || {});
    if (pool.length < 2) pool = withPhoto;
  } else if (modeId === 'dueReview') {
    pool = getDueStudents(withPhoto);
    if (!pool.length) pool = getWeakStudents(withPhoto, { minSeen: 0, maxAccuracy: 1, limit: 8 });
    if (!pool.length) pool = withPhoto;
  }

  const count = Math.min(options.count || pool.length, pool.length);
  // 약한 학생 가중 샘플링
  const ranked = shuffle(pool).sort((a, b) => weaknessScore(b) - weaknessScore(a));
  // 상위 약점 + 랜덤 섞기
  const top = ranked.slice(0, Math.ceil(count * 0.6));
  const rest = shuffle(ranked.slice(Math.ceil(count * 0.6))).slice(0, count - top.length);
  return shuffle([...top, ...rest]).slice(0, count);
}

export function normalizeName(str) {
  return String(str || '')
    .replace(/\s+/g, '')
    .toLowerCase();
}

export function namesMatch(input, answer) {
  return normalizeName(input) === normalizeName(answer);
}

export function classSummary(students) {
  const list = students || [];
  let seen = 0;
  let correct = 0;
  let weak = 0;
  let due = 0;
  const now = Date.now();
  for (const st of list) {
    const s = ensureStats(st);
    seen += s.seen;
    correct += s.correct;
    if (s.seen > 0 && s.correct / s.seen < 0.7) weak += 1;
    if (s.nextReview > 0 && s.nextReview <= now) due += 1;
  }
  return {
    total: list.length,
    withPhoto: list.filter((s) => s.photo).length,
    accuracy: seen ? correct / seen : null,
    weak,
    due,
    attempts: seen,
  };
}
