/**
 * IndexedDB 저장소 — 학급 / 학생 / 퀴즈 기록
 * localStorage에 백업을 함께 남겨, IDB 이슈 시 복구합니다.
 */
const DB_NAME = 'name-quiz-db';
const DB_VERSION = 1;
const BACKUP_KEY = 'name-quiz-backup-v1';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('classes')) {
        db.createObjectStore('classes', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('sessions')) {
        const s = db.createObjectStore('sessions', { keyPath: 'id', autoIncrement: true });
        s.createIndex('byClass', 'classId', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function writeBackup(classes) {
  try {
    localStorage.setItem(
      BACKUP_KEY,
      JSON.stringify({ savedAt: Date.now(), classes: classes || [] })
    );
  } catch (err) {
    console.warn('localStorage 백업 실패(용량 초과 가능):', err);
  }
}

function readBackup() {
  try {
    const raw = localStorage.getItem(BACKUP_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.classes)) return null;
    return parsed.classes;
  } catch {
    return null;
  }
}

async function restoreFromBackupIfNeeded(existing) {
  if (existing && existing.length) return existing;
  const backup = readBackup();
  if (!backup || !backup.length) return existing || [];

  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction('classes', 'readwrite');
    const store = tx.objectStore('classes');
    for (const c of backup) store.put(c);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  return backup;
}

export async function listClasses() {
  const db = await openDb();
  const list = await new Promise((resolve, reject) => {
    const tx = db.transaction('classes', 'readonly');
    const req = tx.objectStore('classes').getAll();
    req.onsuccess = () => {
      const rows = req.result || [];
      rows.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      resolve(rows);
    };
    req.onerror = () => reject(req.error);
  });

  const restored = await restoreFromBackupIfNeeded(list);
  if (restored !== list) {
    restored.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  }
  // 백업이 비어 있고 IDB에 데이터가 있으면 백업 채우기
  if (restored.length && !readBackup()?.length) writeBackup(restored);
  return restored;
}

export async function getClass(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction('classes', 'readonly').objectStore('classes').get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function saveClass(classData) {
  classData.updatedAt = Date.now();
  if (!classData.createdAt) classData.createdAt = Date.now();

  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction('classes', 'readwrite');
    const req = tx.objectStore('classes').put(classData);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  // 전체 목록 백업 갱신 (재귀 없이 raw 조회)
  const all = await listClassesRaw();
  const idx = all.findIndex((c) => c.id === classData.id);
  if (idx >= 0) all[idx] = classData;
  else all.unshift(classData);
  writeBackup(all);
  return classData;
}

async function listClassesRaw() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction('classes', 'readonly').objectStore('classes').getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteClass(id) {
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(['classes', 'sessions'], 'readwrite');
    tx.objectStore('classes').delete(id);
    const idx = tx.objectStore('sessions').index('byClass');
    const req = idx.getAllKeys(id);
    req.onsuccess = () => {
      for (const key of req.result) tx.objectStore('sessions').delete(key);
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  const all = (await listClassesRaw()).filter((c) => c.id !== id);
  writeBackup(all);
}

export async function addSession(session) {
  session.createdAt = Date.now();
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('sessions', 'readwrite');
    const req = tx.objectStore('sessions').add(session);
    req.onsuccess = () => resolve(req.result);
    tx.onerror = () => reject(tx.error);
  });
}

export async function listSessions(classId) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('sessions', 'readonly');
    const idx = tx.objectStore('sessions').index('byClass');
    const req = idx.getAll(classId);
    req.onsuccess = () => {
      const list = req.result || [];
      list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      resolve(list);
    };
    req.onerror = () => reject(req.error);
  });
}

export function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** 디버그/안내용: 현재 저장 주소 */
export function storageOrigin() {
  return location.origin;
}
