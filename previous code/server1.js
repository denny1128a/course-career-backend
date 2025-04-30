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
    return res.status(429).json({ error: '目前使用人數過多，請稍後再試。' });
  }

  const { department, grade, takenCourses, question } = req.body;

  if (!question) {
    return res.status(400).json({ error: '請提供問題描述' });
  }

  // 組合 prompt 給 OpenAI
  const fullPrompt = `
你是中央大學的選課與生涯輔導員，請根據以下資訊給出具體建議：
- 主修學系：${department || '未填寫'}
- 年級：${grade || '未填寫'}
- 已修課程：${takenCourses || '未填寫'}
- 學生問題或說明：${question}

請列出建議的課程方向、可能的能力養成方向與生涯出路。請用條列方式說明，避免使用過於制式的回覆。
  `;

  try {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: '你是大學選課與職涯規劃顧問，請根據學生背景提供清楚具體的建議。' },
          { role: 'user', content: fullPrompt }
        ],
        temperature: 0.7
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
      isCoolingDown = true;
      setTimeout(() => {
        isCoolingDown = false;
      }, 30000);
      console.error('⚠️ OpenAI 429: Too many requests - Cooling down...');
      return res.status(429).json({ error: '伺服器繁忙，請稍後再試。' });
    }

    console.error('❌ OpenAI API 錯誤:', error.response?.data || error.message);
    res.status(500).json({ error: '無法產生建議，請稍後再試。' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 後端伺服器啟動成功：http://localhost:${PORT}`);
});
