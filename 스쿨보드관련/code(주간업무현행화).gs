function updateTodaysNotice() {
  const sheet1Id = '176xReeFa0I9wWgvYeKzqf1vukRy2NVhKoYboAxXBhB4'; // 1번 시트: 업무자료
  const sheet2Id = '1dOzQRmT3eIKW3OuIQlDAw7WkHRqn8j-kdLbv18x2zPM'; // 2번 시트: 주간업무계획

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // [추가된 로직 1] 주말(토, 일)인 경우 스크립트 실행을 즉시 종료합니다.
  const dayOfWeek = today.getDay(); // 0: 일요일, 1: 월요일 ... 6: 토요일
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    Logger.log("주말(토/일)이므로 업무 알림을 생성하지 않고 종료합니다.");
    return;
  }

  const weekDays = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];
  const todayString = `${today.getFullYear()}년 ${today.getMonth() + 1}월 ${today.getDate()}일 ${weekDays[dayOfWeek]}`;

  const year = today.getFullYear();
  const semester1Start = new Date(year, 2, 2);  // 1학기 1주 시작: 3월 2일
  semester1Start.setHours(0, 0, 0, 0);
  const semester2Start = new Date(year, 7, 3);  // 2학기 1주 시작: 8월 3일
  semester2Start.setHours(0, 0, 0, 0);

  let baseDate;
  let semesterLabel;
  if (today.getTime() >= semester2Start.getTime()) {
    baseDate = semester2Start;
    semesterLabel = '2학기';
  } else if (today.getTime() >= semester1Start.getTime()) {
    baseDate = semester1Start;
    semesterLabel = '1학기';
  } else {
    baseDate = new Date(year - 1, 7, 3);
    baseDate.setHours(0, 0, 0, 0);
    semesterLabel = '2학기';
  }

  const diffTime = today.getTime() - baseDate.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  const weekNumber = Math.floor(diffDays / 7) + 1;
  const targetSheetName = `${semesterLabel} ${weekNumber}주`;

  const ss2 = SpreadsheetApp.openById(sheet2Id);
  const sheetToSearch = ss2.getSheetByName(targetSheetName);

  let todaysTasks = [];
  let foundDate = false;

  if (sheetToSearch) {
    const data = sheetToSearch.getDataRange().getDisplayValues();
    const mergedRanges = sheetToSearch.getDataRange().getMergedRanges();

    if (data.length >= 2) {
      const dateRow = sheetToSearch.getRange("A2:G2").getValues()[0]; 
      const depts = data.map(row => row[0]); 

      for (let j = 1; j < dateRow.length; j++) {
        let cellValue = dateRow[j];
        let isMatch = false;

        if (cellValue instanceof Date) {
          cellValue.setHours(0, 0, 0, 0);
          if (cellValue.getTime() === today.getTime()) {
            isMatch = true;
          }
        } 
        else if (typeof cellValue === 'string') {
          if (cellValue.replace(/\s/g, '') === todayString.replace(/\s/g, '')) {
            isMatch = true;
          }
        }

        if (isMatch) {
          foundDate = true;
          
          for (let r = 2; r < data.length; r++) {
            let rowNum = r + 1;

            if (rowNum === 3 || rowNum === 4 || rowNum === 16) {
              continue;
            }

            let task = data[r][j];
            let dept = depts[r].toString();
            
            let cleanDept = dept.replace(/[\r\n]+/g, '').trim();

            if (cleanDept.replace(/\s/g, '') === "행정실장") {
              cleanDept = "행정실";
            }
            
            if (task === "") {
              const currentCell = sheetToSearch.getRange(r + 1, j + 1);
              
              for (let m = 0; m < mergedRanges.length; m++) {
                const range = mergedRanges[m];
                
                if (currentCell.getRow() >= range.getRow() && 
                    currentCell.getRow() <= range.getLastRow() &&
                    currentCell.getColumn() >= range.getColumn() && 
                    currentCell.getColumn() <= range.getLastColumn()) {
                      
                      task = range.getCell(1, 1).getDisplayValue();
                      break;
                }
              }
            }

            if (task && task.toString().trim() !== "") {
              let cleanTask = task.toString().trim();
              todaysTasks.push(`[${cleanDept}] ${cleanTask}`);
            }
          }
          break; 
        }
      }
    }
  }

  const ss1 = SpreadsheetApp.openById(sheet1Id);
  const noticeSheet = ss1.getSheetByName('오늘의알림');
  
  if (!noticeSheet) {
    Logger.log("'오늘의알림' 시트를 찾을 수 없습니다.");
    return;
  }

  // [수정된 로직 2] 날짜 포맷을 'MM.dd(요일)' 형태로 변경
  const shortWeekDays = ["일", "월", "화", "수", "목", "금", "토"];
  const formattedDate = Utilities.formatDate(today, Session.getScriptTimeZone(), "MM.dd") + `(${shortWeekDays[dayOfWeek]})`;
  
  let resultText = "";
  
  if (todaysTasks.length > 0) {
    // 제목 포맷을 요청하신 형태로 반영
    resultText = `${formattedDate} 오늘의 업무 알림\n\n` + todaysTasks.join('\n\n');
  } else if (!foundDate) {
    resultText = `${formattedDate}\n\n오늘 날짜(${todayString})에 해당하는 업무 계획란을 '${targetSheetName}' 시트에서 찾지 못했습니다.`;
  } else {
    resultText = `${formattedDate}\n\n오늘은 예정된 부서별 주간 업무가 없습니다.`;
  }

  noticeSheet.getRange('A1').setValue(resultText);
}