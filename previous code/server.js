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
    allCourses = rows;
    console.log(`✅ 快取 ${rows.length} 筆課程資料`);
  }
});

// 主要處理請求的 API
app.post('/ask', async (req, res) => {
  const { department, grade, takenCourses, question, previousAnswer, followupInput } = req.body;

  if (!department || !grade || !takenCourses || !question) {
    return res.status(400).json({ error: '缺少必要的資料，請確認所有欄位都已填寫。' });
  }

  // 建立 prompt 給 AI
  let prompt = `你是大學課程與職涯顧問，請根據以下學生資料提供建議：\n
主修學系：${department}\n
年級：${grade}\n
已修課程：${takenCourses}\n
學生問題：${question}`;

  if (previousAnswer && followupInput) {
    prompt = `這是學生的追問情境，請延續上一次的建議進行回答：\n
原始問題：${question}\n
AI 回覆：${previousAnswer}\n
學生追問：${followupInput}`;
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

    const aiAdvice = response.data.choices[0].message.content;

    console.log('🔥 傳送的 prompt：\n', prompt);

    // 比對所有課程名稱是否出現在 AI 建議中
    const matchedCourses = allCourses.filter(course =>
      aiAdvice.toLowerCase().includes(course.course_name.toLowerCase())
    );

    if (followupInput) {
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
