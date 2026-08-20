function doGet() {
  return HtmlService.createTemplateFromFile('Index')
      .evaluate()
      .setTitle('2027학년도 과목 선택 확인 시스템(담임용)-2차선택')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// 자료 기준 시간 가져오기
function getDataTimestamp(gradeName) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheetName = gradeName === '2학년' ? '자료(2학년)' : '자료(1학년)';
    var sheet = ss.getSheetByName(sheetName);
    return sheet ? sheet.getRange("D1").getDisplayValue() : "정보 없음";
  } catch(e) { return "시간 정보 로드 실패"; }
}

// 명단 데이터 및 학생별 상세 과목 선택 데이터 가져오기
function getFullGradeData(gradeName) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    
    // 1. 기본 명단 및 검토 결과 가져오기 (N학년안내 시트)
    var guideSheetName = gradeName === '1학년' ? '1학년안내' : '2학년안내';
    var guideSheet = ss.getSheetByName(guideSheetName);
    if (!guideSheet) return null;
    
    var lastRow = guideSheet.getLastRow();
    var maxCol = guideSheet.getLastColumn();
    var allHeaders = guideSheet.getRange(1, 1, 1, maxCol).getValues()[0];
    var bigoIndex = allHeaders.indexOf('비고');
    var lastCol = (bigoIndex !== -1) ? (bigoIndex + 1) : maxCol;
    
    var headers = allHeaders.slice(0, lastCol);
    var rosterData = lastRow > 1 ? guideSheet.getRange(2, 1, lastRow - 1, lastCol).getValues() : [];

    // 2. 학생별 실제 선택 과목 가져오기 (자료 시트)
    var dataSheet = ss.getSheetByName('자료(' + gradeName + ')');
    var choicesMap = {};
    var choiceGroups = [];
    var timestamp = "정보 없음";
    
    if (dataSheet) {
      timestamp = dataSheet.getRange("D1").getDisplayValue() || "정보 없음";
      var dLastRow = dataSheet.getLastRow();
      var dLastCol = dataSheet.getLastColumn();
      
      if (dLastRow >= 5 && dLastCol >= 8) {
        var catRow = dataSheet.getRange(2, 1, 1, dLastCol).getDisplayValues()[0]; // 2행 학기/분류
        var subjRow = dataSheet.getRange(3, 1, 1, dLastCol).getDisplayValues()[0]; // 3행 과목명
        
        var subjectMeta = [];
        var currentCat = "기타 지정";
        
        // H열(인덱스 7)부터 스캔
        for (var i = 7; i < catRow.length; i++) {
          if (catRow[i].trim() !== "") currentCat = catRow[i].trim();
          if (subjRow[i].trim() !== "") {
            subjectMeta.push({ colIdx: i, category: currentCat, name: subjRow[i].trim() });
            if (choiceGroups.indexOf(currentCat) === -1) choiceGroups.push(currentCat);
          }
        }
        
        // 5행부터 실제 학생 명단 데이터 스캔
        var studentsData = dataSheet.getRange(5, 1, dLastRow - 4, dLastCol).getDisplayValues();
        
        for (var r = 0; r < studentsData.length; r++) {
          var row = studentsData[r];
          var stuId = row[1].trim(); // B열(인덱스 1) 학번
          if (!stuId) continue;
          
          var myChoices = {};
          for (var s = 0; s < subjectMeta.length; s++) {
            var meta = subjectMeta[s];
            var val = row[meta.colIdx].trim();
            if (val === "1" || val.toUpperCase() === "O" || val === "○") {
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
  } catch(e) {
    return { error: String(e) };
  }
}

// 과목인원 시트 서식 및 데이터 파싱
function getFormattedSubjectStats(gradeName) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
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