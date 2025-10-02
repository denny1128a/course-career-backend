const sqlite3 = require('sqlite3').verbose();

// 資料庫檔案路徑
const dbFile = './courses.db';

// 系所資料（直接嵌入）
const departmentsData = [
    ['文學院', '中國文學系'],
    ['文學院', '英美語文學系'],
    ['文學院', '法國語文學系'],
    ['理學院', '數學系'],
    ['理學院', '物理學系'],
    ['理學院', '化學系'],
    ['理學院', '光電科學與工程學系'],
    ['工學院', '機械工程學系'],
    ['工學院', '土木工程學系'],
    ['工學院', '化學工程與材料工程學系'],
    ['管理學院', '企業管理學系'],
    ['管理學院', '資訊管理學系'],
    ['管理學院', '財務金融學系'],
    ['管理學院', '經濟學系'],
    ['資訊電機學院', '電機工程學系'],
    ['資訊電機學院', '資訊工程學系'],
    ['資訊電機學院', '通訊工程學系'],
    ['地球科學學院', '地球科學學系'],
    ['地球科學學院', '大氣科學學系'],
    ['客家學院', '客家語文暨社會科學學系'],
    ['生醫理工學院', '生物醫學工程學系'],
];

// 開啟資料庫
const db = new sqlite3.Database(dbFile, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
    if (err) {
        console.error('⚠️ 無法打開資料庫:', err.message);
        process.exit(1);
    } else {
        console.log('✅ 資料庫已開啟');
    }
});

// 序列化執行
db.serialize(() => {
    // 建立 departments 資料表（若不存在）
    const createTableSQL = `
        CREATE TABLE IF NOT EXISTS departments (
            college TEXT NOT NULL,
            department TEXT NOT NULL,
            UNIQUE(college, department)
        )
    `;

    db.run(createTableSQL, (err) => {
        if (err) {
            console.error('⚠️ 創建 departments 資料表失敗:', err.message);
            process.exit(1);
        }
        console.log('✅ departments 資料表已創建或已存在');

        // 準備插入語句
        const stmt = db.prepare(`
            INSERT OR IGNORE INTO departments (college, department) VALUES (?, ?)
        `);

        // 插入資料
        for (let row of departmentsData) {
            stmt.run(row[0], row[1], (err) => {
                if (err) {
                    console.error(`⚠️ 插入資料失敗 (${row[0]}, ${row[1]}):`, err.message);
                }
            });
        }

        stmt.finalize((err) => {
            if (err) {
                console.error('⚠️ 結束插入失敗:', err.message);
            } else {
                console.log('✅ 所有系所資料插入完成');
            }
        });

        // 關閉資料庫
        db.close((err) => {
            if (err) {
                console.error('⚠️ 關閉資料庫時發生錯誤:', err.message);
            } else {
                console.log('✅ 資料庫已關閉');
            }
        });
    });
});