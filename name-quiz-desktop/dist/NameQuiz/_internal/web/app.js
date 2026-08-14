let booted = false;

const SUB = {
  home: "사진 명렬표를 불러오고, 퀴즈로 학생 이름을 익혀 보세요.",
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
    renderHome(res.classes || []);
    showScreen("home");
  } catch (e) {
    toast(String(e.message || e), true);
  } finally {
    busy(false);
  }
}

function renderHome(classes) {
  const root = $("screenHome");
  if (!classes.length) {
    root.innerHTML = `
      <div class="row-between">
        <h2 class="h2">내 학급</h2>
        <span class="muted">이 컴퓨터에 자동 저장됩니다</span>
      </div>
      <div class="empty">
        <h3>아직 학급이 없어요</h3>
        <p>오른쪽 위 ‘엑셀 불러오기’로 가져오거나,<br/>엑셀 파일을 창에 끌어다 놓아도 됩니다</p>
      </div>
    `;
    return;
  }
  root.innerHTML = `
    <div class="row-between">
      <h2 class="h2">내 학급</h2>
      <span class="muted">이 컴퓨터에 자동 저장됩니다</span>
    </div>
    <div class="grid-2">
      ${classes
        .map(
          (c) => `
        <button class="card" type="button" data-open="${escapeHtml(c.id)}">
          <h3>${escapeHtml(c.name || "학급")}</h3>
          <p>${escapeHtml(c.school || "학교 미입력")}  ·  ${c.studentCount || 0}명${c.teacher ? "  ·  " + escapeHtml(c.teacher) : ""}</p>
          <div class="go">눌러서 열기 →</div>
        </button>`
        )
        .join("")}
    </div>
  `;
  root.querySelectorAll("[data-open]").forEach((btn) => {
    btn.onclick = () => openClass(btn.dataset.open);
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
      <div class="chips">
        <span class="chip">사진 ${s.withPhoto}/${s.total}</span>
        <span class="chip sky">정확도 ${escapeHtml(s.accuracyLabel)}</span>
        <span class="chip peach">약함 ${s.weak}</span>
        <span class="chip peach">복습 ${s.due}</span>
      </div>
      <div class="grid-2">
        ${(p.modes || [])
          .map(
            (m) => `
          <button class="card mode-card" type="button" data-mode="${escapeHtml(m.id)}">
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
      <button class="btn btn-accent btn-sm" type="button" id="btnAddStu">+ 학생 추가</button>
      <div style="margin-top:12px">
        ${(p.students || [])
          .map(
            (st) => `
          <div class="student">
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
  renderHome(res.classes || []);
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
    <p>나이스에서 해당 학급 사진명렬표를 엑셀로 다운받아 입력하면 됩니다.</p>
    <div class="dropzone" id="modalDrop">여기로 파일을 끌어다 놓으세요<br/><span class="muted">클릭해도 선택할 수 있어요</span></div>
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
    const file = [...e.dataTransfer.files].find((f) => f.name.toLowerCase().endsWith(".xlsx"));
    if (!file) return toast("xlsx 파일을 놓아 주세요.", true);
    await importFile(file);
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
    if (res.ok) {
      toast(`${res.imported}명 학급을 저장했어요!`);
      applyPack(res);
    } else toast(res.error, true);
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

async function importFile(file) {
  closeModal();
  busy(true);
  try {
    const b64 = await fileToB64(file);
    const res = await call("import_excel_b64", b64);
    if (res.ok) {
      toast(`${res.imported}명 학급을 저장했어요!`);
      applyPack(res);
    } else toast(res.error, true);
  } finally {
    busy(false);
  }
}

async function blankClassModal() {
  openModal(`
    <h3>빈 학급</h3>
    <label class="field"><span>학급 이름</span><input id="fBlank" placeholder="예: 2-3반" /></label>
    <div class="modal-actions">
      <button class="btn btn-sky btn-sm" type="button" data-act="no">취소</button>
      <button class="btn btn-accent btn-sm" type="button" data-act="yes">만들기</button>
    </div>
  `);
  $("modalBox").onclick = async (e) => {
    if (e.target.dataset.act === "no") return closeModal();
    if (e.target.dataset.act !== "yes") return;
    const name = $("fBlank").value;
    closeModal();
    const res = await call("create_blank_class", name);
    applyPack(res);
  };
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
          <button class="btn btn-accent" type="button" id="btnToClass">학급으로</button>
        </div>
      </div>
    `;
    $("btnQuizBack").onclick = backToClass;
    $("btnAgain").onclick = () => startQuiz(q.mode);
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
        ${state.flipped ? `<h2 class="h2">${escapeHtml(st.number)}. ${escapeHtml(st.name)}</h2>` : avatarBig(st.photoUrl)}
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
      <div class="type-row">
        <input id="typeInput" placeholder="이름을 입력하세요" autocomplete="off" />
        <button class="btn btn-accent" type="button" id="btnType">확인</button>
      </div>
      <div class="feedback" id="feedback"></div>
    `;
  } else if (visual === "nameToPhoto") {
    inner = `
      <h2 class="h2" style="font-size:40px;margin-top:8px">${escapeHtml(st.name)}</h2>
      <p class="muted">${st.number ?? ""}번</p>
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
            ${escapeHtml(ch.number)}. ${escapeHtml(ch.name)}
          </button>`
          )
          .join("")}
      </div>
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
  window.addEventListener("dragenter", (e) => {
    e.preventDefault();
    dragCount += 1;
    overlay.hidden = false;
  });
  window.addEventListener("dragleave", (e) => {
    e.preventDefault();
    dragCount = Math.max(0, dragCount - 1);
    if (dragCount === 0) overlay.hidden = true;
  });
  window.addEventListener("dragover", (e) => e.preventDefault());
  window.addEventListener("drop", async (e) => {
    e.preventDefault();
    dragCount = 0;
    overlay.hidden = true;
    const file = [...e.dataTransfer.files].find((f) => f.name.toLowerCase().endsWith(".xlsx"));
    if (!file) return;
    await importFile(file);
  });
}

function bindChrome() {
  $("btnBlank").onclick = blankClassModal;
  $("btnImport").onclick = importModal;
  $("modalRoot").addEventListener("click", (e) => {
    if (e.target.dataset.close) closeModal();
  });
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
