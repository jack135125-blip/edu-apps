/**
 * ⚠️ doGet 은 편집기 ▶ 실행으로 테스트하지 마세요.
 * HtmlOutput 을 반환하는 함수는 편집기에서 실행하면
 * "알 수 없는 오류" 가 뜨는 것이 정상입니다. (웹앱 배포 후 URL로 확인)
 *
 * 편집기에서 테스트할 때는 아래 runEditorCheck() 를 선택하고 실행하세요.
 */
function doGet() {
  try {
    return HtmlService.createHtmlOutputFromFile('Index')
        .setTitle('2027학년도 과목 선택 확인 시스템(담임용)-2차선택')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } catch (e) {
    Logger.log('doGet 오류: ' + e.message + '\n' + e.stack);
    return HtmlService.createHtmlOutput('페이지 로드 오류: ' + e.message);
  }
}

/** 편집기 ▶ 실행 버튼용 — 이 함수를 선택한 뒤 실행하세요 */
function runEditorCheck() {
  var result = testSetup();
  try {
    Browser.msgBox('연결 점검 결과', result, Browser.Buttons.OK);
  } catch (ignored) {
    Logger.log(result);
  }
  return result;
}

// 편집기에서 연결 상태 점검
function testSetup() {
  var lines = [];
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) {
      lines.push('오류: 스프레드시트에 바인딩된 프로젝트가 아닙니다.');
      lines.push('→ 시트 메뉴 [확장 프로그램] > [Apps Script]에서 열어야 합니다.');
      Logger.log(lines.join('\n'));
      return lines.join('\n');
    }

    lines.push('스프레드시트: ' + ss.getName());
    ['1학년안내', '2학년안내', '자료(1학년)', '자료(2학년)', '과목인원(1학년)', '과목인원(2학년)'].forEach(function(name) {
      lines.push(ss.getSheetByName(name) ? ('OK - ' + name) : ('없음 - ' + name));
    });

    HtmlService.createHtmlOutputFromFile('Index');
    lines.push('OK - Index.html 파일');
  } catch (e) {
    lines.push('오류: ' + e.message);
    if (String(e.message).indexOf('Index') !== -1) {
      lines.push('→ Apps Script 왼쪽 [+] > [HTML] 로 Index.html 파일을 추가하세요.');
    }
    Logger.log(e.stack || e.message);
  }

  Logger.log(lines.join('\n'));
  return lines.join('\n');
}

function asText(value) {
  return value == null ? '' : String(value).trim();
}

// 자료 기준 시간 가져오기
function getDataTimestamp(gradeName) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheetName = gradeName === '2학년' ? '자료(2학년)' : '자료(1학년)';
    var sheet = ss.getSheetByName(sheetName);
    return sheet ? sheet.getRange('D1').getDisplayValue() : '정보 없음';
  } catch (e) {
    Logger.log('getDataTimestamp 오류: ' + e.message);
    return '시간 정보 로드 실패';
  }
}

// 명단 데이터 및 학생별 상세 과목 선택 데이터 가져오기
function getFullGradeData(gradeName) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    
    // 1. 기본 명단 및 검토 결과 가져오기 (N학년안내 시트)
    var guideSheetName = gradeName === '1학년' ? '1학년안내' : '2학년안내';
    var guideSheet = ss.getSheetByName(guideSheetName);
    if (!guideSheet) {
      return { error: '시트를 찾을 수 없습니다: ' + guideSheetName };
    }
    
    var lastRow = guideSheet.getLastRow();
    var maxCol = guideSheet.getLastColumn();
    if (maxCol < 1 || lastRow < 1) {
      return { error: guideSheetName + ' 시트에 데이터가 없습니다.' };
    }

    var allHeaders = guideSheet.getRange(1, 1, 1, maxCol).getDisplayValues()[0];
    var bigoIndex = allHeaders.indexOf('비고');
    var lastCol = (bigoIndex !== -1) ? (bigoIndex + 1) : maxCol;
    if (lastCol < 1) lastCol = maxCol;
    
    var headers = allHeaders.slice(0, lastCol);
    var rosterData = [];
    if (lastRow > 1) {
      var rosterNumRows = lastRow - 1;
      rosterData = guideSheet.getRange(2, 1, rosterNumRows, lastCol).getDisplayValues();
    }

    // 2. 학생별 실제 선택 과목 가져오기 (자료 시트)
    var dataSheet = ss.getSheetByName('자료(' + gradeName + ')');
    var choicesMap = {};
    var choiceGroups = [];
    var timestamp = '정보 없음';
    
    if (dataSheet) {
      timestamp = dataSheet.getRange('D1').getDisplayValue() || '정보 없음';
      var dLastRow = dataSheet.getLastRow();
      var dLastCol = dataSheet.getLastColumn();
      
      if (dLastRow >= 5 && dLastCol >= 8) {
        var catRow = dataSheet.getRange(2, 1, 1, dLastCol).getDisplayValues()[0];
        var subjRow = dataSheet.getRange(3, 1, 1, dLastCol).getDisplayValues()[0];
        
        var subjectMeta = [];
        var currentCat = '기타 지정';
        
        for (var i = 7; i < catRow.length; i++) {
          if (asText(catRow[i]) !== '') currentCat = asText(catRow[i]);
          if (asText(subjRow[i]) !== '') {
            subjectMeta.push({ colIdx: i, category: currentCat, name: asText(subjRow[i]) });
            if (choiceGroups.indexOf(currentCat) === -1) choiceGroups.push(currentCat);
          }
        }
        
        var studentNumRows = dLastRow - 4;
        var studentsData = dataSheet.getRange(5, 1, studentNumRows, dLastCol).getDisplayValues();
        
        for (var r = 0; r < studentsData.length; r++) {
          var row = studentsData[r];
          var stuId = asText(row[1]);
          if (!stuId) continue;
          
          var myChoices = {};
          for (var s = 0; s < subjectMeta.length; s++) {
            var meta = subjectMeta[s];
            var val = asText(row[meta.colIdx]);
            if (val === '1' || val.toUpperCase() === 'O' || val === '○') {
              if (!myChoices[meta.category]) myChoices[meta.category] = [];
              myChoices[meta.category].push(meta.name);
            }
          }
          choicesMap[stuId] = myChoices;
        }
      }
    }
    
    return { 
      headers: headers, 
      data: rosterData, 
      choicesMap: choicesMap, 
      choiceGroups: choiceGroups,
      timestamp: timestamp
    };
  } catch (e) {
    Logger.log('getFullGradeData 오류: ' + e.message + '\n' + e.stack);
    return { error: e.message || String(e) };
  }
}

// 과목인원 시트 서식 및 데이터 파싱
function getFormattedSubjectStats(gradeName) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('과목인원(' + gradeName + ')');
    if (!sheet) return { error: '시트를 찾을 수 없습니다: 과목인원(' + gradeName + ')' };
    
    var lastRow = sheet.getLastRow();
    var lastCol = sheet.getLastColumn();
    var startRow = 3;
    if (lastRow < startRow || lastCol < 1) return { error: '과목인원 시트에 표시할 데이터가 없습니다.' };
    
    var numRows = lastRow - startRow + 1;
    var range = sheet.getRange(startRow, 1, numRows, lastCol);
    var texts = range.getDisplayValues();
    var backgrounds = range.getBackgrounds();
    var fontWeights = range.getFontWeights();
    var fontColors = range.getFontColors();
    var textAligns = range.getHorizontalAlignments();
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

    try {
      var mergedRanges = range.getMergedRanges();
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
    } catch (mergeError) {
      Logger.log('병합셀 처리 생략: ' + mergeError.message);
    }

    return grid;
  } catch (e) {
    Logger.log('getFormattedSubjectStats 오류: ' + e.message + '\n' + e.stack);
    return { error: e.message || String(e) };
  }
}