/**
 * 네임퀴즈 — Google Apps Script 웹앱
 * 시트: 학급/학생·학습기록 | Drive: 학생 사진
 */

var PROP = {
  SPREADSHEET_ID: 'SPREADSHEET_ID',
  ROOT_FOLDER_ID: 'ROOT_FOLDER_ID',
};

var SHEETS = {
  CLASSES: 'Classes',
  STUDENTS: 'Students',
};

var CLASS_HEADERS = [
  'id',
  'name',
  'school',
  'grade',
  'classNum',
  'teacher',
  'photoFolderId',
  'createdAt',
];

var STUDENT_HEADERS = [
  'id',
  'classId',
  'number',
  'name',
  'photoFileId',
  'seen',
  'correct',
  'wrong',
  'streak',
  'ease',
  'interval',
  'nextReview',
  'lastSeen',
];

var MODES = {
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
    desc: '사진을 보고 이름을 직접 써 봐요.',
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

/* ========== 웹앱 진입점 ========== */

function doGet() {
  ensureInitialized_();
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('네임퀴즈')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * 최초 1회 실행: 스프레드시트 + Drive 루트 폴더 생성
 * Apps Script 편집기에서 이 함수를 선택하고 실행하세요.
 */
function setupNameQuiz() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty(PROP.SPREADSHEET_ID) && props.getProperty(PROP.ROOT_FOLDER_ID)) {
    return {
      ok: true,
      message: '이미 설정되어 있습니다.',
      spreadsheetId: props.getProperty(PROP.SPREADSHEET_ID),
      rootFolderId: props.getProperty(PROP.ROOT_FOLDER_ID),
      spreadsheetUrl: SpreadsheetApp.openById(props.getProperty(PROP.SPREADSHEET_ID)).getUrl(),
    };
  }

  var root = DriveApp.createFolder('네임퀴즈');
  var ss = SpreadsheetApp.create('네임퀴즈 데이터');
  DriveApp.getFileById(ss.getId()).moveTo(root);

  ensureSheet_(ss, SHEETS.CLASSES, CLASS_HEADERS);
  ensureSheet_(ss, SHEETS.STUDENTS, STUDENT_HEADERS);

  props.setProperty(PROP.SPREADSHEET_ID, ss.getId());
  props.setProperty(PROP.ROOT_FOLDER_ID, root.getId());

  return {
    ok: true,
    message: '설정 완료. 웹앱을 배포하세요.',
    spreadsheetId: ss.getId(),
    rootFolderId: root.getId(),
    spreadsheetUrl: ss.getUrl(),
    folderUrl: root.getUrl(),
  };
}

/**
 * 데스크톱 백업 zip(Drive 파일 ID)을 웹앱 데이터로 가져옵니다.
 * mode: 'replace' | 'merge'
 * 사진이 많으면 continueDesktopBackupImport()를 여러 번 호출합니다.
 */
function importDesktopBackup(fileId, mode) {
  ensureInitialized_();
  mode = mode === 'merge' ? 'merge' : 'replace';
  if (!fileId) throw new Error('Drive 파일 ID가 필요합니다.');
  fileId = String(fileId).trim();

  var byPath = unzipBackupByPath_(fileId);
  if (!byPath['backup.json'] && !byPath['index.json']) {
    throw new Error('네임브릿지 백업 파일이 아닙니다. (backup.json 없음)');
  }
  if (byPath['backup.json']) {
    var meta = JSON.parse(byPath['backup.json'].getDataAsString());
    if (meta.format && meta.format !== 'namequiz-backup') {
      throw new Error('네임브릿지 백업 파일이 아닙니다.');
    }
  }

  var classIds = [];
  var seen = {};
  Object.keys(byPath).forEach(function (path) {
    var m = path.match(/^classes\/([^/]+)\/class\.json$/);
    if (m && !seen[m[1]]) {
      seen[m[1]] = true;
      classIds.push(m[1]);
    }
  });
  if (!classIds.length) throw new Error('백업에 학급 데이터가 없습니다.');

  if (mode === 'replace') {
    clearAllAppData_();
  }

  var job = {
    fileId: fileId,
    classIds: classIds,
    index: 0,
    mode: mode,
    importedClasses: 0,
    importedStudents: 0,
    importedPhotos: 0,
  };
  PropertiesService.getScriptProperties().setProperty('BACKUP_JOB', JSON.stringify(job));

  return continueDesktopBackupImport();
}

function continueDesktopBackupImport() {
  ensureInitialized_();
  var raw = PropertiesService.getScriptProperties().getProperty('BACKUP_JOB');
  if (!raw) {
    return { done: true, message: '진행 중인 가져오기가 없습니다.' };
  }
  var job = JSON.parse(raw);
  var byPath = unzipBackupByPath_(job.fileId);
  var started = Date.now();
  var TIME_LIMIT_MS = 4.5 * 60 * 1000;

  while (job.index < job.classIds.length) {
    if (Date.now() - started > TIME_LIMIT_MS) {
      PropertiesService.getScriptProperties().setProperty('BACKUP_JOB', JSON.stringify(job));
      return {
        done: false,
        importedClasses: job.importedClasses,
        importedStudents: job.importedStudents,
        importedPhotos: job.importedPhotos,
        totalClasses: job.classIds.length,
        current: job.index,
        message:
          '가져오는 중… ' +
          job.index +
          '/' +
          job.classIds.length +
          ' 학급 (이어서 가져오기를 눌러 주세요)',
      };
    }

    var classId = job.classIds[job.index];
    var stats = importOneClassFromBackupBlobs_(byPath, classId);
    job.importedClasses += 1;
    job.importedStudents += stats.students;
    job.importedPhotos += stats.photos;
    job.index += 1;
  }

  PropertiesService.getScriptProperties().deleteProperty('BACKUP_JOB');
  return {
    done: true,
    importedClasses: job.importedClasses,
    importedStudents: job.importedStudents,
    importedPhotos: job.importedPhotos,
    totalClasses: job.classIds.length,
    message:
      '가져오기 완료 · 학급 ' +
      job.importedClasses +
      ' · 학생 ' +
      job.importedStudents +
      ' · 사진 ' +
      job.importedPhotos,
  };
}

function unzipBackupByPath_(fileId) {
  var zipFile = DriveApp.getFileById(fileId);
  var parts = Utilities.unzip(zipFile.getBlob());
  var byPath = {};
  for (var i = 0; i < parts.length; i++) {
    var n = String(parts[i].getName() || '').replace(/\\/g, '/');
    byPath[n] = parts[i];
  }
  return byPath;
}

function findBackupZips() {
  ensureInitialized_();
  var root = DriveApp.getFolderById(getProp_(PROP.ROOT_FOLDER_ID));
  var out = [];
  var files = root.getFiles();
  while (files.hasNext()) {
    var f = files.next();
    var name = f.getName();
    if (/\.zip$/i.test(name)) {
      out.push({ id: f.getId(), name: name, url: f.getUrl() });
    }
  }
  if (!out.length) {
    var it = DriveApp.searchFiles(
      "title contains '네임브릿지_백업' and mimeType = 'application/zip' and trashed = false"
    );
    var n = 0;
    while (it.hasNext() && n < 10) {
      var file = it.next();
      out.push({ id: file.getId(), name: file.getName(), url: file.getUrl() });
      n += 1;
    }
  }
  return out;
}

function clearAllAppData_() {
  var classes = readRows_(SHEETS.CLASSES, CLASS_HEADERS);
  for (var i = 0; i < classes.length; i++) {
    if (classes[i].photoFolderId) {
      try {
        DriveApp.getFolderById(classes[i].photoFolderId).setTrashed(true);
      } catch (e) {}
    }
  }
  var classSheet = getSheet_(SHEETS.CLASSES);
  var studentSheet = getSheet_(SHEETS.STUDENTS);
  var cLast = classSheet.getLastRow();
  var sLast = studentSheet.getLastRow();
  if (cLast > 1) classSheet.deleteRows(2, cLast - 1);
  if (sLast > 1) studentSheet.deleteRows(2, sLast - 1);
}

function importOneClassFromBackupBlobs_(byPath, classId) {
  var jsonPath = 'classes/' + classId + '/class.json';
  if (!byPath[jsonPath]) {
    return { students: 0, photos: 0 };
  }
  var data = JSON.parse(byPath[jsonPath].getDataAsString());
  var students = data.students || [];

  var existing = findClass_(classId);
  if (existing) {
    deleteClass(classId);
  }

  var root = DriveApp.getFolderById(getProp_(PROP.ROOT_FOLDER_ID));
  var photoFolder = root.createFolder(String(data.name || classId));
  appendRow_(SHEETS.CLASSES, CLASS_HEADERS, {
    id: classId,
    name: data.name || classId,
    school: data.school || '',
    grade: data.grade == null ? '' : data.grade,
    classNum: data.classNum == null ? '' : data.classNum,
    teacher: data.teacher || '',
    photoFolderId: photoFolder.getId(),
    createdAt: data.createdAt
      ? new Date(Number(data.createdAt)).toISOString()
      : new Date().toISOString(),
  });

  var photoCount = 0;
  var studentRows = [];
  for (var i = 0; i < students.length; i++) {
    var st = students[i];
    var sid = st.id || uid_();
    var photoFileId = '';
    var photoName = st.photoFile || '';
    var photoPath = photoName ? 'classes/' + classId + '/photos/' + photoName : '';
    if (photoPath && byPath[photoPath]) {
      var created = photoFolder.createFile(byPath[photoPath].copyBlob().setName(photoName));
      photoFileId = created.getId();
      publishPhoto_(photoFileId);
      photoCount += 1;
    }
    var stats = st.stats || {};
    studentRows.push({
      id: sid,
      classId: classId,
      number: st.number == null ? '' : st.number,
      name: st.name || '',
      photoFileId: photoFileId,
      seen: Number(stats.seen || 0),
      correct: Number(stats.correct || 0),
      wrong: Number(stats.wrong || 0),
      streak: Number(stats.streak || 0),
      ease: Number(stats.ease || 2.5),
      interval: Number(stats.interval || 0),
      nextReview: Number(stats.nextReview || 0),
      lastSeen: Number(stats.lastSeen || 0),
    });
  }

  if (studentRows.length) {
    var sh = getSheet_(SHEETS.STUDENTS);
    var values = studentRows.map(function (obj) {
      return STUDENT_HEADERS.map(function (h) {
        return obj[h] != null ? obj[h] : '';
      });
    });
    sh.getRange(sh.getLastRow() + 1, 1, values.length, STUDENT_HEADERS.length).setValues(values);
  }

  PropertiesService.getScriptProperties().setProperty('PHOTO_PUB_' + classId, '1');
  return { students: studentRows.length, photos: photoCount };
}

/* ========== 클라이언트 API ========== */

function getBootstrap() {
  ensureInitialized_();
  return {
    modes: Object.keys(MODES).map(function (k) {
      return MODES[k];
    }),
    ready: true,
  };
}

function listClasses() {
  ensureInitialized_();
  var classes = readRows_(SHEETS.CLASSES, CLASS_HEADERS);
  var students = readRows_(SHEETS.STUDENTS, STUDENT_HEADERS);
  return classes
    .map(function (c) {
      var kids = students.filter(function (s) {
        return s.classId === c.id;
      });
      var summary = classSummary_(kids);
      return {
        id: c.id,
        name: c.name,
        school: c.school || '',
        grade: numOrNull_(c.grade),
        classNum: numOrNull_(c.classNum),
        teacher: c.teacher || '',
        photoFolderId: c.photoFolderId || '',
        summary: summary,
      };
    })
    .sort(function (a, b) {
      return String(a.name).localeCompare(String(b.name), 'ko');
    });
}

function getClassDetail(classId) {
  ensureInitialized_();
  var cls = findClass_(classId);
  if (!cls) throw new Error('학급을 찾을 수 없습니다.');
  var students = listStudentsForClass_(classId).map(function (st) {
    return studentOut_(st, false);
  });
  return {
    id: cls.id,
    name: cls.name,
    school: cls.school || '',
    grade: numOrNull_(cls.grade),
    classNum: numOrNull_(cls.classNum),
    teacher: cls.teacher || '',
    photoFolderId: cls.photoFolderId || '',
    students: students,
    summary: classSummary_(students.map(function (s) {
      return {
        seen: s.stats.seen,
        correct: s.stats.correct,
        wrong: s.stats.wrong,
        nextReview: s.stats.nextReview,
        photoFileId: s.photoFileId,
        name: s.name,
      };
    })),
    modes: Object.keys(MODES).map(function (k) {
      return MODES[k];
    }),
  };
}

function createClass(payload) {
  ensureInitialized_();
  payload = payload || {};
  var name = String(payload.name || '').trim();
  if (!name) throw new Error('학급 이름을 입력해 주세요.');

  var root = DriveApp.getFolderById(getProp_(PROP.ROOT_FOLDER_ID));
  var folder = root.createFolder(name);
  var id = uid_();
  var row = {
    id: id,
    name: name,
    school: String(payload.school || '').trim(),
    grade: payload.grade == null || payload.grade === '' ? '' : Number(payload.grade),
    classNum: payload.classNum == null || payload.classNum === '' ? '' : Number(payload.classNum),
    teacher: String(payload.teacher || '').trim(),
    photoFolderId: folder.getId(),
    createdAt: new Date().toISOString(),
  };
  appendRow_(SHEETS.CLASSES, CLASS_HEADERS, row);
  return getClassDetail(id);
}

function updateClass(classId, payload) {
  ensureInitialized_();
  var sheet = getSheet_(SHEETS.CLASSES);
  var rows = readRows_(SHEETS.CLASSES, CLASS_HEADERS);
  var idx = indexOfId_(rows, classId);
  if (idx < 0) throw new Error('학급을 찾을 수 없습니다.');
  var cur = rows[idx];
  cur.name = String(payload.name != null ? payload.name : cur.name).trim() || cur.name;
  cur.school = String(payload.school != null ? payload.school : cur.school || '').trim();
  cur.grade =
    payload.grade == null || payload.grade === ''
      ? cur.grade
      : Number(payload.grade);
  cur.classNum =
    payload.classNum == null || payload.classNum === ''
      ? cur.classNum
      : Number(payload.classNum);
  cur.teacher = String(payload.teacher != null ? payload.teacher : cur.teacher || '').trim();
  writeRowAt_(sheet, CLASS_HEADERS, idx + 2, cur);
  return getClassDetail(classId);
}

function deleteClass(classId) {
  ensureInitialized_();
  var cls = findClass_(classId);
  if (!cls) throw new Error('학급을 찾을 수 없습니다.');

  var studentSheet = getSheet_(SHEETS.STUDENTS);
  var students = readRows_(SHEETS.STUDENTS, STUDENT_HEADERS);
  for (var i = students.length - 1; i >= 0; i--) {
    if (students[i].classId === classId) {
      if (students[i].photoFileId) {
        try {
          DriveApp.getFileById(students[i].photoFileId).setTrashed(true);
        } catch (e) {}
      }
      studentSheet.deleteRow(i + 2);
    }
  }

  var classSheet = getSheet_(SHEETS.CLASSES);
  var classes = readRows_(SHEETS.CLASSES, CLASS_HEADERS);
  var cIdx = indexOfId_(classes, classId);
  if (cIdx >= 0) classSheet.deleteRow(cIdx + 2);

  if (cls.photoFolderId) {
    try {
      DriveApp.getFolderById(cls.photoFolderId).setTrashed(true);
    } catch (e) {}
  }
  return { ok: true };
}

function addStudent(classId, payload) {
  ensureInitialized_();
  var cls = findClass_(classId);
  if (!cls) throw new Error('학급을 찾을 수 없습니다.');
  payload = payload || {};
  var name = String(payload.name || '').trim();
  if (!name) throw new Error('학생 이름을 입력해 주세요.');
  var id = uid_();
  var row = emptyStudentRow_(id, classId, payload.number, name);
  appendRow_(SHEETS.STUDENTS, STUDENT_HEADERS, row);
  return studentOut_(row, false);
}

function updateStudent(studentId, payload) {
  ensureInitialized_();
  var sheet = getSheet_(SHEETS.STUDENTS);
  var rows = readRows_(SHEETS.STUDENTS, STUDENT_HEADERS);
  var idx = indexOfId_(rows, studentId);
  if (idx < 0) throw new Error('학생을 찾을 수 없습니다.');
  var cur = rows[idx];
  if (payload.name != null) cur.name = String(payload.name).trim() || cur.name;
  if (payload.number != null && payload.number !== '') cur.number = Number(payload.number);
  writeRowAt_(sheet, STUDENT_HEADERS, idx + 2, cur);
  return studentOut_(cur, false);
}

function deleteStudent(studentId) {
  ensureInitialized_();
  var sheet = getSheet_(SHEETS.STUDENTS);
  var rows = readRows_(SHEETS.STUDENTS, STUDENT_HEADERS);
  var idx = indexOfId_(rows, studentId);
  if (idx < 0) throw new Error('학생을 찾을 수 없습니다.');
  if (rows[idx].photoFileId) {
    try {
      DriveApp.getFileById(rows[idx].photoFileId).setTrashed(true);
    } catch (e) {}
  }
  sheet.deleteRow(idx + 2);
  return { ok: true };
}

/**
 * 사진 업로드 (data URL base64)
 * payload: { studentId, dataUrl, fileName }
 */
function uploadStudentPhoto(payload) {
  ensureInitialized_();
  payload = payload || {};
  var studentId = payload.studentId;
  var dataUrl = payload.dataUrl;
  if (!studentId || !dataUrl) throw new Error('사진 데이터가 없습니다.');

  var sheet = getSheet_(SHEETS.STUDENTS);
  var rows = readRows_(SHEETS.STUDENTS, STUDENT_HEADERS);
  var idx = indexOfId_(rows, studentId);
  if (idx < 0) throw new Error('학생을 찾을 수 없습니다.');
  var st = rows[idx];
  var cls = findClass_(st.classId);
  if (!cls || !cls.photoFolderId) throw new Error('학급 사진 폴더가 없습니다.');

  var parsed = parseDataUrl_(dataUrl);
  var fileName =
    String(payload.fileName || '').trim() ||
    padNum_(st.number) + '_' + st.name + '.' + extFromMime_(parsed.mimeType);

  var folder = DriveApp.getFolderById(cls.photoFolderId);
  if (st.photoFileId) {
    try {
      DriveApp.getFileById(st.photoFileId).setTrashed(true);
    } catch (e) {}
  }

  var blob = Utilities.newBlob(parsed.bytes, parsed.mimeType, fileName);
  var file = folder.createFile(blob);
  st.photoFileId = file.getId();
  publishPhoto_(st.photoFileId);
  PropertiesService.getScriptProperties().deleteProperty('PHOTO_PUB_' + st.classId);
  writeRowAt_(sheet, STUDENT_HEADERS, idx + 2, st);
  return studentOut_(st, true);
}

/**
 * Drive 학급 폴더의 사진을 파일명으로 매칭해 학생에 연결
 * 파일명 예: 01_홍길동.jpg / 1-홍길동.png / 홍길동.jpg
 */
function syncPhotosFromFolder(classId) {
  ensureInitialized_();
  var cls = findClass_(classId);
  if (!cls || !cls.photoFolderId) throw new Error('학급 사진 폴더가 없습니다.');

  var folder = DriveApp.getFolderById(cls.photoFolderId);
  var files = folder.getFiles();
  var byName = {};
  var byNumber = {};
  while (files.hasNext()) {
    var f = files.next();
    var mime = f.getMimeType() || '';
    if (mime.indexOf('image/') !== 0) continue;
    var parsed = parsePhotoFileName_(f.getName());
    if (parsed.name) byName[normalizeName_(parsed.name)] = f.getId();
    if (parsed.number != null) byNumber[String(parsed.number)] = f.getId();
  }

  var sheet = getSheet_(SHEETS.STUDENTS);
  var rows = readRows_(SHEETS.STUDENTS, STUDENT_HEADERS);
  var linked = 0;
  var created = 0;

  // 기존 학생에 사진 연결
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].classId !== classId) continue;
    var fileId =
      byNumber[String(rows[i].number)] ||
      byName[normalizeName_(rows[i].name)] ||
      '';
    if (!fileId) continue;
    if (rows[i].photoFileId === fileId) continue;
    rows[i].photoFileId = fileId;
    writeRowAt_(sheet, STUDENT_HEADERS, i + 2, rows[i]);
    linked += 1;
  }

  // 시트에 없는 파일 → 학생 자동 추가
  var existingNames = {};
  var existingNums = {};
  rows.forEach(function (r) {
    if (r.classId !== classId) return;
    existingNames[normalizeName_(r.name)] = true;
    existingNums[String(r.number)] = true;
  });

  files = folder.getFiles();
  while (files.hasNext()) {
    var file = files.next();
    var mt = file.getMimeType() || '';
    if (mt.indexOf('image/') !== 0) continue;
    var info = parsePhotoFileName_(file.getName());
    if (!info.name) continue;
    var key = normalizeName_(info.name);
    if (existingNames[key]) continue;
    if (info.number != null && existingNums[String(info.number)]) continue;
    var row = emptyStudentRow_(uid_(), classId, info.number, info.name);
    row.photoFileId = file.getId();
    appendRow_(SHEETS.STUDENTS, STUDENT_HEADERS, row);
    existingNames[key] = true;
    if (info.number != null) existingNums[String(info.number)] = true;
    created += 1;
  }

  return {
    ok: true,
    linked: linked,
    created: created,
    message:
      '사진 동기화 완료 · 연결 ' + linked + '명' + (created ? ' · 새 학생 ' + created + '명' : ''),
  };
}

function getPhotoDataUrl(fileId) {
  ensureInitialized_();
  if (!fileId) return null;
  // base64 전송은 매우 느려서 썸네일 URL만 반환합니다.
  publishPhoto_(fileId);
  return driveThumbUrl_(fileId, 600);
}

/** 여러 사진 URL을 한 번에 (서버에서 파일을 내려받지 않음) */
function getPhotoUrls(fileIds) {
  ensureInitialized_();
  var ids = fileIds || [];
  var out = {};
  for (var i = 0; i < ids.length; i++) {
    var id = ids[i];
    if (!id) continue;
    publishPhoto_(id);
    out[id] = driveThumbUrl_(id, 600);
  }
  return out;
}

/**
 * 이미 올려 둔 학급 사진을 '링크가 있는 모든 사용자 보기'로 바꿔
 * 퀴즈에서 썸네일이 바로 뜨게 합니다. (파일 ID를 아는 사람만 접근)
 */
function optimizeClassPhotos(classId) {
  ensureInitialized_();
  var students = listStudentsForClass_(classId);
  var n = 0;
  for (var i = 0; i < students.length; i++) {
    if (!students[i].photoFileId) continue;
    if (publishPhoto_(students[i].photoFileId)) n += 1;
  }
  PropertiesService.getScriptProperties().setProperty('PHOTO_PUB_' + classId, '1');
  return {
    ok: true,
    count: n,
    message: '사진 ' + n + '장을 빠른 로딩용으로 설정했습니다.',
  };
}

function optimizeAllPhotos() {
  ensureInitialized_();
  var students = readRows_(SHEETS.STUDENTS, STUDENT_HEADERS);
  var n = 0;
  var classIds = {};
  for (var i = 0; i < students.length; i++) {
    if (!students[i].photoFileId) continue;
    if (publishPhoto_(students[i].photoFileId)) n += 1;
    if (students[i].classId) classIds[students[i].classId] = true;
  }
  var props = PropertiesService.getScriptProperties();
  Object.keys(classIds).forEach(function (cid) {
    props.setProperty('PHOTO_PUB_' + cid, '1');
  });
  return {
    ok: true,
    count: n,
    message: '전체 사진 ' + n + '장을 빠른 로딩용으로 설정했습니다.',
  };
}

/**
 * 퀴즈 시작: 문항 큐 + 보기용 학생 메타 (사진은 문항별로 요청)
 */
function buildQuiz(classId, modeId, options) {
  ensureInitialized_();
  options = options || {};
  var mode = MODES[modeId] || MODES.photoToName;
  var students = listStudentsForClass_(classId).filter(function (s) {
    return s.name && s.photoFileId;
  });
  if (students.length < 1) throw new Error('사진이 있는 학생이 없습니다. 사진을 먼저 올려 주세요.');

  var queue = buildQuizQueue_(students, mode.id, options);
  if (!queue.length) throw new Error('퀴즈를 만들 학생이 부족합니다.');

  // 학급 사진은 최초 1회만 링크 공개(이후 퀴즈 시작이 빨라짐)
  ensureClassPhotosPublished_(classId, students);

  var pool = students.map(function (s) {
    return {
      id: s.id,
      number: numOrNull_(s.number),
      name: s.name,
      photoFileId: s.photoFileId,
      photoUrl: driveThumbUrl_(s.photoFileId, 600),
    };
  });

  return {
    mode: mode,
    classId: classId,
    items: queue.map(function (s) {
      return {
        id: s.id,
        number: numOrNull_(s.number),
        name: s.name,
        photoFileId: s.photoFileId,
        photoUrl: driveThumbUrl_(s.photoFileId, 600),
      };
    }),
    pool: pool,
  };
}

function recordAnswer(studentId, isCorrect) {
  ensureInitialized_();
  var sheet = getSheet_(SHEETS.STUDENTS);
  var rows = readRows_(SHEETS.STUDENTS, STUDENT_HEADERS);
  var idx = indexOfId_(rows, studentId);
  if (idx < 0) throw new Error('학생을 찾을 수 없습니다.');
  applyReview_(rows[idx], isCorrect ? 4 : 1);
  writeRowAt_(sheet, STUDENT_HEADERS, idx + 2, rows[idx]);
  return studentOut_(rows[idx], false);
}

function namesMatch(input, answer) {
  return normalizeName_(input) === normalizeName_(answer);
}

/* ========== 내부: 시트/Drive ========== */

function ensureInitialized_() {
  var ssId = PropertiesService.getScriptProperties().getProperty(PROP.SPREADSHEET_ID);
  if (!ssId) {
    throw new Error('아직 설정되지 않았습니다. 편집기에서 setupNameQuiz()를 먼저 실행하세요.');
  }
  var ss = SpreadsheetApp.openById(ssId);
  ensureSheet_(ss, SHEETS.CLASSES, CLASS_HEADERS);
  ensureSheet_(ss, SHEETS.STUDENTS, STUDENT_HEADERS);
}

function getProp_(key) {
  var v = PropertiesService.getScriptProperties().getProperty(key);
  if (!v) throw new Error('설정값 없음: ' + key + ' — setupNameQuiz()를 실행하세요.');
  return v;
}

function getSpreadsheet_() {
  return SpreadsheetApp.openById(getProp_(PROP.SPREADSHEET_ID));
}

function getSheet_(name) {
  var ss = getSpreadsheet_();
  var sh = ss.getSheetByName(name);
  if (!sh) throw new Error('시트가 없습니다: ' + name);
  return sh;
}

function ensureSheet_(ss, name, headers) {
  var sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  var last = sh.getLastColumn();
  if (sh.getLastRow() === 0 || last < 1) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.setFrozenRows(1);
    return sh;
  }
  var existing = sh.getRange(1, 1, 1, Math.max(last, headers.length)).getValues()[0];
  var needWrite = false;
  for (var i = 0; i < headers.length; i++) {
    if (existing[i] !== headers[i]) {
      needWrite = true;
      break;
    }
  }
  if (needWrite) sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  // 기본 Sheet1 정리
  var def = ss.getSheetByName('시트1') || ss.getSheetByName('Sheet1');
  if (def && ss.getSheets().length > 1 && def.getLastRow() <= 1) {
    try {
      ss.deleteSheet(def);
    } catch (e) {}
  }
  return sh;
}

function readRows_(sheetName, headers) {
  var sh = getSheet_(sheetName);
  var values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  var out = [];
  for (var r = 1; r < values.length; r++) {
    var obj = {};
    var empty = true;
    for (var c = 0; c < headers.length; c++) {
      var v = values[r][c];
      if (v !== '' && v != null) empty = false;
      obj[headers[c]] = v;
    }
    if (!empty && obj.id) out.push(obj);
  }
  return out;
}

function appendRow_(sheetName, headers, obj) {
  var sh = getSheet_(sheetName);
  sh.appendRow(
    headers.map(function (h) {
      return obj[h] != null ? obj[h] : '';
    })
  );
}

function writeRowAt_(sheet, headers, rowIndex, obj) {
  sheet.getRange(rowIndex, 1, 1, headers.length).setValues([
    headers.map(function (h) {
      return obj[h] != null ? obj[h] : '';
    }),
  ]);
}

function findClass_(classId) {
  var rows = readRows_(SHEETS.CLASSES, CLASS_HEADERS);
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].id === classId) return rows[i];
  }
  return null;
}

function listStudentsForClass_(classId) {
  return readRows_(SHEETS.STUDENTS, STUDENT_HEADERS)
    .filter(function (s) {
      return s.classId === classId;
    })
    .sort(function (a, b) {
      return Number(a.number || 0) - Number(b.number || 0);
    });
}

function indexOfId_(rows, id) {
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].id === id) return i;
  }
  return -1;
}

function emptyStudentRow_(id, classId, number, name) {
  return {
    id: id,
    classId: classId,
    number: number == null || number === '' ? '' : Number(number),
    name: name,
    photoFileId: '',
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

function studentOut_(st, withPhoto) {
  var seen = Number(st.seen || 0);
  var correct = Number(st.correct || 0);
  var wrong = Number(st.wrong || 0);
  var acc = seen ? correct / seen : null;
  var out = {
    id: st.id,
    classId: st.classId,
    number: numOrNull_(st.number),
    name: st.name || '',
    photoFileId: st.photoFileId || '',
    hasPhoto: !!st.photoFileId,
    stats: {
      seen: seen,
      correct: correct,
      wrong: wrong,
      streak: Number(st.streak || 0),
      ease: Number(st.ease || 2.5),
      interval: Number(st.interval || 0),
      nextReview: Number(st.nextReview || 0),
      lastSeen: Number(st.lastSeen || 0),
    },
    accuracy: acc,
    accuracyLabel: acc == null ? '—' : Math.round(acc * 100) + '%',
  };
  if (withPhoto && st.photoFileId) {
    out.photoUrl = getPhotoDataUrl(st.photoFileId);
  }
  return out;
}

function classSummary_(students) {
  var list = students || [];
  var seen = 0;
  var correct = 0;
  var weak = 0;
  var due = 0;
  var withPhoto = 0;
  var now = Date.now();
  for (var i = 0; i < list.length; i++) {
    var s = list[i];
    var stSeen = Number(s.seen != null ? s.seen : s.stats ? s.stats.seen : 0);
    var stCorrect = Number(s.correct != null ? s.correct : s.stats ? s.stats.correct : 0);
    var nextReview = Number(
      s.nextReview != null ? s.nextReview : s.stats ? s.stats.nextReview : 0
    );
    seen += stSeen;
    correct += stCorrect;
    if (stSeen > 0 && stCorrect / stSeen < 0.7) weak += 1;
    if (nextReview > 0 && nextReview <= now) due += 1;
    if (s.photoFileId || (s.hasPhoto && s.hasPhoto)) withPhoto += 1;
  }
  return {
    total: list.length,
    withPhoto: withPhoto,
    accuracy: seen ? correct / seen : null,
    accuracyLabel: seen ? Math.round((correct / seen) * 100) + '%' : '—',
    weak: weak,
    due: due,
    attempts: seen,
  };
}

/* ========== 퀴즈 로직 ========== */

function weaknessScore_(st) {
  var seen = Number(st.seen || 0);
  var correct = Number(st.correct || 0);
  var wrong = Number(st.wrong || 0);
  if (seen === 0) return 0.35;
  var acc = correct / seen;
  return (1 - acc) * 0.7 + Math.min(wrong, 10) / 10 * 0.3;
}

function getWeakStudents_(students) {
  return students
    .filter(function (st) {
      var seen = Number(st.seen || 0);
      var correct = Number(st.correct || 0);
      var wrong = Number(st.wrong || 0);
      if (seen < 1) return true;
      return correct / seen < 0.7 || wrong >= 2;
    })
    .sort(function (a, b) {
      return weaknessScore_(b) - weaknessScore_(a);
    })
    .slice(0, 12);
}

function getDueStudents_(students) {
  var now = Date.now();
  return students
    .filter(function (st) {
      var next = Number(st.nextReview || 0);
      return next > 0 && next <= now;
    })
    .sort(function (a, b) {
      return Number(a.nextReview || 0) - Number(b.nextReview || 0);
    });
}

function shuffle_(arr) {
  var a = arr.slice();
  for (var i = a.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  return a;
}

function buildQuizQueue_(students, modeId, options) {
  var pool = students.slice();
  if (modeId === 'weakOnly') {
    pool = getWeakStudents_(pool);
    if (pool.length < 2) pool = students.slice();
  } else if (modeId === 'dueReview') {
    pool = getDueStudents_(pool);
    if (!pool.length) pool = getWeakStudents_(students);
    if (!pool.length) pool = students.slice();
  }
  var count = Math.min(Number(options.count) || pool.length, pool.length);
  var ranked = shuffle_(pool).sort(function (a, b) {
    return weaknessScore_(b) - weaknessScore_(a);
  });
  var topN = Math.ceil(count * 0.6);
  var top = ranked.slice(0, topN);
  var rest = shuffle_(ranked.slice(topN)).slice(0, count - top.length);
  return shuffle_(top.concat(rest)).slice(0, count);
}

function applyReview_(st, quality) {
  st.seen = Number(st.seen || 0) + 1;
  st.lastSeen = Date.now();
  st.ease = Number(st.ease || 2.5);
  st.interval = Number(st.interval || 0);
  st.streak = Number(st.streak || 0);
  st.correct = Number(st.correct || 0);
  st.wrong = Number(st.wrong || 0);

  if (quality >= 3) {
    st.correct += 1;
    st.streak += 1;
    if (st.interval === 0) st.interval = 1;
    else if (st.interval === 1) st.interval = 3;
    else st.interval = Math.round(st.interval * st.ease);
    st.ease = Math.max(1.3, st.ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));
  } else {
    st.wrong += 1;
    st.streak = 0;
    st.interval = 0;
    st.ease = Math.max(1.3, st.ease - 0.2);
  }
  var days = Math.max(st.interval, quality >= 3 ? 1 : 0);
  st.nextReview = quality >= 3 ? Date.now() + days * 24 * 60 * 60 * 1000 : Date.now();
}

/* ========== 유틸 ========== */

function uid_() {
  return Utilities.getUuid().replace(/-/g, '').slice(0, 12);
}

function numOrNull_(v) {
  if (v === '' || v == null) return null;
  var n = Number(v);
  return isNaN(n) ? null : n;
}

function padNum_(n) {
  if (n == null || n === '') return '00';
  n = Number(n);
  return (n < 10 ? '0' : '') + n;
}

function normalizeName_(str) {
  return String(str || '')
    .replace(/\s+/g, '')
    .toLowerCase();
}

function parseDataUrl_(dataUrl) {
  var m = String(dataUrl).match(/^data:([^;]+);base64,(.+)$/);
  if (!m) throw new Error('올바른 이미지 형식이 아닙니다.');
  return {
    mimeType: m[1],
    bytes: Utilities.base64Decode(m[2]),
  };
}

function extFromMime_(mime) {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/gif') return 'gif';
  return 'jpg';
}

function parsePhotoFileName_(filename) {
  var base = String(filename || '').replace(/\.[^.]+$/, '');
  base = base.replace(/_/g, ' ').replace(/-/g, ' ').trim();
  var m = base.match(/^(\d+)\s+(.+)$/);
  if (m) {
    return { number: Number(m[1]), name: m[2].trim() };
  }
  m = base.match(/^(\d+)(.+)$/);
  if (m && /[^\d]/.test(m[2])) {
    return { number: Number(m[1]), name: m[2].trim() };
  }
  return { number: null, name: base };
}

function driveThumbUrl_(fileId, size) {
  size = size || 600;
  return 'https://drive.google.com/thumbnail?id=' + fileId + '&sz=w' + size;
}

function driveFallbackUrl_(fileId) {
  return 'https://lh3.googleusercontent.com/d/' + fileId + '=w600';
}

/** 썸네일 img 태그가 바로 열리도록 링크 보기 권한 부여 */
function publishPhoto_(fileId) {
  if (!fileId) return false;
  try {
    DriveApp.getFileById(fileId).setSharing(
      DriveApp.Access.ANYONE_WITH_LINK,
      DriveApp.Permission.VIEW
    );
    return true;
  } catch (e) {
    return false;
  }
}

function ensureClassPhotosPublished_(classId, students) {
  var key = 'PHOTO_PUB_' + classId;
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty(key) === '1') return;
  for (var i = 0; i < students.length; i++) {
    if (students[i].photoFileId) publishPhoto_(students[i].photoFileId);
  }
  props.setProperty(key, '1');
}
