let booted = false;

const SUB = {
  home: "학생의 얼굴과 이름을 연결하고, 자연스럽게 기억하세요.",
  class: "퀴즈 · 명단 · 학습 현황을 탭에서 골라 주세요.",
  quiz: "천천히 익혀 봐요. 틀릴수록 복습에 더 자주 나와요.",
};

const state = {
  screen: "home",
  tab: "퀴즈",
  pack: null,
  quiz: null,
  flipped: false,
  locked: false,
  homeClasses: [],
  homeOverview: null,
  homeModes: [],
  classOrderEditing: false,
  classQuizSelecting: false,
  selectedClassIds: new Set(),
  overviewPack: null,
};

const $ = (id) => document.getElementById(id);

function api() {
  if (!window.pywebview || !window.pywebview.api) {
    throw new Error("앱 연결을 기다리는 중입니다.");
  }
  return window.pywebview.api;
}

function toast(msg, err = false) {
  const el = document.createElement("div");
  el.className = `toast${err ? " err" : ""}`;
  el.textContent = msg;
  $("toasts").appendChild(el);
  setTimeout(() => el.remove(), 2800);
}

function busy(on) {
  $("busy").hidden = !on;
}

function showScreen(name) {
  state.screen = name;
  document.body.dataset.screen = name;
  document.querySelectorAll(".screen").forEach((el) => {
    el.classList.toggle("active", el.dataset.screen === name);
  });
  $("appSub").textContent = SUB[name] || SUB.home;
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function avatar(url) {
  if (url) return `<img class="avatar" src="${url}" alt="" />`;
  return `<div class="ph">없음</div>`;
}

function emptyClassArt() {
  return `
    <svg class="empty-art" viewBox="0 0 260 150" aria-hidden="true">
      <ellipse cx="130" cy="135" rx="92" ry="10" fill="#d8f5e7"/>
      <rect x="72" y="36" width="116" height="91" rx="18" fill="#fff" stroke="#b8dfcc" stroke-width="3"/>
      <circle cx="108" cy="73" r="18" fill="#ffd5c8"/>
      <path d="M84 116c3-24 12-35 24-35s22 11 25 35H84Z" fill="#ff8f6b"/>
      <circle cx="157" cy="67" r="14" fill="#ccecf8"/>
      <path d="M139 111c2-21 9-31 18-31 10 0 18 10 20 31h-38Z" fill="#4ba3c7"/>
      <path d="m50 42 4 9 9 4-9 4-4 9-4-9-9-4 9-4 4-9Z" fill="#f7c94a"/>
      <path d="M194 24c16-6 25 2 20 15-4 10-14 14-24 9 0-10 1-18 4-24Z" fill="#79d6a8"/>
    </svg>`;
}

function modeIcon(mode) {
  return {
    photoToName: "🖼️",
    nameToPhoto: "🔎",
    practice: "🃏",
    typeName: "✍️",
    weakOnly: "🎯",
    dueReview: "🔔",
  }[mode] || "✨";
}

function summaryInfographic(summary) {
  const pct = summary.accuracy == null ? 0 : Math.round(summary.accuracy * 100);
  const label = summary.accuracy == null ? "시작 전" : `${pct}%`;
  return `
    <div class="summary-board">
      <div class="accuracy-ring" style="--value:${pct}">
        <div><strong>${escapeHtml(label)}</strong><span>정확도</span></div>
      </div>
      <div class="summary-stat mint">
        <span class="summary-icon">👥</span>
        <div><strong>${summary.total}</strong><span>학생</span></div>
      </div>
      <div class="summary-stat coral">
        <span class="summary-icon">🎯</span>
        <div><strong>${summary.weak}</strong><span>약함</span></div>
      </div>
      <div class="summary-stat sky">
        <span class="summary-icon">🔔</span>
        <div><strong>${summary.due}</strong><span>복습</span></div>
      </div>
    </div>`;
}

function homeOverviewInfographic(overview) {
  if (!overview) return "";
  const label = overview.attempts ? overview.accuracyLabel : "시작 전";
  return `
    <section class="home-overview" aria-label="전체 학급 종합 분석">
      <div class="overview-copy">
        <span class="overview-kicker">TOTAL INSIGHT</span>
        <h3>종합 분석</h3>
        <p>${overview.classCount}개 학급의 학습 흐름을 한눈에 확인하세요.</p>
      </div>
      <div class="overview-ring" style="--value:${overview.accuracyPercent || 0}">
        <div><strong>${escapeHtml(label)}</strong><span>전체 정확도</span></div>
      </div>
      <div class="overview-metrics">
        <div class="overview-metric"><span>🏫</span><strong>${overview.classCount}</strong><small>학급</small></div>
        <button class="overview-metric overview-quiz" type="button" data-overview-group="students" aria-label="전체 학생 명단 보기">
          <span>👥</span><strong>${overview.studentCount}</strong><small>학생</small>
        </button>
        <button class="overview-metric overview-quiz coral" type="button" data-overview-group="weak" aria-label="약한 학생 명단 보기">
          <span>🎯</span><strong>${overview.weak}</strong><small>약함</small>
        </button>
        <button class="overview-metric overview-quiz sky" type="button" data-overview-group="due" aria-label="복습 학생 명단 보기">
          <span>🔔</span><strong>${overview.due}</strong><small>복습</small>
        </button>
        <button class="overview-metric overview-quiz gold" type="button" data-overview-group="mastered" aria-label="잘 맞춘 학생 명단 보기">
          <span>⭐</span><strong>${overview.mastered || 0}</strong><small>잘 맞춤</small>
        </button>
      </div>
    </section>`;
}

async function call(name, ...args) {
  const fn = api()[name];
  return await fn.apply(api(), args);
}

function closeModal() {
  $("modalRoot").hidden = true;
  $("modalBox").innerHTML = "";
}

function openModal(html) {
  $("modalBox").innerHTML = html;
  $("modalRoot").hidden = false;
  const first = $("modalBox").querySelector("input, button");
  if (first) first.focus();
}

function confirmModal({ title, message, okText = "확인", danger = false }) {
  return new Promise((resolve) => {
    openModal(`
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(message)}</p>
      <div class="modal-actions">
        <button class="btn btn-sky btn-sm" type="button" data-act="no">취소</button>
        <button class="btn ${danger ? "btn-peach" : "btn-accent"} btn-sm" type="button" data-act="yes">${escapeHtml(okText)}</button>
      </div>
    `);
    $("modalBox").onclick = (e) => {
      const act = e.target.dataset.act;
      if (!act) return;
      closeModal();
      resolve(act === "yes");
    };
  });
}

async function loadHome() {
  busy(true);
  try {
    const res = await call("home");
    state.classOrderEditing = false;
    state.classQuizSelecting = false;
    state.selectedClassIds.clear();
    applyHomeData(res);
    showScreen("home");
  } catch (e) {
    toast(String(e.message || e), true);
  } finally {
    busy(false);
  }
}

function applyHomeData(res) {
  state.overviewPack = null;
  state.homeOverview = res.overview || null;
  state.homeModes = res.modes || state.homeModes;
  renderHome(res.classes || []);
}

function classCard(c, index, editing, selecting) {
  const selected = state.selectedClassIds.has(c.id);
  const tag = editing ? "div" : "button";
  const actionAttrs = editing
    ? `data-class-id="${escapeHtml(c.id)}" draggable="true"`
    : selecting
      ? `type="button" data-select-class="${escapeHtml(c.id)}"`
      : `type="button" data-open="${escapeHtml(c.id)}"`;
  return `
    <${tag} class="card class-card tone-${index % 3}${selected ? " selected" : ""}" ${actionAttrs}>
      ${editing ? `<button class="class-drag-handle" type="button" tabindex="-1" aria-label="${escapeHtml(c.name)} 순서 이동">⠿</button>` : ""}
      ${selecting ? `<span class="class-select-check" aria-hidden="true">${selected ? "✓" : ""}</span>` : ""}
      <div class="class-card-head">
        <div>
          <span class="class-label">CLASS</span>
          <h3>${escapeHtml(c.name || "학급")}</h3>
          <p>${escapeHtml(c.school || "학교 미입력")} · ${c.studentCount || 0}명${c.teacher ? " · " + escapeHtml(c.teacher) : ""}</p>
        </div>
        <div class="class-clip" aria-hidden="true"><span>👩‍🏫</span><i>✦</i></div>
      </div>
      <div class="class-insights">
        <div class="mini-ring" style="--value:${c.accuracyPercent || 0}">
          <span>${c.attempts ? escapeHtml(c.accuracyLabel) : "시작 전"}</span>
        </div>
        <div class="mini-stat"><span>🎯</span><strong>${c.weak || 0}</strong><small>약함</small></div>
        <div class="mini-stat"><span>🔔</span><strong>${c.due || 0}</strong><small>복습</small></div>
      </div>
      ${
        editing
          ? `<div class="go class-edit-footer">
               <span>끌어서 순서 변경 ↕</span>
               <button class="class-delete-btn" type="button" data-delete-class="${escapeHtml(c.id)}" data-class-name="${escapeHtml(c.name || "학급")}">삭제</button>
             </div>`
          : selecting
            ? `<div class="go">${selected ? "퀴즈에 포함됨" : "눌러서 선택"} <span>${selected ? "✓" : "+"}</span></div>`
            : `<div class="go">학급 열기 <span>→</span></div>`
      }
    </${tag}>`;
}

function renderHome(classes) {
  state.homeClasses = classes;
  const root = $("screenHome");
  if (!classes.length) {
    root.innerHTML = `
      <div class="row-between">
        <h2 class="h2">내 학급</h2>
        <span class="muted">이 컴퓨터에 자동 저장됩니다</span>
      </div>
      <div class="empty">
        ${emptyClassArt()}
        <h3>아직 학급이 없어요</h3>
        <p>오른쪽 위 ‘엑셀 파일 불러오기’로 가져오거나,<br/>엑셀 파일을 창에 끌어다 놓아도 됩니다</p>
      </div>
    `;
    return;
  }
  const editing = state.classOrderEditing;
  const selecting = state.classQuizSelecting;
  const selectedCount = state.selectedClassIds.size;
  root.innerHTML = `
    ${homeOverviewInfographic(state.homeOverview)}
    <div class="row-between">
      <div>
        <h2 class="h2">내 학급</h2>
        <span class="muted">${
          editing
            ? "카드를 끌어 순서를 바꾸거나 필요 없는 학급을 삭제하세요."
            : selecting
              ? "함께 퀴즈를 풀 학급을 선택하세요."
              : "학년·반 오름차순으로 정렬됩니다."
        }</span>
      </div>
      <div class="class-order-actions">
        ${
          editing
            ? `<button class="btn btn-sky btn-sm" type="button" id="btnAscending">오름차순</button>
               <button class="btn btn-sky btn-sm" type="button" id="btnCancelClassOrder">취소</button>
               <button class="btn btn-accent btn-sm" type="button" id="btnSaveClassOrder">순서 저장</button>`
            : selecting
              ? `<button class="btn btn-sky btn-sm" type="button" id="btnCancelClassQuiz">취소</button>
                 <button class="btn btn-accent btn-sm" type="button" id="btnChooseQuizMode" ${selectedCount ? "" : "disabled"}>선택 완료 (${selectedCount})</button>`
              : `<button class="btn btn-accent btn-sm" type="button" id="btnSelectClassQuiz">✨ 학급 선택 퀴즈</button>
                 <button class="btn btn-sky btn-sm" type="button" id="btnEditClassOrder">학급 편집</button>`
        }
      </div>
    </div>
    <div class="grid-2 class-grid${editing ? " ordering" : ""}${selecting ? " selecting" : ""}" id="classGrid">
      ${classes.map((c, index) => classCard(c, index, editing, selecting)).join("")}
    </div>
  `;
  root.querySelectorAll("[data-overview-group]").forEach((button) => {
    button.onclick = () => openOverviewGroup(button.dataset.overviewGroup);
  });
  if (editing) {
    $("btnAscending").onclick = resetClassOrder;
    $("btnCancelClassOrder").onclick = () => {
      state.classOrderEditing = false;
      renderHome(state.homeClasses);
    };
    $("btnSaveClassOrder").onclick = saveClassOrder;
    bindClassOrder();
    root.querySelectorAll("[data-delete-class]").forEach((btn) => {
      btn.onmousedown = (e) => e.stopPropagation();
      btn.ondragstart = (e) => e.preventDefault();
      btn.onclick = (e) => {
        e.stopPropagation();
        deleteClassFromHome(btn.dataset.deleteClass, btn.dataset.className);
      };
    });
  } else if (selecting) {
    $("btnCancelClassQuiz").onclick = () => {
      state.classQuizSelecting = false;
      state.selectedClassIds.clear();
      renderHome(state.homeClasses);
    };
    $("btnChooseQuizMode").onclick = openMultiQuizModeModal;
    root.querySelectorAll("[data-select-class]").forEach((card) => {
      card.onclick = () => {
        const classId = card.dataset.selectClass;
        if (state.selectedClassIds.has(classId)) state.selectedClassIds.delete(classId);
        else state.selectedClassIds.add(classId);
        renderHome(state.homeClasses);
      };
    });
  } else {
    $("btnSelectClassQuiz").onclick = () => {
      state.classQuizSelecting = true;
      state.selectedClassIds.clear();
      renderHome(state.homeClasses);
    };
    $("btnEditClassOrder").onclick = () => {
      state.classOrderEditing = true;
      renderHome(state.homeClasses);
    };
    root.querySelectorAll("[data-open]").forEach((btn) => {
      btn.onclick = () => openClass(btn.dataset.open);
    });
  }
}

async function deleteClassFromHome(classId, className) {
  const yes = await confirmModal({
    title: "학급 삭제",
    message: `‘${className}’ 학급을 삭제할까요? 학생 사진과 학습 기록도 이 컴퓨터에서 함께 삭제되며 복구할 수 없습니다.`,
    okText: "학급 삭제",
    danger: true,
  });
  if (!yes) return;
  busy(true);
  try {
    const res = await call("delete_class_by_id", classId);
    if (!res.ok) return toast(res.error, true);
    state.classOrderEditing = (res.classes || []).length > 0;
    applyHomeData(res);
    toast("학급과 저장된 자료를 삭제했어요.");
  } finally {
    busy(false);
  }
}

function bindClassOrder() {
  const grid = $("classGrid");
  let dragged = null;
  grid.querySelectorAll("[data-class-id]").forEach((card) => {
    card.ondragstart = (e) => {
      dragged = card;
      card.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", card.dataset.classId);
    };
    card.ondragover = (e) => {
      e.preventDefault();
      if (!dragged || dragged === card) return;
      const rect = card.getBoundingClientRect();
      const nearSameRow = Math.abs(e.clientY - (rect.top + rect.height / 2)) < rect.height / 2;
      const before = nearSameRow
        ? e.clientX < rect.left + rect.width / 2
        : e.clientY < rect.top + rect.height / 2;
      grid.insertBefore(dragged, before ? card : card.nextSibling);
    };
    card.ondragend = () => {
      card.classList.remove("dragging");
      dragged = null;
    };
    card.ondrop = (e) => e.preventDefault();
  });
}

async function saveClassOrder() {
  const ids = [...$("classGrid").querySelectorAll("[data-class-id]")].map(
    (card) => card.dataset.classId
  );
  busy(true);
  try {
    const res = await call("reorder_classes", ids);
    if (!res.ok) return toast(res.error, true);
    state.classOrderEditing = false;
    applyHomeData(res);
    toast("학급 순서를 저장했어요.");
  } finally {
    busy(false);
  }
}

async function resetClassOrder() {
  busy(true);
  try {
    const res = await call("reset_class_order");
    if (!res.ok) return toast(res.error, true);
    state.classOrderEditing = false;
    applyHomeData(res);
    toast("학년·반 오름차순으로 정리했어요.");
  } finally {
    busy(false);
  }
}

function openMultiQuizModeModal() {
  const count = state.selectedClassIds.size;
  if (!count) return toast("퀴즈에 포함할 학급을 선택하세요.", true);
  openModal(`
    <h3>통합 퀴즈 방식 선택</h3>
    <p>${count}개 학급의 사진 있는 학생을 섞어서 출제합니다.</p>
    <div class="multi-mode-list">
      ${(state.homeModes || [])
        .map(
          (mode) => `
        <button class="multi-mode" type="button" data-multi-mode="${escapeHtml(mode.id)}">
          <span class="mode-icon-inline">${modeIcon(mode.id)}</span>
          <span><strong>${escapeHtml(mode.title)}</strong><small>${escapeHtml(mode.desc)}</small></span>
        </button>`
        )
        .join("")}
    </div>
    <div class="modal-actions">
      <button class="btn btn-sky btn-sm" type="button" data-act="no">취소</button>
    </div>
  `);
  $("modalBox").onclick = (e) => {
    if (e.target.closest("[data-act=no]")) return closeModal();
    const mode = e.target.closest("[data-multi-mode]")?.dataset.multiMode;
    if (!mode) return;
    closeModal();
    startMultiClassQuiz(mode);
  };
}

async function startMultiClassQuiz(mode) {
  const classIds = [...state.selectedClassIds];
  busy(true);
  try {
    const res = await call("start_multi_class_quiz", classIds, mode);
    if (!res.ok) return toast(res.error, true);
    state.quiz = res.quiz;
    state.flipped = false;
    state.locked = false;
    state.classQuizSelecting = false;
    renderQuiz();
    showScreen("quiz");
  } finally {
    busy(false);
  }
}

async function startOverviewQuiz(group, mode) {
  busy(true);
  try {
    const res = await call("start_overview_quiz", group, mode);
    if (!res.ok) return toast(res.error, true);
    state.quiz = res.quiz;
    state.flipped = false;
    state.locked = false;
    renderQuiz();
    showScreen("quiz");
  } finally {
    busy(false);
  }
}

async function openOverviewGroup(group) {
  busy(true);
  try {
    const res = await call("open_overview_group", group);
    if (!res.ok) return toast(res.error, true);
    state.overviewPack = res;
    renderOverviewGroup();
    showScreen("home");
  } finally {
    busy(false);
  }
}

function overviewStudentRow(st) {
  const streak = st.stats?.streak || 0;
  const extras = [
    st.className ? escapeHtml(st.className) : "",
    `정답률 ${escapeHtml(st.accuracyLabel)}`,
    streak ? `연속 ${streak}회` : "",
  ].filter(Boolean);
  return `
    <div class="student overview-student">
      ${avatar(st.photoUrl)}
      <div class="num">${st.number ?? ""}번</div>
      <div class="name">${escapeHtml(st.name)}</div>
      <div class="muted">${extras.join(" · ")}</div>
    </div>`;
}

function renderOverviewGroup() {
  const p = state.overviewPack;
  if (!p) return;
  const root = $("screenHome");
  const students = p.students || [];
  const canQuiz = !!p.canQuiz;
  const needChoices = !!p.needChoices;
  root.innerHTML = `
    <div class="row-between">
      <div>
        <button class="btn btn-ghost btn-sm" type="button" id="btnBackOverview">← 종합 분석</button>
        <h2 class="h2" style="margin-top:10px">${escapeHtml(p.title)}</h2>
        <p class="muted">${escapeHtml(p.desc)}</p>
      </div>
      <span class="chip${p.group === "mastered" ? " gold" : p.group === "weak" ? " peach" : p.group === "due" ? " sky" : ""}">${students.length}명</span>
    </div>
    <div class="overview-group-board">
      <h3>퀴즈 방식</h3>
      <p class="muted">${
        canQuiz
          ? `사진이 있는 ${p.quizableCount}명으로 게임을 진행할 수 있습니다.`
          : "이 명단에는 퀴즈를 진행할 사진 있는 학생이 없습니다."
      }</p>
      <div class="grid-2">
        ${(p.modes || [])
          .map((m) => {
            const choiceMode = m.id === "photoToName" || m.id === "nameToPhoto";
            const disabled = !canQuiz || (choiceMode && !needChoices);
            return `
          <button class="card mode-card${disabled ? " is-disabled" : ""}" type="button" data-overview-mode="${escapeHtml(m.id)}" ${disabled ? "disabled" : ""}>
            <span class="mode-icon" aria-hidden="true">${modeIcon(m.id)}</span>
            <h3>${escapeHtml(m.title)}</h3>
            <p>${escapeHtml(m.desc)}</p>
          </button>`;
          })
          .join("")}
      </div>
    </div>
    <div class="roster-toolbar">
      <div>
        <h3>학생 명단 ${students.length}명</h3>
        <p>학급 이름과 함께 표시됩니다.</p>
      </div>
    </div>
    <div class="student-list">
      ${
        students.length
          ? students.map(overviewStudentRow).join("")
          : `<div class="empty overview-empty"><h3>해당하는 학생이 없어요</h3><p>퀴즈를 풀면 여기에 학생들이 모입니다.</p></div>`
      }
    </div>
  `;
  $("btnBackOverview").onclick = () => {
    state.overviewPack = null;
    renderHome(state.homeClasses);
  };
  root.querySelectorAll("[data-overview-mode]").forEach((btn) => {
    btn.onclick = () => startOverviewQuiz(p.group, btn.dataset.overviewMode);
  });
}

async function openClass(id) {
  busy(true);
  try {
    const res = await call("open_class", id);
    if (!res.ok) return toast(res.error, true);
    state.pack = res;
    state.tab = "퀴즈";
    renderClass();
    showScreen("class");
  } finally {
    busy(false);
  }
}

function applyPack(res) {
  if (!res.ok) {
    toast(res.error || "처리하지 못했습니다.", true);
    return false;
  }
  state.pack = res;
  renderClass();
  showScreen("class");
  return true;
}

function renderClass() {
  const p = state.pack;
  if (!p) return;
  const c = p.class;
  const s = p.summary;
  const root = $("screenClass");
  root.innerHTML = `
    <div class="row-between">
      <div>
        <button class="btn btn-ghost btn-sm" type="button" id="btnBackHome">← 학급 목록</button>
        <h2 class="h2" style="margin-top:10px">${escapeHtml(c.name)}</h2>
        <p class="muted">${escapeHtml(c.subtitle || "")}</p>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-sky btn-sm" type="button" id="btnEditClass">학급 편집</button>
        <button class="btn btn-danger btn-sm" type="button" id="btnDelClass">삭제</button>
      </div>
    </div>
    <div class="tabs">
      ${["퀴즈", "학생 명단", "학습 현황"]
        .map((t) => `<button class="tab${state.tab === t ? " on" : ""}" type="button" data-tab="${t}">${t}</button>`)
        .join("")}
    </div>
    <div id="classBody"></div>
  `;
  $("btnBackHome").onclick = loadHome;
  $("btnEditClass").onclick = editClassModal;
  $("btnDelClass").onclick = deleteClass;
  root.querySelectorAll("[data-tab]").forEach((btn) => {
    btn.onclick = () => {
      state.tab = btn.dataset.tab;
      renderClass();
    };
  });
  const body = $("classBody");
  if (state.tab === "퀴즈") {
    body.innerHTML = `
      ${summaryInfographic(s)}
      <div class="grid-2">
        ${(p.modes || [])
          .map(
            (m) => `
          <button class="card mode-card" type="button" data-mode="${escapeHtml(m.id)}">
            <span class="mode-icon" aria-hidden="true">${modeIcon(m.id)}</span>
            <h3>${escapeHtml(m.title)}</h3>
            <p>${escapeHtml(m.desc)}</p>
          </button>`
          )
          .join("")}
      </div>
    `;
    body.querySelectorAll("[data-mode]").forEach((btn) => {
      btn.onclick = () => startQuiz(btn.dataset.mode);
    });
  } else if (state.tab === "학생 명단") {
    body.innerHTML = `
      <div class="roster-toolbar">
        <div>
          <h3>학생 ${p.students?.length || 0}명</h3>
          <p>학생은 이름 오름차순으로 표시됩니다.</p>
        </div>
        <div class="roster-actions">
          <button class="btn btn-accent btn-sm" type="button" id="btnAddStu">+ 학생 추가</button>
        </div>
      </div>
      <div class="student-list" id="studentList">
        ${(p.students || [])
          .map(
            (st) => `
          <div class="student" data-student-id="${escapeHtml(st.id)}">
            ${avatar(st.photoUrl)}
            <div class="num">${st.number ?? ""}번</div>
            <div class="name">${escapeHtml(st.name)}</div>
            <div class="muted">정답률 ${escapeHtml(st.accuracyLabel)} · 오답 ${st.stats?.wrong ?? 0}</div>
            <button class="btn btn-sky btn-sm" type="button" data-edit="${escapeHtml(st.id)}">편집</button>
          </div>`
          )
          .join("") || `<p class="muted">아직 학생이 없습니다.</p>`}
      </div>
    `;
    $("btnAddStu").onclick = addStudentModal;
    body.querySelectorAll("[data-edit]").forEach((btn) => {
      btn.onclick = () => editStudentModal(btn.dataset.edit);
    });
  } else {
    const dueNames = (p.due || []).map((d) => `${d.number}.${d.name}`).join(", ") || "없음";
    body.innerHTML = `
      <p>총 ${s.total}명 · 시도 ${s.attempts} · 정확도 ${escapeHtml(s.accuracyLabel)}</p>
      <h3 style="margin:16px 0 8px">잘 안 외워지는 학생</h3>
      ${
        (p.weak || []).length
          ? p.weak
              .map(
                (st) => `
          <div class="student">
            ${avatar(st.photoUrl)}
            <div class="num">${st.number ?? ""}</div>
            <div class="name">${escapeHtml(st.name)}</div>
            <div class="muted">정답률 ${escapeHtml(st.accuracyLabel)} · 오답 ${st.stats?.wrong ?? 0}</div>
            <span></span>
          </div>`
              )
              .join("")
          : `<p class="muted">아직 약점 데이터가 없어요. 퀴즈를 풀어보세요!</p>`
      }
      <h3 style="margin:18px 0 8px">복습 대기 ${(p.due || []).length}명</h3>
      <p class="muted">${escapeHtml(dueNames)}</p>
      <button class="btn btn-peach" type="button" id="btnWeakQuiz" style="margin-top:16px">약한 학생만 퀴즈</button>
    `;
    $("btnWeakQuiz").onclick = () => startQuiz("weakOnly");
  }
}

async function editClassModal() {
  const c = state.pack.class;
  openModal(`
    <h3>학급 편집</h3>
    <label class="field"><span>학급 이름</span><input id="fName" value="${escapeHtml(c.name)}" /></label>
    <label class="field"><span>학교</span><input id="fSchool" value="${escapeHtml(c.school)}" /></label>
    <label class="field"><span>담당 교사</span><input id="fTeacher" value="${escapeHtml(c.teacher)}" /></label>
    <div class="modal-actions">
      <button class="btn btn-sky btn-sm" type="button" data-act="no">취소</button>
      <button class="btn btn-accent btn-sm" type="button" data-act="yes">저장</button>
    </div>
  `);
  $("modalBox").onclick = async (e) => {
    if (e.target.dataset.act === "no") return closeModal();
    if (e.target.dataset.act !== "yes") return;
    const res = await call(
      "save_class_meta",
      $("fName").value,
      $("fSchool").value,
      $("fTeacher").value
    );
    closeModal();
    applyPack(res);
  };
}

async function deleteClass() {
  const yes = await confirmModal({
    title: "삭제",
    message: "이 학급을 삭제할까요?",
    okText: "삭제",
    danger: true,
  });
  if (!yes) return;
  const res = await call("delete_class");
  if (!res.ok) return toast(res.error, true);
  applyHomeData(res);
  showScreen("home");
}

async function addStudentModal() {
  await call("clear_pending_photo");
  let preview = "";
  openModal(`
    <h3>학생 추가</h3>
    <label class="field"><span>이름</span><input id="fStuName" placeholder="이름" /></label>
    <div class="photo-pick">
      <div id="stuPreview"><div class="ph">사진</div></div>
      <button class="btn btn-sky btn-sm" type="button" id="btnPickPhoto">사진 선택</button>
    </div>
    <div class="modal-actions">
      <button class="btn btn-sky btn-sm" type="button" data-act="no">취소</button>
      <button class="btn btn-accent btn-sm" type="button" data-act="yes">추가</button>
    </div>
  `);
  $("btnPickPhoto").onclick = async () => {
    const res = await call("pick_image");
    if (res.cancelled) return;
    if (!res.ok) return toast(res.error, true);
    preview = res.photoUrl;
    $("stuPreview").innerHTML = avatar(preview);
  };
  $("modalBox").onclick = async (e) => {
    if (e.target.dataset.act === "no") return closeModal();
    if (e.target.dataset.act !== "yes") return;
    const name = $("fStuName").value;
    closeModal();
    busy(true);
    try {
      const res = await call("add_student", name);
      if (applyPack(res)) {
        state.tab = "학생 명단";
        renderClass();
      }
    } finally {
      busy(false);
    }
  };
}

async function editStudentModal(id) {
  const st = (state.pack.students || []).find((x) => x.id === id);
  if (!st) return;
  await call("clear_pending_photo");
  let changePhoto = false;
  openModal(`
    <h3>학생 편집</h3>
    <label class="field"><span>이름</span><input id="fStuName" value="${escapeHtml(st.name)}" /></label>
    <div class="photo-pick">
      <div id="stuPreview">${avatar(st.photoUrl)}</div>
      <button class="btn btn-sky btn-sm" type="button" id="btnPickPhoto">사진 바꾸기</button>
    </div>
    <div class="modal-actions">
      <button class="btn btn-sky btn-sm" type="button" data-act="no">취소</button>
      <button class="btn btn-accent btn-sm" type="button" data-act="yes">저장</button>
    </div>
  `);
  $("btnPickPhoto").onclick = async () => {
    const res = await call("pick_image");
    if (res.cancelled) return;
    if (!res.ok) return toast(res.error, true);
    changePhoto = true;
    $("stuPreview").innerHTML = avatar(res.photoUrl);
  };
  $("modalBox").onclick = async (e) => {
    if (e.target.dataset.act === "no") return closeModal();
    if (e.target.dataset.act !== "yes") return;
    const name = $("fStuName").value;
    closeModal();
    busy(true);
    try {
      const res = await call("edit_student", id, name, changePhoto);
      if (applyPack(res)) {
        state.tab = "학생 명단";
        renderClass();
      }
    } finally {
      busy(false);
    }
  };
}

function importModal() {
  openModal(`
    <h3>엑셀 명렬표 불러오기</h3>
    <p>나이스에서 받은 학급 사진명렬표를 한 번에 여러 개 선택할 수 있습니다.</p>
    <div class="dropzone" id="modalDrop">여기로 엑셀 파일을 끌어다 놓으세요<br/><span class="muted">클릭해서 여러 파일을 선택해도 됩니다</span></div>
    <div class="modal-actions">
      <button class="btn btn-sky btn-sm" type="button" data-act="no">닫기</button>
    </div>
  `);
  const zone = $("modalDrop");
  zone.onclick = () => pickExcel();
  zone.ondragover = (e) => {
    e.preventDefault();
    zone.classList.add("on");
  };
  zone.ondragleave = () => zone.classList.remove("on");
  zone.ondrop = async (e) => {
    e.preventDefault();
    zone.classList.remove("on");
    const files = [...e.dataTransfer.files].filter((f) => f.name.toLowerCase().endsWith(".xlsx"));
    if (!files.length) return toast("xlsx 파일을 놓아 주세요.", true);
    await importFiles(files);
  };
  $("modalBox").onclick = (e) => {
    if (e.target.dataset.act === "no") closeModal();
  };
}

async function pickExcel() {
  closeModal();
  busy(true);
  try {
    const res = await call("pick_excel");
    if (res.cancelled) return;
    handleImportResult(res);
  } finally {
    busy(false);
  }
}

async function fileToB64(file) {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function handleImportResult(res) {
  if (!res.ok) {
    toast(res.error || "엑셀 파일을 불러오지 못했습니다.", true);
    return;
  }
  const failed = res.failedCount || 0;
  const message = `${res.importedCount}개 학급, 학생 ${res.imported}명을 저장했어요!`;
  toast(failed ? `${message} (${failed}개 파일 실패)` : message, failed > 0);
  if (failed && res.errors?.length) {
    const first = res.errors[0];
    toast(`${first.file}: ${first.error}`, true);
  }
  applyHomeData(res);
  showScreen("home");
}

async function importFiles(files) {
  closeModal();
  busy(true);
  try {
    const payload = [];
    for (const file of files) {
      payload.push({ name: file.name, data: await fileToB64(file) });
    }
    const res = await call("import_excel_files_b64", payload);
    handleImportResult(res);
  } finally {
    busy(false);
  }
}

async function startQuiz(mode) {
  busy(true);
  try {
    const res = await call("start_quiz", mode);
    if (!res.ok) return toast(res.error, true);
    state.quiz = res.quiz;
    state.flipped = false;
    state.locked = false;
    renderQuiz();
    showScreen("quiz");
  } finally {
    busy(false);
  }
}

function restartQuiz(quiz) {
  if (quiz.overviewGroup) {
    return startOverviewQuiz(quiz.overviewGroup, quiz.mode);
  }
  if (quiz.returnTo === "home" && quiz.classIds?.length) {
    state.selectedClassIds = new Set(quiz.classIds);
    return startMultiClassQuiz(quiz.mode);
  }
  return startQuiz(quiz.mode);
}

function renderQuiz() {
  const q = state.quiz;
  const root = $("screenQuiz");
  if (!q) return;
  if (q.done) {
    root.innerHTML = `
      <button class="btn btn-ghost btn-sm" type="button" id="btnQuizBack">← 돌아가기</button>
      <div class="stage" style="margin-top:16px">
        <h2 class="h2" style="margin-top:36px">퀴즈 완료!</h2>
        <div class="done-score">${q.correct} / ${q.answered}</div>
        <div style="display:flex;gap:10px;margin-top:18px">
          <button class="btn btn-sky" type="button" id="btnAgain">같은 모드 다시</button>
          <button class="btn btn-accent" type="button" id="btnToClass">${
            q.returnTo === "overview" ? "명단으로" : q.returnTo === "home" ? "학급 목록으로" : "학급으로"
          }</button>
        </div>
      </div>
    `;
    $("btnQuizBack").onclick = backToClass;
    $("btnAgain").onclick = () => restartQuiz(q);
    $("btnToClass").onclick = backToClass;
    return;
  }

  const pct = Math.round((q.progress || 0) * 100);
  let inner = "";
  const st = q.student || {};
  const visual = q.visual || "photoToName";

  if (visual === "practice") {
    inner = `
      <div class="flip-card" id="flipCard">
        ${
          state.flipped
            ? `<h2 class="h2">${escapeHtml(st.number)}. ${escapeHtml(st.name)}</h2>
               ${st.className ? `<span class="quiz-class-tag">${escapeHtml(st.className)}</span>` : ""}`
            : avatarBig(st.photoUrl)
        }
      </div>
      <p class="muted" style="margin-top:12px">사진을 클릭하면 이름이 보여요</p>
      <div style="display:flex;gap:10px;margin-top:18px">
        <button class="btn btn-danger" type="button" id="btnHard">모르겠어</button>
        <button class="btn btn-accent" type="button" id="btnEasy">알겠어</button>
      </div>
    `;
  } else if (visual === "typeName") {
    inner = `
      ${avatarBig(st.photoUrl)}
      ${st.className ? `<span class="quiz-class-tag">${escapeHtml(st.className)}</span>` : ""}
      <div class="type-row">
        <input id="typeInput" placeholder="이름을 입력하세요" autocomplete="off" />
        <button class="btn btn-accent" type="button" id="btnType">확인</button>
      </div>
      <div class="feedback" id="feedback"></div>
    `;
  } else if (visual === "nameToPhoto") {
    inner = `
      <h2 class="h2" style="font-size:40px;margin-top:8px">${escapeHtml(st.name)}</h2>
      <p class="muted">${st.className ? escapeHtml(st.className) + " · " : ""}${st.number ?? ""}번</p>
      <div class="choices">
        ${(q.choices || [])
          .map(
            (ch) => `
          <button class="choice photo-choice" type="button" data-choice="${escapeHtml(ch.id)}">
            ${ch.photoUrl ? `<img src="${ch.photoUrl}" alt="${escapeHtml(ch.name)}" />` : escapeHtml(ch.name)}
          </button>`
          )
          .join("")}
      </div>
      <div class="feedback" id="feedback"></div>
    `;
  } else {
    inner = `
      ${avatarBig(st.photoUrl)}
      <div class="choices">
        ${(q.choices || [])
          .map(
            (ch) => `
          <button class="choice" type="button" data-choice="${escapeHtml(ch.id)}">
            <strong>${escapeHtml(ch.number)}. ${escapeHtml(ch.name)}</strong>
            ${ch.className ? `<small>${escapeHtml(ch.className)}</small>` : ""}
          </button>`
          )
          .join("")}
      </div>
      <button class="btn btn-danger btn-sm quiz-unknown" type="button" id="btnUnknown">모르겠어</button>
      <div class="feedback" id="feedback"></div>
    `;
  }

  root.innerHTML = `
    <button class="btn btn-ghost btn-sm" type="button" id="btnQuizBack">← 돌아가기</button>
    <div class="quiz-head">
      <h2 class="h2" style="margin-top:10px">${escapeHtml(q.label)}</h2>
      <div class="progress-row">
        <span>${q.index} / ${q.total}</span>
        <span style="color:var(--accent);font-weight:700">정답 ${q.correct} / ${q.answered}</span>
      </div>
      <div class="bar"><i style="width:${pct}%"></i></div>
    </div>
    <div class="stage">${inner}</div>
  `;
  $("btnQuizBack").onclick = backToClass;
  bindQuizEvents(visual);
}

function avatarBig(url) {
  if (url) return `<img class="photo" src="${url}" alt="" />`;
  return `<div class="ph" style="width:180px;height:220px;border-radius:22px">사진 없음</div>`;
}

function bindQuizEvents(visual) {
  if (visual === "practice") {
    $("flipCard").onclick = () => {
      state.flipped = !state.flipped;
      renderQuiz();
    };
    $("btnHard").onclick = () => practice(false);
    $("btnEasy").onclick = () => practice(true);
    return;
  }
  if (visual === "typeName") {
    const submit = () => typeAnswer();
    $("btnType").onclick = submit;
    $("typeInput").onkeydown = (e) => {
      if (e.key === "Enter") submit();
    };
    $("typeInput").focus();
    return;
  }
  document.querySelectorAll("[data-choice]").forEach((btn) => {
    btn.onclick = () => choose(btn.dataset.choice);
  });
  const unknown = $("btnUnknown");
  if (unknown) unknown.onclick = markUnknown;
}

async function markUnknown() {
  if (state.locked) return;
  state.locked = true;
  const res = await call("quiz_unknown");
  await afterAnswer(res);
}

function showFeedback(res) {
  const el = $("feedback");
  if (!el) return;
  el.textContent = res.message || "";
  el.className = `feedback ${res.correct ? "ok" : "bad"}`;
}

async function afterAnswer(res) {
  if (!res.ok) {
    state.locked = false;
    return toast(res.error, true);
  }
  state.locked = true;
  showFeedback(res);
  setTimeout(async () => {
    const next = await call("quiz_next");
    if (!next.ok) return toast(next.error, true);
    state.quiz = next.quiz;
    state.flipped = false;
    state.locked = false;
    renderQuiz();
  }, res.correct ? 650 : 1100);
}

async function choose(id) {
  if (state.locked) return;
  state.locked = true;
  const res = await call("quiz_choose", id);
  await afterAnswer(res);
}

async function typeAnswer() {
  if (state.locked) return;
  const input = $("typeInput");
  state.locked = true;
  const res = await call("quiz_type", input.value);
  await afterAnswer(res);
}

async function practice(easy) {
  if (state.locked) return;
  state.locked = true;
  const res = await call("quiz_practice", easy);
  if (!res.ok) {
    state.locked = false;
    return toast(res.error, true);
  }
  const next = await call("quiz_next");
  if (!next.ok) return toast(next.error, true);
  state.quiz = next.quiz;
  state.flipped = false;
  state.locked = false;
  renderQuiz();
}

async function backToClass() {
  if (state.quiz?.overviewGroup) {
    await openOverviewGroup(state.quiz.overviewGroup);
    return;
  }
  if (state.quiz?.returnTo === "home") {
    await loadHome();
    return;
  }
  busy(true);
  try {
    const res = await call("refresh_class");
    applyPack(res);
  } finally {
    busy(false);
  }
}

function setupDrop() {
  const overlay = $("dropOverlay");
  let dragCount = 0;
  const isFileDrag = (e) => [...(e.dataTransfer?.types || [])].includes("Files");
  window.addEventListener("dragenter", (e) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    dragCount += 1;
    overlay.hidden = false;
  });
  window.addEventListener("dragleave", (e) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    dragCount = Math.max(0, dragCount - 1);
    if (dragCount === 0) overlay.hidden = true;
  });
  window.addEventListener("dragover", (e) => {
    if (isFileDrag(e)) e.preventDefault();
  });
  window.addEventListener("drop", async (e) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    dragCount = 0;
    overlay.hidden = true;
    const files = [...e.dataTransfer.files].filter((f) => f.name.toLowerCase().endsWith(".xlsx"));
    if (!files.length) return;
    await importFiles(files);
  });
}

function bindChrome() {
  $("btnImport").onclick = importModal;
  $("btnExportData").onclick = exportData;
  $("btnImportData").onclick = importDataModal;
  $("modalRoot").addEventListener("click", (e) => {
    if (e.target.dataset.close) closeModal();
  });
}

async function exportData() {
  busy(true);
  try {
    const res = await call("export_data");
    if (res.cancelled) return;
    if (!res.ok) return toast(res.error, true);
    toast(`데이터를 내보냈어요. (${res.classCount || 0}개 학급)`);
  } finally {
    busy(false);
  }
}

function importDataModal() {
  openModal(`
    <h3>데이터 불러오기</h3>
    <p>다른 컴퓨터에서 내보낸 zip 백업 파일을 선택하세요.</p>
    <div class="backup-options">
      <button class="card mode-card" type="button" data-backup-mode="replace">
        <span class="mode-icon" aria-hidden="true">♻️</span>
        <h3>덮어쓰기</h3>
        <p>이 컴퓨터의 기존 학급·기록을 지우고 백업으로 바꿉니다.</p>
      </button>
      <button class="card mode-card" type="button" data-backup-mode="merge">
        <span class="mode-icon" aria-hidden="true">➕</span>
        <h3>합치기</h3>
        <p>기존 데이터를 유지한 채 백업 학급을 추가합니다. 같은 학급은 백업으로 갱신됩니다.</p>
      </button>
    </div>
    <div class="modal-actions">
      <button class="btn btn-sky btn-sm" type="button" data-act="no">취소</button>
    </div>
  `);
  $("modalBox").onclick = async (e) => {
    if (e.target.closest("[data-act=no]")) return closeModal();
    const mode = e.target.closest("[data-backup-mode]")?.dataset.backupMode;
    if (!mode) return;
    closeModal();
    if (mode === "replace") {
      const yes = await confirmModal({
        title: "데이터 덮어쓰기",
        message: "이 컴퓨터에 저장된 학급과 학습 기록이 모두 삭제되고 백업 내용으로 바뀝니다. 계속할까요?",
        okText: "덮어쓰기",
        danger: true,
      });
      if (!yes) return;
    }
    await importData(mode);
  };
}

async function importData(mode) {
  busy(true);
  try {
    const res = await call("import_data", mode);
    if (res.cancelled) return;
    if (!res.ok) return toast(res.error, true);
    state.classOrderEditing = false;
    state.classQuizSelecting = false;
    state.selectedClassIds.clear();
    state.overviewPack = null;
    applyHomeData(res);
    showScreen("home");
    toast(
      mode === "replace"
        ? `백업을 불러왔어요. (${res.importedClassCount || 0}개 학급)`
        : `백업을 합쳤어요. (현재 ${res.importedClassCount || 0}개 학급)`
    );
  } finally {
    busy(false);
  }
}

async function boot() {
  if (booted) return;
  booted = true;
  bindChrome();
  setupDrop();
  await loadHome();
}

window.addEventListener("pywebviewready", boot);
if (window.pywebview && window.pywebview.api) boot();
