require('dotenv').config();
const express = require('express');
const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const session = require('express-session');
const bcrypt = require('bcrypt');
const SQLiteStore = require('connect-sqlite3')(session);

const app = express();
const port = 3000;

// CORS 配置
app.use(cors({
  origin: 'http://localhost:8080',
  credentials: true
}));
app.use(express.json());

// Session 配置
app.use(session({
  store: new SQLiteStore({
    db: 'sessions.db',
    dir: './',
    concurrentDB: true
  }),
  secret: process.env.SESSION_SECRET || 'default_secret_123',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: false, 
    maxAge: 24 * 60 * 60 * 1000,
    httpOnly: true,
    sameSite: 'lax'
  }
}));

// 連接資料庫
const db = new sqlite3.Database('./courses.db', (err) => {
  if (err) {
    console.error('❌ 無法連接資料庫:', err.message);
  } else {
    console.log('✅ 已連接至 SQLite 資料庫');
  }
});

// 創建 users 表
db.run(`
  CREATE TABLE IF NOT EXISTS users (
    user_id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    department TEXT,
    grade TEXT
  )
`, (err) => {
  if (err) {
    console.error('❌ 創建 users 表失敗:', err.message);
  } else {
    console.log('✅ users 表已準備就緒');
  }
});

// 創建 student_courses 表
db.run(`
  CREATE TABLE IF NOT EXISTS student_courses (
    user_id TEXT,
    course_name TEXT,
    semester TEXT,
    PRIMARY KEY (user_id, course_name, semester),
    FOREIGN KEY (user_id) REFERENCES users(user_id)
  )
`, (err) => {
  if (err) {
    console.error('❌ 創建 student_courses 表失敗:', err.message);
  } else {
    console.log('✅ student_courses 表已準備就緒');
  }
});

// 創建 history 表
db.run(`
  CREATE TABLE IF NOT EXISTS history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT,
    question TEXT,
    response TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id)
  )
`, (err) => {
  if (err) {
    console.error('❌ 創建 history 表失敗:', err.message);
  } else {
    console.log('✅ history 表已準備就緒');
  }
});

// 快取所有課程名稱
let allCourses = [];
db.all('SELECT * FROM courses', [], (err, rows) => {
  if (err) {
    console.error('❌ 課程快取失敗:', err.message);
  } else {
    allCourses = rows.filter(course => course.course_name);
    console.log(`✅ 總共查詢到 ${rows.length} 筆課程資料`);
    console.log(`✅ 過濾後快取 ${allCourses.length} 筆課程資料`);
    if (rows.length > allCourses.length) {
      const filteredOut = rows.filter(course => !course.course_name).slice(0, 3);
      console.log('⚠️ 以下課程因缺少 course_name 被過濾：');
      filteredOut.forEach(course => {
        console.log(`- ID: ${course.id}, Semester: ${course.semester}, Course: ${course.course_name || '空'}`);
      });
    }
  }
});

// 註冊 API
app.post('/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    console.log('⚠️ 註冊失敗: 缺少用戶名或密碼');
    return res.status(400).json({ error: '請提供用戶名和密碼' });
  }

  try {
    const existingUser = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM users WHERE username = ?', [username], (err, row) => {
        if (err) reject(err);
        resolve(row);
      });
    });

    if (existingUser) {
      console.log(`⚠️ 註冊失敗: 用戶 ${username} 已存在`);
      return res.status(400).json({ error: '此用戶名已註冊' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = Date.now().toString();

    db.run('INSERT INTO users (user_id, username, password) VALUES (?, ?, ?)', 
      [userId, username, hashedPassword], (err) => {
        if (err) {
          console.error('❌ 註冊失敗:', err.message);
          return res.status(500).json({ error: '註冊失敗' });
        }
        console.log(`✅ 用戶 ${username} 註冊成功`);
        res.json({ message: '註冊成功，請登入' });
      });
  } catch (err) {
    console.error('❌ 註冊錯誤:', err.message);
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// 登入 API
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    console.log('⚠️ 登入失敗: 缺少用戶名或密碼');
    return res.status(400).json({ error: '請提供用戶名和密碼' });
  }

  try {
    const user = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM users WHERE username = ?', [username], (err, row) => {
        if (err) reject(err);
        resolve(row);
      });
    });

    if (!user) {
      console.log(`⚠️ 登入失敗: 用戶 ${username} 不存在`);
      return res.status(400).json({ error: '用戶不存在' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      console.log(`⚠️ 登入失敗: 用戶 ${username} 密碼錯誤`);
      return res.status(400).json({ error: '密碼錯誤' });
    }

    req.session.user = { user_id: user.user_id, username: user.username };
    console.log(`✅ 登入成功: 用戶 ${username}, session:`, req.session.user, 'SessionID:', req.sessionID);
    res.json({ 
      message: '登入成功', 
      user_id: user.user_id, 
      username: user.username 
    });
  } catch (err) {
    console.error('❌ 登入錯誤:', err.message);
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// 登出 API
app.post('/logout', (req, res) => {
  console.log('登出請求, SessionID:', req.sessionID);
  req.session.destroy((err) => {
    if (err) {
      console.error('❌ 登出失敗:', err.message);
      return res.status(500).json({ error: '登出失敗' });
    }
    console.log('✅ 登出成功');
    res.json({ message: '登出成功' });
  });
});

// 獲取當前用戶
app.get('/user', (req, res) => {
  console.log('檢查用戶 session:', req.session.user, 'SessionID:', req.sessionID);
  if (req.session.user) {
    console.log(`✅ 獲取用戶資料: session:`, req.session.user);
    db.all('SELECT course_name, semester FROM student_courses WHERE user_id = ?', 
      [req.session.user.user_id], (err, courses) => {
        if (err) {
          console.error('❌ 查詢已修課程失敗:', err.message);
          return res.status(500).json({ error: '查詢已修課程失敗' });
        }
        db.get('SELECT * FROM users WHERE user_id = ?', [req.session.user.user_id], (err, user) => {
          if (err) {
            console.error('❌ 查詢用戶失敗:', err.message);
            return res.status(500).json({ error: '查詢用戶失敗' });
          }
          res.json({
            user_id: user.user_id,
            username: user.username,
            department: user.department || '',
            grade: user.grade || '',
            takenCourses: courses.map(c => `${c.course_name} (${c.semester})`).join(', ')
          });
        });
      });
  } else {
    console.log('⚠️ 無登入用戶');
    res.json({ user_id: null, username: null });
  }
});

// 儲存用戶資料（學系、年級、已修課程）
app.post('/save-user-data', (req, res) => {
  if (!req.session.user) {
    console.error('❌ 未登入用戶嘗試儲存資料');
    return res.status(401).json({ error: '請先登入' });
  }

  const { department, grade, takenCourses } = req.body;
  const userId = req.session.user.user_id;

  console.log('儲存用戶資料:', { userId, department, grade, takenCourses });

  db.run('UPDATE users SET department = ?, grade = ? WHERE user_id = ?', 
    [department, grade, userId], err => {
      if (err) {
        console.error('❌ 更新用戶資料失敗:', err.message);
        return res.status(500).json({ error: '更新用戶資料失敗' });
      }

      if (takenCourses) {
        // 清空現有課程
        db.run('DELETE FROM student_courses WHERE user_id = ?', [userId], err => {
          if (err) {
            console.error('❌ 清空已修課程失敗:', err.message);
          }
          // 插入新課程
          const courses = takenCourses.split(',').map(c => c.trim()).filter(c => c);
          courses.forEach(course => {
            const match = course.match(/(.+)\s*\((.+)\)/);
            const courseName = match ? match[1].trim() : course;
            const semester = match ? match[2].trim() : '未知';
            db.run('INSERT OR REPLACE INTO student_courses (user_id, course_name, semester) VALUES (?, ?, ?)',
              [userId, courseName, semester], err => {
                if (err) console.error('❌ 儲存已修課程失敗:', err.message);
              });
          });
        });
      }
      res.json({ message: '用戶資料已儲存' });
    });
});

// 刪除單門課程
app.delete('/delete-course', (req, res) => {
  if (!req.session.user) {
    console.error('❌ 未登入用戶嘗試刪除課程');
    return res.status(401).json({ error: '請先登入' });
  }

  const { courseName, semester } = req.body;
  const userId = req.session.user.user_id;

  if (!courseName || !semester) {
    console.log('⚠️ 刪除課程失敗: 缺少課程名稱或學期');
    return res.status(400).json({ error: '請提供課程名稱和學期' });
  }

  console.log('刪除課程:', { userId, courseName, semester });

  db.run('DELETE FROM student_courses WHERE user_id = ? AND course_name = ? AND semester = ?', 
    [userId, courseName, semester], function(err) {
      if (err) {
        console.error('❌ 刪除課程失敗:', err.message);
        return res.status(500).json({ error: '刪除課程失敗' });
      }
      if (this.changes === 0) {
        console.log('⚠️ 課程未找到:', { courseName, semester });
        return res.status(404).json({ error: '課程未找到' });
      }
      console.log(`✅ 課程 ${courseName} (${semester}) 已刪除`);
      res.json({ message: '課程已刪除' });
    });
});

// 獲取歷史問題
app.get('/history', (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: '請先登入' });
  }

  const userId = req.session.user.user_id;
  db.all('SELECT question, response, timestamp FROM history WHERE user_id = ? ORDER BY timestamp DESC', 
    [userId], (err, rows) => {
      if (err) {
        console.error('❌ 查詢歷史問題失敗:', err.message);
        return res.status(500).json({ error: '查詢歷史問題失敗' });
      }
      res.json(rows);
    });
});

// 檢查問題相關性
function isQuestionRelevant(question) {
  const keywords = [
    '課程', '選課', '課', '學', '學習', '修', '職涯', '職業', '工作', 
    '規劃', '建議', '推薦', '分析', '程式', '資料', '數據', '工程', 
    '管理', '設計', '技能', '實習', '面試', '準備'
  ];
  const lowerQuestion = question.toLowerCase();
  return keywords.some(keyword => lowerQuestion.includes(keyword));
}

// 處理問題的 API
app.post('/ask', async (req, res) => {
  const { department, grade, takenCourses, question, followupQuestion, previousAnswer, isFollowup } = req.body;
  const userId = req.session.user ? req.session.user.user_id : null;

  let finalDepartment = department;
  let finalGrade = grade;
  let finalTakenCourses = takenCourses || '';

  if (userId && (!department || !grade || !takenCourses)) {
    const user = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM users WHERE user_id = ?', [userId], (err, row) => {
        if (err) reject(err);
        resolve(row);
      });
    });
    finalDepartment = finalDepartment || user.department || '';
    finalGrade = finalGrade || user.grade || '';
    if (!takenCourses) {
      const courses = await new Promise((resolve, reject) => {
        db.all('SELECT course_name, semester FROM student_courses WHERE user_id = ?', [userId], (err, rows) => {
          if (err) reject(err);
          resolve(rows);
        });
      });
      finalTakenCourses = courses.map(c => `${c.course_name} (${c.semester})`).join(', ');
    }
  }

  if (!finalDepartment || !finalGrade || !question) {
    return res.status(400).json({ error: '缺少必要的資料，請確認所有欄位都已填寫。' });
  }

  if (!isFollowup && !isQuestionRelevant(question)) {
    return res.status(400).json({ error: '請問與課程或職涯相關的問題' });
  }
  if (isFollowup && (!followupQuestion || !isQuestionRelevant(followupQuestion))) {
    return res.status(400).json({ error: '請問與課程或職涯相關的問題' });
  }

  const relevantCourses = allCourses.filter(course => {
    const courseName = course.course_name.toLowerCase();
    const departmentMatch = course.department?.toLowerCase().includes(finalDepartment.toLowerCase());
    const questionMatch = courseName.includes(question.toLowerCase()) || course.course_content_zh?.toLowerCase().includes(question.toLowerCase());
    return departmentMatch || questionMatch;
  }).sort((a, b) => b.semester.localeCompare(a.semester)).slice(0, 5);

  console.log('檢索到的課程：', relevantCourses.map(c => `${c.course_name} (${c.semester})`));

  let prompt = '';
  if (isFollowup) {
    if (!previousAnswer) {
      return res.status(400).json({ error: '追問缺少必要資料，請確保已提交初始問題並輸入追問內容。' });
    }
    prompt = `你是大學課程與職涯顧問，請根據以下學生資料和課程資料（涵蓋多學年），延續上一次的建議回答追問。請提供清晰、易讀的回應，使用標題和分段，可自由回答（例如補充課程細節、職涯建議或其他相關資訊）。回應應基於提供的課程資料，但不需強制列出課程清單。

學生資料：
- 主修學系：${finalDepartment}
- 年級：${finalGrade}
- 已修課程：${finalTakenCourses}

相關課程資料（包含學年）：
${relevantCourses.map(c => `- ${c.course_name} (${c.semester}): ${c.course_content_zh || '無描述'} (學分: ${c.credits || '無'}, 類型: ${c.course_type || '無'})`).join('\n')}

原始問題：${question}
上一次回覆：${previousAnswer}
學生追問：${followupQuestion}

請提供 JSON 格式回應，包含：
1. **回應內容**（標題和建議內容，可用清單或段落）

格式：
{
  "advice": {
    "title": "追問回應",
    "content": "建議內容（可為清單或段落）"
  }
}`;
  } else {
    prompt = `你是大學課程與職涯顧問，請根據以下學生資料和課程資料（涵蓋多學年）提供選課和職涯建議。請提供清晰、易讀的回應，使用標題和分段。課程名稱必須直接從以下提供的 course_name 選取，嚴禁生成或使用未列出的課程名稱。

學生資料：
- 主修學系：${finalDepartment}
- 年級：${finalGrade}
- 已修課程：${finalTakenCourses}
- 問題：${question}

相關課程資料（包含學年）：
${relevantCourses.map(c => `- ${c.course_name}: ${c.course_content_zh || '無描述'} (學分: ${c.credits || '無'}, 類型: ${c.course_type || '無'})`).join('\n')}

請提供 JSON 格式回應，包含：
1. **職涯建議**（標題和建議內容，可用清單或段落）
2. **課程推薦**（課程清單，course_name 必須從上述課程資料選取，description 基於 course_content_zh，附推薦原因）

格式：
{
  "advice": {
    "title": "職涯建議",
    "content": "建議內容（以職涯建議為主）"
  },
  "courses": [
    {
      "course_name": "課程名稱",
      "description": "課程內容描述",
      "credits": "學分數",
      "course_type": "課程類型",
      "reason": "推薦原因"
    }
  ]
}`;
  }

  try {
    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: 'anthropic/claude-3-haiku',
        messages: [
          { role: 'system', content: '你是智慧選課與職涯建議系統的AI顧問。' },
          { role: 'user', content: prompt },
        ],
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const aiResponse = response.data.choices?.[0]?.message?.content || '{}';
    let aiAdvice;
    try {
      aiAdvice = JSON.parse(aiResponse);
    } catch (e) {
      aiAdvice = {
        advice: { title: isFollowup ? '追問回應' : '職涯建議', content: aiResponse || '無 AI 建議' },
        courses: []
      };
    }

    if (!isFollowup && userId) {
      db.run('INSERT INTO history (user_id, question, response) VALUES (?, ?, ?)',
        [userId, question, JSON.stringify(aiAdvice)], err => {
          if (err) console.error('❌ 儲存歷史問題失敗:', err.message);
        });
    }

    if (isFollowup) {
      return res.json({
        followupResult: aiAdvice.advice || { title: '追問回應', content: '無 AI 建議' }
      });
    }

    const recommendedCourses = (aiAdvice.courses || []).filter(c => {
      return relevantCourses.some(rc => rc.course_name === c.course_name);
    }).map(c => {
      const validCourse = relevantCourses.find(rc => rc.course_name === c.course_name);
      return {
        course_name: c.course_name,
        description: c.description || validCourse?.course_content_zh || '無課程內容描述',
        credits: c.credits || validCourse?.credits || '無',
        course_type: c.course_type || validCourse?.course_type || '無',
        reason: c.reason || '與問題相關'
      };
    });

    return res.json({
      response: aiAdvice.advice || { title: '職涯建議', content: '無 AI 建議' },
      courses: recommendedCourses,
      message: recommendedCourses.length === 0 ? '沒有找到相關課程，請嘗試更具體的描述。' : undefined
    });
  } catch (error) {
    console.error('❌ OpenRouter 錯誤:', error.response?.data || error.message);
    return res.status(500).json({ error: 'API 錯誤，請稍後再試。' });
  }
});

app.listen(port, () => {
  console.log(`🚀 Server is running on http://localhost:${port}`);
});