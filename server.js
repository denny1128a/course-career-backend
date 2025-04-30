const express = require('express');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

let isCoolingDown = false;

app.post('/ask', async (req, res) => {
  if (isCoolingDown) {
    return res.status(429).json({ error: '請稍後再試' });
  }

  const { department, grade, takenCourses, question } = req.body;

  const prompt = `
你是大學課程與職涯顧問，請根據以下學生資料給出實用建議：
主修學系：${department}
年級：${grade}
已修課程：${takenCourses}
學生問題：${question}
請回覆包含建議修哪些課、還缺乏哪些技能，以及未來發展方向建議。
`;

  console.log('🔥 傳送的 prompt:', prompt);

  try {
    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: process.env.OPENROUTER_MODEL,
        messages: [
          { role: 'system', content: '你是智慧選課與職涯建議系統的AI顧問。' },
          { role: 'user', content: prompt }
        ]
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'http://localhost:3000',
          'X-Title': 'CourseCareerAdvisor'
        }
      }
    );

    const answer = response.data.choices[0].message.content;
    res.json({ answer });

  } catch (error) {
    if (error.response && error.response.status === 429) {
      isCoolingDown = true;
      setTimeout(() => {
        isCoolingDown = false;
      }, 30000);
    }

    console.error('❌ OpenRouter 錯誤:', error.response?.data || error.message);
    res.status(500).json({ error: 'API 錯誤，請稍後再試。' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
