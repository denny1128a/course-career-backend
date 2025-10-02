require('dotenv').config();
const express = require('express');
const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

// 連接資料庫
const db = new sqlite3.Database('./courses.db', (err) => {
  if (err) {
    console.error('❌ 無法連接資料庫:', err.message);
  } else {
    console.log('✅ 已連接至 SQLite 資料庫');
  }
});

// 快取所有課程名稱以提升效能
let allCourses = [];
db.all('SELECT * FROM courses', [], (err, rows) => {
  if (err) {
    console.error('❌ 課程快取失敗:', err.message);
  } else {
    // [新增] 過濾無效課程，防止 course_name 為 undefined
    allCourses = rows.filter(course => course.course_name);
    console.log(`✅ 快取 ${allCourses.length} 筆課程資料`);
  }
});

// 主要處理請求的 API
app.post('/ask', async (req, res) => {
  // [修改] 更新解構賦值，匹配前端新字段
  const { department, grade, takenCourses, question, followupQuestion, previousAnswer, isFollowup } = req.body;

  // [修改] 驗證必填字段，確保不為 undefined
  if (!department || !grade || !takenCourses || !question) {
    return res.status(400).json({ error: '缺少必要的資料，請確認所有欄位都已填寫。' });
  }

  // [修改] 根據 isFollowup 構建 prompt，獨立處理追問邏輯
  let prompt = '';
  if (isFollowup) {
    // [新增] 檢查追問所需字段
    if (!followupQuestion || !previousAnswer) {
      return res.status(400).json({ error: '追問缺少必要資料，請確保已提交初始問題並輸入追問內容。' });
    }
    prompt = `這是學生的追問情境，請延續上一次的建議進行回答：\n
原始問題：${question}\n
AI 回覆：${previousAnswer}\n
學生追問：${followupQuestion}`;
  } else {
    prompt = `你是大學課程與職涯顧問，請根據以下學生資料提供建議：\n
主修學系：${department}\n
年級：${grade}\n
已修課程：${takenCourses}\n
學生問題：${question}`;
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

    // [新增] 檢查 API 響應，防止 undefined
    const aiAdvice = response.data.choices?.[0]?.message?.content || '無 AI 回應';

    // [修改] 確保課程名稱不為 undefined
    const matchedCourses = allCourses.filter(course =>
      course.course_name && aiAdvice.toLowerCase().includes(course.course_name.toLowerCase())
    );

    // [修改] 根據 isFollowup 返回不同響應
    if (isFollowup) {
      return res.json({ followupResult: aiAdvice });
    }

    if (matchedCourses.length > 0) {
      return res.json({
        response: aiAdvice,
        courses: matchedCourses.slice(0, 10),
      });
    } else {
      return res.json({
        response: aiAdvice,
        message: 'AI 沒有找到相關課程名稱，請再提供更具體的描述。'
      });
    }
  } catch (error) {
    console.error('❌ OpenRouter 錯誤:', error.response?.data || error.message);
    return res.status(500).json({ error: 'API 錯誤，請稍後再試。' });
  }
});

app.listen(port, () => {
  console.log(`🚀 Server is running on http://localhost:${port}`);
});