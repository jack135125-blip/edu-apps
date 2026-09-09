function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('모의고사 성적 통합 분석')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function getSheetData() {
  // 구글 시트 ID (실제 시트 ID로 변경 필요 시 수정하세요)
  const sheetId = '1yv0EfHFzHO9rRfgEZc_nX_kE2yP5n57dhAGd6iQPFgQ'; 
  const ss = SpreadsheetApp.openById(sheetId);
  const sheets = ss.getSheets();
  const result = {};

  // 시트 이름을 정규식으로 판별하여 학년과 월 데이터로 자동 분류합니다.
  // 예: "1학년(3월)", "3학년(6월)" 등
  sheets.forEach(sheet => {
    const name = sheet.getName();
    const match = name.match(/(\d+)학년\((\d+)월\)/);
    
    if (match) {
      const grade = match[1] + "학년";
      const month = match[2] + "월";
      
      if (!result[grade]) result[grade] = {};
      result[grade][month] = sheet.getDataRange().getValues();
    }
  });
  
  return result;
}