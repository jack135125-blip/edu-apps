import {
  listClasses,
  getClass,
  saveClass,
  deleteClass,
  addSession,
  uid,
} from './db.js';
import { importNameRosterXlsx, emptyStats } from './excel.js';
import {
  MODES,
  buildQuizQueue,
  pickChoices,
  recordAnswer,
  applyReview,
  shuffle,
  namesMatch,
  classSummary,
  getWeakStudents,
  getDueStudents,
  ensureStats,
  accuracyOf,
} from './quiz.js';

const state = {
  classes: [],
  current: null,
  tab: 'quiz',
  quiz: null,
};

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), 2200);
}

function showView(id) {
  $$('.view').forEach((v) => v.classList.toggle('active', v.id === id));
}

function pct(n) {
  if (n == null || Number.isNaN(n)) return '—';
  return `${Math.round(n * 100)}%`;
}

async function refreshClasses() {
  state.classes = await listClasses();
  renderHome();
}

function renderHome() {
  showView('view-home');
  const grid = $('#class-grid');
  const empty = $('#home-empty');

  if (!state.classes.length) {
    grid.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');
  grid.innerHTML = state.classes
    .map((c) => {
      const s = classSummary(c.students);
      return `
      <button class="class-card" data-open="${c.id}">
        <h3>${escapeHtml(c.name)}</h3>
        <div class="meta">
          ${escapeHtml(c.school || '학교 미입력')} · ${c.grade ?? '?'}-${c.classNum ?? '?'}반
          ${c.teacher ? ` · ${escapeHtml(c.teacher)}` : ''}
        </div>
        <div class="stat-row">
          <span class="chip">${s.total}명</span>
          <span class="chip muted">정확도 ${pct(s.accuracy)}</span>
          ${s.weak ? `<span class="chip warn">약함 ${s.weak}</span>` : ''}
          ${s.due ? `<span class="chip warn">복습 ${s.due}</span>` : ''}
        </div>
      </button>`;
    })
    .join('');
}

async function openClass(id) {
  const cls = await getClass(id);
  if (!cls) {
    toast('학급을 찾을 수 없습니다.');
    return;
  }
  state.current = cls;
  state.tab = 'quiz';
  renderClass();
}

function renderClass() {
  const c = state.current;
  if (!c) return;
  showView('view-class');
  $('#class-title').textContent = c.name;
  $('#class-sub').textContent = [
    c.school,
    c.grade != null ? `${c.grade}-${c.classNum}반` : '',
    c.teacher ? `담당 ${c.teacher}` : '',
    c.dateLabel,
  ]
    .filter(Boolean)
    .join(' · ');

  $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === state.tab));
  $$('[data-panel]').forEach((p) => p.classList.toggle('hidden', p.dataset.panel !== state.tab));

  if (state.tab === 'quiz') renderQuizHub();
  if (state.tab === 'students') renderStudents();
  if (state.tab === 'stats') renderStats();
}

function renderQuizHub() {
  const c = state.current;
  const summary = classSummary(c.students);
  $('#quiz-summary').innerHTML = `
    <div class="stat-row" style="margin-bottom:16px">
      <span class="chip">${summary.withPhoto}/${summary.total}명 사진</span>
      <span class="chip muted">누적 ${summary.attempts}문항</span>
      <span class="chip muted">정확도 ${pct(summary.accuracy)}</span>
      <span class="chip warn">약한 학생 ${summary.weak}</span>
      <span class="chip warn">복습 대기 ${summary.due}</span>
    </div>`;

  $('#mode-grid').innerHTML = Object.values(MODES)
    .map(
      (m) => `
    <button class="mode-card" data-mode="${m.id}">
      <h4>${m.label}</h4>
      <p>${m.desc}</p>
    </button>`
    )
    .join('');
}

function renderStudents() {
  const rows = state.current.students
    .slice()
    .sort((a, b) => a.number - b.number)
    .map((st) => {
      const s = ensureStats(st);
      const acc = accuracyOf(s);
      return `<tr>
        <td>${st.number}</td>
        <td>${st.photo ? `<img class="avatar" src="${st.photo}" alt="">` : '<span class="chip muted">없음</span>'}</td>
        <td><strong>${escapeHtml(st.name)}</strong></td>
        <td>${s.seen}</td>
        <td>${pct(acc)}</td>
        <td>${s.wrong}</td>
        <td>
          <button class="btn btn-ghost btn-sm" data-edit-student="${st.id}">편집</button>
        </td>
      </tr>`;
    })
    .join('');

  $('#student-tbody').innerHTML = rows || `<tr><td colspan="7">학생이 없습니다.</td></tr>`;
}

function renderStats() {
  const students = state.current.students;
  const weak = getWeakStudents(students, { minSeen: 1, maxAccuracy: 0.75, limit: 20 });
  const due = getDueStudents(students);
  const summary = classSummary(students);

  $('#stats-overview').innerHTML = `
    <div class="stat-row">
      <span class="chip">총 ${summary.total}명</span>
      <span class="chip muted">시도 ${summary.attempts}</span>
      <span class="chip muted">정확도 ${pct(summary.accuracy)}</span>
    </div>
    <h4 style="margin:18px 0 8px">잘 안 외워지는 학생</h4>
    <div class="weak-list">
      ${
        weak.length
          ? weak
              .map((st) => {
                const s = ensureStats(st);
                return `<div class="weak-item">
                  ${st.photo ? `<img class="avatar" src="${st.photo}" alt="">` : ''}
                  <div class="info">
                    <strong>${st.number}. ${escapeHtml(st.name)}</strong>
                    <span>정답률 ${pct(accuracyOf(s))} · 오답 ${s.wrong} · 시도 ${s.seen}</span>
                  </div>
                </div>`;
              })
              .join('')
          : '<p class="empty" style="padding:20px">아직 약점 데이터가 없습니다. 퀴즈를 풀어보세요.</p>'
      }
    </div>
    <h4 style="margin:18px 0 8px">오늘 복습 대기 ${due.length}명</h4>
    <div class="stat-row">
      ${
        due.length
          ? due.map((st) => `<span class="chip warn">${st.number}. ${escapeHtml(st.name)}</span>`).join('')
          : '<span class="chip muted">없음</span>'
      }
    </div>
  `;
}

/* -------------------- Quiz runtime -------------------- */

function startQuiz(modeId) {
  const students = state.current.students.filter((s) => s.photo && s.name);
  if (students.length < 2 && modeId !== 'practice' && modeId !== 'typeName') {
    toast('사진이 있는 학생이 2명 이상 필요합니다.');
    return;
  }
  if (!students.length) {
    toast('사진이 있는 학생이 없습니다.');
    return;
  }

  const queue = buildQuizQueue(students, modeId, { count: Math.min(12, students.length) });
  state.quiz = {
    modeId,
    queue,
    index: 0,
    correct: 0,
    answered: 0,
    locked: false,
    pool: students,
    matchState: null,
  };

  showView('view-quiz');
  $('#quiz-mode-label').textContent = MODES[modeId]?.label || modeId;
  renderQuizQuestion();
}

function renderQuizQuestion() {
  const q = state.quiz;
  const stage = $('#quiz-stage');
  const total = q.queue.length;
  const cur = q.index;

  if (cur >= total) {
    return finishQuiz();
  }

  const progress = Math.round((cur / total) * 100);
  $('#quiz-progress-text').textContent = `${cur + 1} / ${total}`;
  $('#quiz-progress-bar').style.width = `${progress}%`;
  $('#quiz-score-live').textContent = `정답 ${q.correct} / ${q.answered}`;

  const student = q.queue[cur];
  q.locked = false;

  if (q.modeId === 'matching') {
    const html = renderMatching();
    if (html) {
      stage.innerHTML = html;
      bindMatching();
      return;
    }
    // 남은 인원이 적으면 4지선다로 처리
  }

  if (q.modeId === 'practice') {
    stage.innerHTML = `
      <div class="quiz-prompt">
        <p style="color:var(--muted);font-size:13px;margin-bottom:12px">카드를 눌러 뒤집으세요</p>
        <div class="flash-card" id="flash">
          <div class="flash-inner">
            <div class="flash-face front">
              <img class="avatar lg" src="${student.photo}" alt="">
            </div>
            <div class="flash-face back">
              <div>
                <div class="big-name">${escapeHtml(student.name)}</div>
                <div style="color:var(--muted);margin-top:8px">${student.number}번</div>
              </div>
            </div>
          </div>
        </div>
        <div class="toolbar" style="justify-content:center;margin-top:18px">
          <button class="btn btn-danger" data-practice="hard">모르겠어</button>
          <button class="btn btn-primary" data-practice="easy">알겠어</button>
        </div>
      </div>`;
    $('#flash').onclick = () => $('#flash').classList.toggle('flipped');
    $$('[data-practice]').forEach((btn) => {
      btn.onclick = async () => {
        if (q.locked) return;
        q.locked = true;
        const easy = btn.dataset.practice === 'easy';
        applyReview(student, easy ? 4 : 1);
        if (easy) q.correct += 1;
        q.answered += 1;
        await persistCurrent();
        q.index += 1;
        renderQuizQuestion();
      };
    });
    return;
  }

  if (q.modeId === 'typeName') {
    stage.innerHTML = `
      <div class="quiz-prompt">
        <img class="avatar lg" src="${student.photo}" alt="">
        <div class="type-row">
          <input id="type-input" placeholder="이름을 입력하세요" autocomplete="off" />
          <button class="btn btn-primary" id="type-submit">확인</button>
        </div>
        <div class="feedback" id="feedback"></div>
      </div>`;
    const input = $('#type-input');
    input.focus();
    const submit = async () => {
      if (q.locked) return;
      q.locked = true;
      const ok = namesMatch(input.value, student.name);
      recordAnswer(student, ok);
      q.answered += 1;
      if (ok) q.correct += 1;
      const fb = $('#feedback');
      fb.className = `feedback ${ok ? 'ok' : 'bad'}`;
      fb.textContent = ok ? '정답!' : `오답 → ${student.name}`;
      await persistCurrent();
      setTimeout(() => {
        q.index += 1;
        renderQuizQuestion();
      }, ok ? 650 : 1100);
    };
    $('#type-submit').onclick = submit;
    input.onkeydown = (e) => {
      if (e.key === 'Enter') submit();
    };
    return;
  }

  // photoToName / nameToPhoto / weakOnly / dueReview / matching 잔여분 → 4지선다
  const actual = q.modeId === 'nameToPhoto' ? 'nameToPhoto' : 'photoToName';
  const choices = pickChoices(student, q.pool, Math.min(4, q.pool.length));

  if (actual === 'photoToName') {
    stage.innerHTML = `
      <div class="quiz-prompt">
        <img class="avatar lg" src="${student.photo}" alt="">
      </div>
      <div class="choices">
        ${choices
          .map(
            (c) =>
              `<button class="choice-btn" data-choice="${c.id}">${c.number}. ${escapeHtml(c.name)}</button>`
          )
          .join('')}
      </div>
      <div class="feedback" id="feedback"></div>`;
  } else {
    stage.innerHTML = `
      <div class="quiz-prompt">
        <div class="big-name">${escapeHtml(student.name)}</div>
        <div style="color:var(--muted);margin-top:6px">${student.number}번</div>
      </div>
      <div class="choices">
        ${choices
          .map(
            (c) =>
              `<button class="choice-btn" data-choice="${c.id}"><img class="avatar choice" src="${c.photo}" alt="${escapeHtml(c.name)}"></button>`
          )
          .join('')}
      </div>
      <div class="feedback" id="feedback"></div>`;
  }

  $$('[data-choice]').forEach((btn) => {
    btn.onclick = async () => {
      if (q.locked) return;
      q.locked = true;
      const ok = btn.dataset.choice === student.id;
      recordAnswer(student, ok);
      q.answered += 1;
      if (ok) q.correct += 1;
      btn.classList.add(ok ? 'correct' : 'wrong');
      $$('[data-choice]').forEach((b) => {
        b.disabled = true;
        if (b.dataset.choice === student.id) b.classList.add('correct');
      });
      const fb = $('#feedback');
      fb.className = `feedback ${ok ? 'ok' : 'bad'}`;
      fb.textContent = ok ? '정답!' : `오답 → ${student.number}. ${student.name}`;
      await persistCurrent();
      setTimeout(() => {
        q.index += 1;
        renderQuizQuestion();
      }, ok ? 550 : 1000);
    };
  });
}

function renderMatching() {
  // matching uses a batch of up to 4 from remaining queue slice
  const q = state.quiz;
  const batch = q.queue.slice(q.index, q.index + 4);
  if (batch.length < 2) return null;
  q.matchState = {
    batch,
    selectedName: null,
    selectedPhoto: null,
    matched: new Set(),
    names: shuffle(batch.map((s) => s.id)),
    photos: shuffle(batch.map((s) => s.id)),
  };
  const ms = q.matchState;
  return `
    <p style="text-align:center;color:var(--muted);margin-bottom:14px;font-size:13px">같은 학생의 이름과 사진을 차례로 고르세요</p>
    <div class="match-board">
      <div class="match-col" id="match-names">
        ${ms.names
          .map((id) => {
            const st = batch.find((s) => s.id === id);
            return `<button class="match-item" data-match-name="${id}">${st.number}. ${escapeHtml(st.name)}</button>`;
          })
          .join('')}
      </div>
      <div class="match-col" id="match-photos">
        ${ms.photos
          .map((id) => {
            const st = batch.find((s) => s.id === id);
            return `<button class="match-item" data-match-photo="${id}"><img class="avatar choice" src="${st.photo}" alt=""></button>`;
          })
          .join('')}
      </div>
    </div>
    <div class="feedback" id="feedback"></div>`;
}

function bindMatching() {
  const q = state.quiz;
  const ms = q.matchState;
  if (!ms) return;

  const sync = () => {
    $$('[data-match-name]').forEach((el) => {
      const id = el.dataset.matchName;
      el.classList.toggle('selected', ms.selectedName === id);
      el.classList.toggle('matched', ms.matched.has(id));
    });
    $$('[data-match-photo]').forEach((el) => {
      const id = el.dataset.matchPhoto;
      el.classList.toggle('selected', ms.selectedPhoto === id);
      el.classList.toggle('matched', ms.matched.has(id));
    });
  };

  const tryMatch = async () => {
    if (!ms.selectedName || !ms.selectedPhoto) return;
    const ok = ms.selectedName === ms.selectedPhoto;
    const student = ms.batch.find((s) => s.id === ms.selectedName);
    recordAnswer(student, ok);
    q.answered += 1;
    if (ok) {
      q.correct += 1;
      ms.matched.add(ms.selectedName);
      $('#feedback').className = 'feedback ok';
      $('#feedback').textContent = '짝 맞춤!';
    } else {
      $('#feedback').className = 'feedback bad';
      $('#feedback').textContent = '다시 시도!';
    }
    ms.selectedName = null;
    ms.selectedPhoto = null;
    await persistCurrent();
    sync();

    if (ms.matched.size === ms.batch.length) {
      setTimeout(() => {
        q.index += ms.batch.length;
        renderQuizQuestion();
      }, 600);
    }
  };

  $$('[data-match-name]').forEach((el) => {
    el.onclick = () => {
      if (ms.matched.has(el.dataset.matchName)) return;
      ms.selectedName = el.dataset.matchName;
      sync();
      tryMatch();
    };
  });
  $$('[data-match-photo]').forEach((el) => {
    el.onclick = () => {
      if (ms.matched.has(el.dataset.matchPhoto)) return;
      ms.selectedPhoto = el.dataset.matchPhoto;
      sync();
      tryMatch();
    };
  });
}

async function finishQuiz() {
  const q = state.quiz;
  const total = q.answered || q.queue.length;
  const ratio = total ? q.correct / Math.max(q.answered, 1) : 0;

  await addSession({
    classId: state.current.id,
    mode: q.modeId,
    correct: q.correct,
    answered: q.answered,
    total: q.queue.length,
  });
  await persistCurrent();

  $('#quiz-stage').innerHTML = `
    <div class="result-box">
      <p>퀴즈 완료</p>
      <div class="score">${q.correct}<span style="font-size:24px;color:var(--muted)"> / ${q.answered}</span></div>
      <p style="color:var(--muted);margin-bottom:18px">정확도 ${pct(ratio)} · ${MODES[q.modeId]?.label || ''}</p>
      <div class="toolbar" style="justify-content:center">
        <button class="btn btn-secondary" id="again-same" style="background:#e7efee;color:var(--ink)">같은 모드 다시</button>
        <button class="btn btn-primary" id="back-hub">학급으로</button>
      </div>
    </div>`;
  $('#quiz-progress-bar').style.width = '100%';
  $('#again-same').onclick = () => startQuiz(q.modeId);
  $('#back-hub').onclick = () => {
    state.tab = 'stats';
    renderClass();
  };
}

async function persistCurrent() {
  if (!state.current) return;
  await saveClass(state.current);
}

/* -------------------- Import / Edit -------------------- */

function openImportModal() {
  $('#import-modal').classList.add('open');
  $('#import-status').textContent = '';
}

function closeImportModal() {
  $('#import-modal').classList.remove('open');
  $('#import-file').value = '';
}

async function handleImportFile(file) {
  if (!file) return;
  const status = $('#import-status');
  status.textContent = '엑셀 분석 중… (사진 매칭)';
  try {
    const cls = await importNameRosterXlsx(file);
    // 같은 이름 학급이 있으면 덮어쓸지 새 학급으로 둘지
    await saveClass(cls);
    await refreshClasses();
    closeImportModal();
    toast(`${cls.students.length}명 학급을 저장했습니다.`);
    openClass(cls.id);
  } catch (err) {
    console.error(err);
    status.textContent = err.message || '가져오기에 실패했습니다.';
  }
}

function openEditClassModal() {
  const c = state.current;
  $('#edit-class-modal').classList.add('open');
  $('#edit-name').value = c.name || '';
  $('#edit-school').value = c.school || '';
  $('#edit-teacher').value = c.teacher || '';
  $('#edit-grade').value = c.grade ?? '';
  $('#edit-classnum').value = c.classNum ?? '';
}

function openEditStudentModal(studentId) {
  const st = state.current.students.find((s) => s.id === studentId);
  if (!st) return;
  $('#edit-student-modal').classList.add('open');
  $('#edit-stu-id').value = st.id;
  $('#edit-stu-number').value = st.number;
  $('#edit-stu-name').value = st.name;
  $('#edit-stu-preview').src = st.photo || '';
  $('#edit-stu-preview').classList.toggle('hidden', !st.photo);
  $('#edit-stu-photo').value = '';
}

function openManualClassModal() {
  $('#manual-modal').classList.add('open');
  $('#manual-name').value = '';
  $('#manual-school').value = '';
  $('#manual-teacher').value = '';
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function bindEvents() {
  $('#btn-import').onclick = openImportModal;
  $('#btn-manual').onclick = openManualClassModal;
  $('#btn-back-home').onclick = async () => {
    state.current = null;
    await refreshClasses();
  };
  $('#btn-back-class').onclick = () => renderClass();

  $('#class-grid').onclick = (e) => {
    const btn = e.target.closest('[data-open]');
    if (btn) openClass(btn.dataset.open);
  };

  $$('.tab').forEach((t) => {
    t.onclick = () => {
      state.tab = t.dataset.tab;
      renderClass();
    };
  });

  $('#mode-grid').onclick = (e) => {
    const btn = e.target.closest('[data-mode]');
    if (btn) startQuiz(btn.dataset.mode);
  };

  $('#student-tbody').onclick = (e) => {
    const btn = e.target.closest('[data-edit-student]');
    if (btn) openEditStudentModal(btn.dataset.editStudent);
  };

  $('#btn-edit-class').onclick = openEditClassModal;
  $('#btn-add-student').onclick = () => {
    const st = {
      id: uid('stu'),
      number: (state.current.students.reduce((m, s) => Math.max(m, s.number || 0), 0) || 0) + 1,
      name: '새 학생',
      photo: null,
      stats: emptyStats(),
    };
    state.current.students.push(st);
    openEditStudentModal(st.id);
  };

  $('#btn-delete-class').onclick = async () => {
    if (!confirm('이 학급과 퀴즈 기록을 삭제할까요?')) return;
    await deleteClass(state.current.id);
    state.current = null;
    toast('학급을 삭제했습니다.');
    await refreshClasses();
  };

  // import modal
  $('#import-close').onclick = closeImportModal;
  $('#import-cancel').onclick = closeImportModal;
  const dz = $('#dropzone');
  dz.onclick = () => $('#import-file').click();
  dz.ondragover = (e) => {
    e.preventDefault();
    dz.classList.add('dragover');
  };
  dz.ondragleave = () => dz.classList.remove('dragover');
  dz.ondrop = (e) => {
    e.preventDefault();
    dz.classList.remove('dragover');
    const file = e.dataTransfer.files?.[0];
    if (file) handleImportFile(file);
  };
  $('#import-file').onchange = (e) => handleImportFile(e.target.files?.[0]);

  // edit class
  $('#edit-class-close').onclick = () => $('#edit-class-modal').classList.remove('open');
  $('#edit-class-cancel').onclick = () => $('#edit-class-modal').classList.remove('open');
  $('#edit-class-save').onclick = async () => {
    const c = state.current;
    c.name = $('#edit-name').value.trim() || c.name;
    c.school = $('#edit-school').value.trim();
    c.teacher = $('#edit-teacher').value.trim();
    c.grade = parseInt($('#edit-grade').value, 10) || c.grade;
    c.classNum = parseInt($('#edit-classnum').value, 10) || c.classNum;
    await persistCurrent();
    $('#edit-class-modal').classList.remove('open');
    toast('학급 정보를 저장했습니다.');
    renderClass();
  };

  // edit student
  $('#edit-student-close').onclick = () => $('#edit-student-modal').classList.remove('open');
  $('#edit-student-cancel').onclick = () => $('#edit-student-modal').classList.remove('open');
  $('#edit-stu-photo').onchange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = await fileToDataUrl(file);
    $('#edit-stu-preview').src = url;
    $('#edit-stu-preview').classList.remove('hidden');
    $('#edit-stu-preview').dataset.pending = url;
  };
  $('#edit-student-save').onclick = async () => {
    const id = $('#edit-stu-id').value;
    const st = state.current.students.find((s) => s.id === id);
    if (!st) return;
    st.number = parseInt($('#edit-stu-number').value, 10) || st.number;
    st.name = $('#edit-stu-name').value.trim() || st.name;
    if ($('#edit-stu-preview').dataset.pending) {
      st.photo = $('#edit-stu-preview').dataset.pending;
      delete $('#edit-stu-preview').dataset.pending;
    }
    await persistCurrent();
    $('#edit-student-modal').classList.remove('open');
    toast('학생 정보를 저장했습니다.');
    state.tab = 'students';
    renderClass();
  };
  $('#edit-student-delete').onclick = async () => {
    const id = $('#edit-stu-id').value;
    if (!confirm('이 학생을 삭제할까요?')) return;
    state.current.students = state.current.students.filter((s) => s.id !== id);
    await persistCurrent();
    $('#edit-student-modal').classList.remove('open');
    renderClass();
  };

  // manual class
  $('#manual-close').onclick = () => $('#manual-modal').classList.remove('open');
  $('#manual-cancel').onclick = () => $('#manual-modal').classList.remove('open');
  $('#manual-save').onclick = async () => {
    const name = $('#manual-name').value.trim();
    if (!name) {
      toast('학급 이름을 입력하세요.');
      return;
    }
    const cls = {
      id: uid('class'),
      name,
      school: $('#manual-school').value.trim(),
      teacher: $('#manual-teacher').value.trim(),
      subject: '',
      grade: null,
      classNum: null,
      dateLabel: '',
      students: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await saveClass(cls);
    $('#manual-modal').classList.remove('open');
    await refreshClasses();
    openClass(cls.id);
  };

  $('#btn-weak-quiz').onclick = () => startQuiz('weakOnly');
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

async function init() {
  bindEvents();
  await refreshClasses();
}

init().catch((err) => {
  console.error(err);
  toast('초기화 실패');
});
