function doGet() {
  return HtmlService.createTemplateFromFile('Index')
      .evaluate()
      .setTitle('2027학년도 교과목별 2차 선택 명단 (교과용)')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// 연결할 구글 스프레드시트 고유 ID
var SPREADSHEET_ID = "1leOtf6ODIewpRXcK6cqVaa_26vxTGxXsjzNSoN4rdCI";

// 자료 기준 시간 가져오기
function getDataTimestamp() {
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName('자료(1학년)');
    return sheet ? sheet.getRange("D1").getDisplayValue() : "정보 없음";
  } catch(e) { return "시간 정보 로드 실패"; }
}

// [수정된 핵심 로직] 3행에서 과목명을 가져오고, 학생 명단은 5행부터 읽어오기
function getFullSubjectData(gradeName) {
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName('자료(' + gradeName + ')');
    if (!sheet) return null;
    
    var lastRow = sheet.getLastRow();
    var lastCol = sheet.getLastColumn();
    
    // 명단이 5행부터 시작하므로 최소 5행 이상 데이터가 있어야 합니다.
    if (lastRow < 5 || lastCol < 8) return null; 
    
    // 1. 과목명 헤더는 3행(1줄)에서만 정확하게 가져옵니다.
    var headers = sheet.getRange(3, 1, 1, lastCol).getDisplayValues()[0];
    
    var subjects = [];
    // H열(8번째 열, 인덱스 7)부터 과목명을 스캔하여 저장합니다.
    for (var i = 7; i < headers.length; i++) {
      if (headers[i].trim() !== "") {
        subjects.push({ name: headers[i].trim(), index: i });
      }
    }
    
    // 2. 실제 학생 명단 데이터는 4행을 건너뛰고 5행부터 끝까지 가져옵니다.
    var studentsData = sheet.getRange(5, 1, lastRow - 4, lastCol).getDisplayValues();
    
    return {
      subjects: subjects,
      data: studentsData,
      // 1학년만: 1학년안내 F열=4 → 과학중점과정 이수 예정
      scienceTrack: (gradeName === '1학년') ? getScienceTrackRoster_(ss) : null
    };
  } catch(e) {
    return null;
  }
}

/**
 * 1학년안내 시트 F열(과학과목 선택 수)이 4인 학생 = 과학중점과정 이수 예정
 * @returns {{ count: number, students: Array<{id: string, name: string}> }}
 */
function getScienceTrackRoster_(ss) {
  try {
    var sheet = ss.getSheetByName('1학년안내');
    if (!sheet) return { count: 0, students: [] };

    var lastRow = sheet.getLastRow();
    var lastCol = sheet.getLastColumn();
    if (lastRow < 2 || lastCol < 6) return { count: 0, students: [] };

    var headers = sheet.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
    var idCol = headers.indexOf('학번');
    var nameCol = headers.indexOf('이름');
    if (idCol < 0) idCol = 1;   // B열 기본
    if (nameCol < 0) nameCol = 2; // C열 기본

    var rows = sheet.getRange(2, 1, lastRow - 1, lastCol).getDisplayValues();
    var students = [];
    for (var i = 0; i < rows.length; i++) {
      var sciCount = String(rows[i][5]).trim(); // F열
      if (sciCount === '4') {
        students.push({
          id: String(rows[i][idCol] || '').trim(),
          name: String(rows[i][nameCol] || '').trim()
        });
      }
    }
    return { count: students.length, students: students };
  } catch (e) {
    return { count: 0, students: [] };
  }
}

// 과목인원 시트 서식 및 셀 병합 가져오기 (통계표용)
function getFormattedSubjectStats(gradeName) {
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName('과목인원(' + gradeName + ')');
    if (!sheet) return null;
    
    var lastRow = sheet.getLastRow();
    var lastCol = sheet.getLastColumn();
    var startRow = 3;
    if (lastRow < startRow) return null;
    
    var numRows = lastRow - startRow + 1;
    var range = sheet.getRange(startRow, 1, numRows, lastCol);
    var texts = range.getDisplayValues();
    var backgrounds = range.getBackgrounds();
    var fontWeights = range.getFontWeights();
    var fontColors = range.getFontColors();
    var textAligns = range.getHorizontalAlignments();
    
    var mergedRanges = range.getMergedRanges();
    var grid = [];
    
    for (var r = 0; r < numRows; r++) {
      grid[r] = [];
      for (var c = 0; c < lastCol; c++) {
        grid[r][c] = {
          text: texts[r][c], bg: backgrounds[r][c], fw: fontWeights[r][c],
          co: fontColors[r][c], align: textAligns[r][c],
          rowspan: 1, colspan: 1, isChild: false
        };
      }
    }
    
    for (var i = 0; i < mergedRanges.length; i++) {
      var mRange = mergedRanges[i];
      var rStartIdx = mRange.getRow() - startRow;
      var rEndIdx = mRange.getLastRow() - startRow;
      var cStartIdx = mRange.getColumn() - 1;
      var cEndIdx = mRange.getLastColumn() - 1;
      
      if (rStartIdx < 0) rStartIdx = 0;
      if (rStartIdx < numRows && cStartIdx < lastCol) {
        grid[rStartIdx][cStartIdx].rowspan = rEndIdx - rStartIdx + 1;
        grid[rStartIdx][cStartIdx].colspan = cEndIdx - cStartIdx + 1;
        for (var row = rStartIdx; row <= rEndIdx; row++) {
          for (var col = cStartIdx; col <= cEndIdx; col++) {
            if (row === rStartIdx && col === cStartIdx) continue;
            if (row < numRows && col < lastCol) grid[row][col].isChild = true;
          }
        }
      }
    }
    return grid;
  } catch(e) { return null; }
}