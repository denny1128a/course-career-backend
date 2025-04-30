const express = require('express');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

let isCoolingDown = false; // 防呆機制：檢查是否處於冷卻狀態

app.post('/ask', async (req, res) => {
  if (isCoolingDown) {
    return res.status(429).json({ error: '請稍後再試' });
  }
  const { question } = req.body;

  if (!question) {
    return res.status(400).json({ error: '請提供學生問題內容' });
  }

  try {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: '你是大學選課與生涯規劃輔導員，會根據學生問題提供實用建議。' },
          { role: 'user', content: question }
        ]
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const answer = response.data.choices[0].message.content;
    res.json({ answer });
  } catch (error) {
    if (error.response && error.response.status === 429) {
      isCoolingDown = true; // 啟動冷卻機制
      setTimeout(() => {
        isCoolingDown = false; // 冷卻結束，允許再次發送請求
      }, 30000); // 30秒後冷卻結束
    }
    console.error('OpenAI API 錯誤:', error.message);
    res.status(500).json({ error: '後端錯誤，請稍後再試。' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});