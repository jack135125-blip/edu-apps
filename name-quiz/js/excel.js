/**
 * 네이버/학교 시스템식 '교과별수강학생사진명렬표' xlsx 파서
 * - sharedStrings에서 이름·메타 추출
 * - drawings에서 사진 위치 추출 후 같은 열·아래쪽 이름 셀과 매칭
 */
import { uid } from './db.js';

const SS_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const NAME_RE = /(\d+)\s*학년\s*(\d+)\s*반\s*(\d+)\s*번\s+(.+)/;

function textContent(el) {
  if (!el) return '';
  return Array.from(el.getElementsByTagNameNS(SS_NS, 't') || el.getElementsByTagName('t'))
    .map((t) => t.textContent || '')
    .join('');
}

function colLettersToIndex(col) {
  let n = 0;
  for (const ch of col) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function parseCellRef(ref) {
  const m = ref.match(/^([A-Z]+)(\d+)$/);
  if (!m) return null;
  return { col: colLettersToIndex(m[1]), row: parseInt(m[2], 10) - 1 };
}

function getAttr(el, localName) {
  for (const attr of el.attributes || []) {
    if (attr.name === localName || attr.name.endsWith(':' + localName) || attr.localName === localName) {
      return attr.value;
    }
  }
  return null;
}

async function parseSharedStrings(zip) {
  const file = zip.file('xl/sharedStrings.xml');
  if (!file) return [];
  const xml = await file.async('text');
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  return Array.from(doc.getElementsByTagNameNS(SS_NS, 'si') || doc.getElementsByTagName('si')).map(
    (si) => textContent(si)
  );
}

async function parseSheetCells(zip, strings) {
  const file = zip.file('xl/worksheets/sheet1.xml') || zip.file(/xl\/worksheets\/sheet\d+\.xml/)[0];
  if (!file) throw new Error('시트 파일을 찾을 수 없습니다.');
  const xml = await file.async('text');
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const cells = [];
  const cellEls = doc.getElementsByTagNameNS(SS_NS, 'c').length
    ? doc.getElementsByTagNameNS(SS_NS, 'c')
    : doc.getElementsByTagName('c');

  for (const c of cellEls) {
    const ref = c.getAttribute('r');
    if (!ref) continue;
    const pos = parseCellRef(ref);
    if (!pos) continue;
    const t = c.getAttribute('t');
    const vEl = c.getElementsByTagNameNS(SS_NS, 'v')[0] || c.getElementsByTagName('v')[0];
    if (!vEl || vEl.textContent == null || vEl.textContent === '') continue;
    let value = vEl.textContent;
    if (t === 's') value = strings[parseInt(value, 10)] ?? '';
    if (String(value).trim()) cells.push({ ...pos, value: String(value).trim() });
  }
  return cells;
}

function elemsByLocal(root, name) {
  return Array.from(root.getElementsByTagName('*')).filter((el) => el.localName === name);
}

function firstByLocal(root, name) {
  return elemsByLocal(root, name)[0] || null;
}

async function parseDrawings(zip) {
  const drawingFile = zip.file('xl/drawings/drawing1.xml');
  if (!drawingFile) return [];
  const relsFile = zip.file('xl/drawings/_rels/drawing1.xml.rels');
  const relMap = {};
  if (relsFile) {
    const relXml = await relsFile.async('text');
    const relDoc = new DOMParser().parseFromString(relXml, 'application/xml');
    for (const rel of elemsByLocal(relDoc, 'Relationship')) {
      relMap[rel.getAttribute('Id')] = rel.getAttribute('Target');
    }
  }

  const xml = await drawingFile.async('text');
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const pics = [];
  const allAnchors = [
    ...elemsByLocal(doc, 'twoCellAnchor'),
    ...elemsByLocal(doc, 'oneCellAnchor'),
  ];

  for (const anchor of allAnchors) {
    const from = firstByLocal(anchor, 'from');
    if (!from) continue;
    const colEl = firstByLocal(from, 'col');
    const rowEl = firstByLocal(from, 'row');
    if (!colEl || !rowEl) continue;
    const col = parseInt(colEl.textContent, 10);
    const row = parseInt(rowEl.textContent, 10);
    const blip = firstByLocal(anchor, 'blip');
    if (!blip) continue;
    const rid = getAttr(blip, 'embed');
    let target = relMap[rid];
    if (!target) continue;
    if (target.startsWith('../')) target = 'xl/' + target.replace(/^\.\.\//, '');
    else if (!target.startsWith('xl/')) target = 'xl/drawings/' + target;
    pics.push({ row, col, path: target.replace(/\\/g, '/') });
  }
  return pics;
}

function extractMeta(cells) {
  const meta = {
    title: '',
    school: '',
    subject: '',
    teacher: '',
    date: '',
    grade: null,
    classNum: null,
  };
  for (const c of cells) {
    const v = c.value;
    if (v.includes('사진명렬표') || v.includes('명렬표')) meta.title = v;
    else if (v.includes('고등학교') || v.includes('중학교') || v.includes('초등학교')) meta.school = v;
    else if (v.startsWith('교과') || v.includes('교과 :') || v.includes('교과:')) {
      meta.subject = v.replace(/^교과\s*[:：]\s*/, '');
      const m = v.match(/(\d+)\s*학년.*?(\d+)\s*[-－]?\s*(\d+)\s*반/);
      if (m) {
        meta.grade = parseInt(m[1], 10);
        meta.classNum = parseInt(m[3] || m[2], 10);
      }
    } else if (v.includes('담당교사')) {
      meta.teacher = v.replace(/^담당교사\s*[:：]\s*/, '');
    } else if (/^\d{4}[.\-/]\d{1,2}[.\-/]\d{1,2}/.test(v)) {
      meta.date = v;
    }
  }
  return meta;
}

function matchPhotosToNames(nameCells, pics) {
  const matched = [];
  const used = new Set();

  for (const pic of pics) {
    // 사진은 이름 셀보다 보통 1~2행 위에 배치됨 → 같은 열에서 아래쪽 가장 가까운 이름
    let best = null;
    let bestDist = Infinity;
    for (const name of nameCells) {
      if (name.col !== pic.col) continue;
      const dist = name.row - pic.row;
      if (dist < 0 || dist > 4) continue;
      if (dist < bestDist) {
        bestDist = dist;
        best = name;
      }
    }
    // 같은 열 실패 시 근접 열 허용
    if (!best) {
      for (const name of nameCells) {
        const colDist = Math.abs(name.col - pic.col);
        const rowDist = name.row - pic.row;
        if (colDist > 2 || rowDist < 0 || rowDist > 4) continue;
        const score = rowDist * 10 + colDist;
        if (score < bestDist) {
          bestDist = score;
          best = name;
        }
      }
    }
    if (!best || used.has(best)) continue;
    used.add(best);
    matched.push({ nameCell: best, pic });
  }
  return matched;
}

/**
 * @param {File|Blob|ArrayBuffer} file
 * @returns {Promise<object>} class payload (photos as data URLs)
 */
export async function importNameRosterXlsx(file) {
  if (typeof JSZip === 'undefined') {
    throw new Error('JSZip이 로드되지 않았습니다.');
  }

  const zip = await JSZip.loadAsync(file);
  const strings = await parseSharedStrings(zip);
  const cells = await parseSheetCells(zip, strings);
  const pics = await parseDrawings(zip);
  const meta = extractMeta(cells);

  const nameCells = [];
  for (const c of cells) {
    const m = c.value.match(NAME_RE);
    if (!m) continue;
    nameCells.push({
      ...c,
      grade: parseInt(m[1], 10),
      classNum: parseInt(m[2], 10),
      number: parseInt(m[3], 10),
      name: m[4].trim(),
    });
  }

  if (!nameCells.length) {
    throw new Error('학생 이름(예: 2학년 2반 1번  홍길동)을 찾지 못했습니다.');
  }

  const pairs = matchPhotosToNames(nameCells, pics);
  const photoByPath = {};
  await Promise.all(
    pairs.map(async (p) => {
      const f = zip.file(p.pic.path) || zip.file(p.pic.path.replace(/^xl\//, ''));
      if (!f) return;
      const blob = await f.async('blob');
      const type = p.pic.path.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
      const typed = blob.type ? blob : new Blob([blob], { type });
      photoByPath[p.pic.path] = await blobToDataUrl(typed);
    })
  );

  const students = nameCells
    .slice()
    .sort((a, b) => a.number - b.number)
    .map((nc) => {
      const pair = pairs.find((p) => p.nameCell === nc);
      const photo = pair ? photoByPath[pair.pic.path] || null : null;
      return {
        id: uid('stu'),
        number: nc.number,
        name: nc.name,
        photo,
        stats: emptyStats(),
      };
    });

  const grade = meta.grade ?? nameCells[0].grade;
  const classNum = meta.classNum ?? nameCells[0].classNum;
  const displayName =
    meta.subject
      ? `${meta.subject}`
      : `${grade}-${classNum}반`;

  return {
    id: uid('class'),
    name: displayName,
    school: meta.school || '',
    subject: meta.subject || '',
    teacher: meta.teacher || '',
    grade,
    classNum,
    dateLabel: meta.date || '',
    students,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function emptyStats() {
  return {
    seen: 0,
    correct: 0,
    wrong: 0,
    streak: 0,
    ease: 2.5,
    interval: 0,
    nextReview: 0,
    lastSeen: 0,
  };
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export { emptyStats, NAME_RE };
