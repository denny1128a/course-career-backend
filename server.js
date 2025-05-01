const express = require('express');
const axios = require('axios');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
app.use(cors());
app.use(express.json());

// 建立 SQLite 資料庫連線
const db = new sqlite3.Database('./courses.db', sqlite3.OPEN_READONLY, (err) => {
  if (err) {
    console.error('❌ 無法連接資料庫:', err.message);
  } else {
    console.log('✅ 已連接至課程資料庫');
  }
});

// AI API 呼叫函式
async function askAI(prompt) {
  const response = await axios.post(
    'https://openrouter.ai/api/v1/chat/completions',
    {
      model: 'openai/gpt-3.5-turbo',
      messages: [
        { role: 'system', content: '你是智慧選課與職涯建議系統的AI顧問。' },
        { role: 'user', content: prompt }
      ]
    },
    {
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      }
    }
  );
  return response.data.choices[0].message.content;
}

// 課程推薦 API
app.post('/recommend', (req, res) => {
    const { course_code, course_name } = req.body;
  
    if (!course_code || !course_name) {
      return res.status(400).json({ error: '缺少必要參數 course_code 或 course_name' });
    }
  
    const query = `
      SELECT * FROM courses 
      WHERE course_code LIKE ? AND course_name LIKE ?;
    `;
  
    db.all(query, [`%${course_code}%`, `%${course_name}%`], (err, rows) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
  
      if (rows.length === 0) {
        return res.json({ message: '沒有找到符合條件的課程' });
      }
  
      return res.json(rows);
    });
  });
  

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
//此為server05，只能用來查詢串接課程資訊，甚至無法連結前端