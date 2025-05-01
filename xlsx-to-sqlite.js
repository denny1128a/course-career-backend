const xlsx = require('xlsx');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');

// 讀取 Excel 檔案
const workbook = xlsx.readFile('./courses1132.xlsx');
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const jsonData = xlsx.utils.sheet_to_json(sheet);

// 資料庫位置
const dbFile = './courses.db';
if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);  // 若已存在則刪除

// 開啟資料庫
const db = new sqlite3.Database(dbFile, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
  if (err) {
    console.error('⚠️ 無法打開資料庫:', err.message);
  } else {
    console.log('✅ 資料庫已開啟');
  }
});

// 建立選課資料表格
const createTableSQL = `
  CREATE TABLE IF NOT EXISTS courses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    college TEXT,
    department TEXT,
    program TEXT,
    semester TEXT,
    course_id TEXT,
    course_code TEXT,
    class TEXT,
    course_name TEXT,
    instructor TEXT,
    course_type TEXT,
    credits INTEGER,
    office_hour TEXT,
    office_hour_en TEXT,
    course_goal_zh TEXT,
    course_goal_en TEXT,
    course_content_zh TEXT,
    course_content_en TEXT,
    textbook_zh TEXT,
    textbook_en TEXT,
    custom_material_percentage INTEGER,
    teaching_method TEXT,
    evaluation_criteria_zh TEXT,
    evaluation_criteria_en TEXT,
    teaching_weeks INTEGER,
    flexible_teaching_zh TEXT,
    flexible_teaching_en TEXT,
    course_field TEXT,
    core_competency_index INTEGER,
    evaluation_method TEXT
  )
`;

db.serialize(() => {
  // 創建資料表
  db.run(createTableSQL, (err) => {
    if (err) {
      console.error('⚠️ 創建資料表失敗:', err.message);
      return;
    }
    console.log('✅ 資料表 courses 創建成功');

    // 清空資料表
    db.run("DELETE FROM courses", (err) => {
      if (err) {
        console.error('⚠️ 清空資料表失敗:', err.message);
      } else {
        console.log('✅ 資料表已清空');

        // 準備插入資料
        const stmt = db.prepare(`
          INSERT INTO courses (
            college, department, program, semester, course_id, course_code, class, course_name, 
            instructor, course_type, credits, office_hour, office_hour_en, course_goal_zh, 
            course_goal_en, course_content_zh, course_content_en, textbook_zh, textbook_en, 
            custom_material_percentage, teaching_method, evaluation_criteria_zh, evaluation_criteria_en, 
            teaching_weeks, flexible_teaching_zh, flexible_teaching_en, course_field, 
            core_competency_index, evaluation_method
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (let row of jsonData) {
          stmt.run(
            row['學院(中文)'] || '',
            row['系所(中文)'] || '',
            row['課程所屬學制(中文)'] || '',
            row['學年學期'] || '',
            row['選課流水號'] || '',
            row['課號'] || '',
            row['班次'] || '',
            row['課程名稱(中文)'] || '',
            row['授課教師(中文)'] || '',
            row['必/選修'] || '',
            row['學分數'] || 0,
            row['辦公時間(中文)'] || '',
            row['辦公時間(英文)'] || '',
            row['課程目標(中文)'] || '',
            row['課程目標(英文)'] || '',
            row['授課內容(中文)'] || '',
            row['授課內容(英文)'] || '',
            row['教科書/參考書(中文)'] || '',
            row['教科書/參考書(英文)'] || '',
            row['自編教材比例(%)'] || 0,
            row['授課方式'] || '',
            row['評量配分比重(中文)'] || '',
            row['評量配分比重(英文)'] || '',
            row['授課週數'] || 0,
            row['彈性教學說明(中文)'] || '',
            row['彈性教學說明(英文)'] || '',
            row['課程領域'] || '',
            row['核心能力強度指數'] || 0,
            row['評量方式'] || ''
          );
        }

        stmt.finalize();
        console.log('✅ 資料插入完成');

        db.close((err) => {
          if (err) {
            console.error('⚠️ 關閉資料庫時發生錯誤:', err.message);
          } else {
            console.log('✅ 資料庫已關閉');
          }
        });
      }
    });
  });
});
