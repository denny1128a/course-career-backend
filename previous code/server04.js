const express = require('express');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

let isCoolingDown = false;
let conversationHistory = []; 

app.post('/ask', async (req, res) => {
  const { department, grade, takenCourses, question, previousAnswer } = req.body;

  let prompt = `你是大學課程與職涯顧問，請根據以下學生資料給出實用建議：\n
主修學系：${department}\n
年級：${grade}\n
已修課程：${takenCourses}\n
學生問題：${question}`;

  if (previousAnswer) {
    prompt = `以下是學生先前的問題與回答：\n問題：${question}\n回答：${previousAnswer}\n
現在請根據這些資訊進一步回答學生的問題。`;
  }

  // ✅ 顯示 prompt 到 console
  console.log('🔥 傳送的 prompt：\n', prompt);

  try {
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

    const answer = response.data.choices[0].message.content;
    conversationHistory.push({ role: 'user', content: question });
    conversationHistory.push({ role: 'assistant', content: answer });

    res.json({ answer });

  } catch (error) {
    console.error('❌ OpenRouter 錯誤:', error.response?.data || error.message);
    res.status(500).json({ error: 'API 錯誤，請稍後再試。' });
  }
});


app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});