require('dotenv').config();
const express = require('express');
const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

// 配置 session
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false } // 正式環境設為 true (HTTPS)
}));

// 初始化 passport
app.use(passport.initialize());
app.use(passport.session());

// 連接資料庫
const db = new sqlite3.Database('./courses.db', (err) => {
  if (err) {
    console.error('❌ 無法連接資料庫:', err.message);
  } else {
    console.log('✅ 已連接至 SQLite 資料庫');
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

// 配置 Google OAuth
passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: 'http://localhost:3000/auth/google/callback'
}, async (accessToken, refreshToken, profile, done) => {
  const userId = profile.id;
  const email = profile.emails[0].value;

  // 儲存或更新用戶
  db.get('SELECT * FROM users WHERE user_id = ?', [userId], (err, row) => {
    if (err) return done(err);
    if (row) {
      // 更新 email（如果變更）
      db.run('UPDATE users SET email = ? WHERE user_id = ?', [email, userId], err => {
        if (err) return done(err);
        return done(null, { user_id: userId, email });
      });
    } else {
      // 新增用戶
      db.run('INSERT INTO users (user_id, email) VALUES (?, ?)', [userId, email], err => {
        if (err) return done(err);
        return done(null, { user_id: userId, email });
      });
    }
  });
}));

// 序列化和反序列化用戶
passport.serializeUser((user, done) => {
  done(null, user.user_id);
});

passport.deserializeUser((userId, done) => {
  db.get('SELECT * FROM users WHERE user_id = ?', [userId], (err, row) => {
    if (err) return done(err);
    done(null, row);
  });
});

// OAuth 路由
app.get('/auth/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

app.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/' }),
  (req, res) => {
    res.redirect('http://localhost:8080/coursify_六版.html');
  }
);

// 登出
app.get('/logout', (req, res) => {
  req.logout(() => {
    res.redirect('http://localhost:8080/coursify_六版.html');
  });
});

// 獲取當前用戶
app.get('/user', (req, res) => {
  if (req.isAuthenticated()) {
    db.all('SELECT course_name, semester FROM student_courses WHERE user_id = ?', [req.user.user_id], (err, courses) => {
      if (err) {
        console.error('❌ 查詢已修課程失敗:', err.message);
        return res.status(500).json({ error: '查詢已修課程失敗' });
      }
      res.json({
        user_id: req.user.user_id,
        email: req.user.email,
        department: req.user.department || '',
        grade: req.user.grade || '',
        takenCourses: courses.map(c => `${c.course_name} (${c.semester})`).join(', ')
      });
    });
  } else {
    res.json({ user_id: null });
  }
});

// 儲存用戶資料（學系、年級、已修課程）
app.post('/save-user-data', (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: '請先登入' });
  }

  const { department, grade, takenCourses } = req.body;
  const userId = req.user.user_id;

  // 更新 users 表
  db.run('UPDATE users SET department = ?, grade = ? WHERE user_id = ?', [department, grade, userId], err => {
    if (err) {
      console.error('❌ 更新用戶資料失敗:', err.message);
      return res.status(500).json({ error: '更新用戶資料失敗' });
    }

    // 儲存已修課程
    if (takenCourses) {
      const courses = takenCourses.split(',').map(c => c.trim()).filter(c => c);
      courses.forEach(course => {
        // 假設課程名稱後有學年，例如「程式設計 (113-2)」
        const match = course.match(/(.+)\s*\((.+)\)/);
        const courseName = match ? match[1].trim() : course;
        const semester = match ? match[2].trim() : '未知';
        db.run('INSERT OR REPLACE INTO student_courses (user_id, course_name, semester) VALUES (?, ?, ?)',
          [userId, courseName, semester], err => {
            if (err) console.error('❌ 儲存已修課程失敗:', err.message);
          });
      });
    }
    res.json({ message: '用戶資料已儲存' });
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
  const userId = req.isAuthenticated() ? req.user.user_id : null;

  // 如果已登入，從資料庫載入用戶資料（若未提供）
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

  // 驗證必填字段
  if (!finalDepartment || !finalGrade || !question) {
    return res.status(400).json({ error: '缺少必要的資料，請確認所有欄位都已填寫。' });
  }

  // 檢查問題相關性
  if (!isFollowup && !isQuestionRelevant(question)) {
    return res.status(400).json({ error: '請問與課程或職涯相關的問題' });
  }
  if (isFollowup && (!followupQuestion || !isQuestionRelevant(followupQuestion))) {
    return res.status(400).json({ error: '請問與課程或職涯相關的問題' });
  }

  // 檢索相關課程
  const relevantCourses = allCourses.filter(course => {
    const courseName = course.course_name.toLowerCase();
    const departmentMatch = course.department?.toLowerCase().includes(finalDepartment.toLowerCase());
    const questionMatch = courseName.includes(question.toLowerCase());
    const takenMatch = finalTakenCourses.toLowerCase().includes(courseName);
    const contentMatch = course.course_content_zh?.toLowerCase().includes(question.toLowerCase());
    return (departmentMatch || questionMatch || takenMatch) && (!contentMatch || (departmentMatch || questionMatch));
  }).sort((a, b) => b.semester.localeCompare(a.semester)).slice(0, 5);

  console.log('檢索到的課程：', relevantCourses.map(c => `${c.course_name} (${c.semester})`));

  // 生成 Prompt
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
    prompt = `你是大學課程與職涯顧問，請根據以下學生資料和課程資料（涵蓋多學年）提供選課和職涯建議。請提供清晰、易讀的回應，使用標題和分段。課程名稱必須直接使用以下提供的 course_name，不可從摘要或問題中自行生成。

學生資料：
- 主修學系：${finalDepartment}
- 年級：${finalGrade}
- 已修課程：${finalTakenCourses}
- 問題：${question}

相關課程資料（包含學年）：
${relevantCourses.map(c => `- ${c.course_name} (${c.semester}): ${c.course_content_zh || '無描述'} (學分: ${c.credits || '無'}, 類型: ${c.course_type || '無'})`).join('\n')}

請提供 JSON 格式回應，包含：
1. **職涯建議**（標題和建議內容，可用清單或段落）
2. **課程推薦**（課程清單，course_name 必須來自上述課程資料，description 基於 course_content_zh，附推薦原因）

格式：
{
  "advice": {
    "title": "職涯建議",
    "content": "建議內容（可為清單或段落）"
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

    if (isFollowup) {
      return res.json({
        followupResult: aiAdvice.advice || { title: '追問回應', content: '無 AI 建議' }
      });
    }

    const recommendedCourses = aiAdvice.courses?.map(c => {
      const validCourse = relevantCourses.find(rc => rc.course_name === c.course_name);
      return {
        course_name: validCourse ? c.course_name : '未知課程',
        description: c.description || validCourse?.course_content_zh || '無課程內容描述',
        credits: c.credits || validCourse?.credits || '無',
        course_type: c.course_type || validCourse?.course_type || '無',
        reason: c.reason || '與問題相關'
      };
    }) || [];

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