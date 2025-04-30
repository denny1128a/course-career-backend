const express = require('express');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

let isCoolingDown = false; // 防止連續呼叫的冷卻狀態

// 將前端傳來的資料組合成 Prompt
function formatPrompt({ department, grade, takenCourses, question }) {
  let prompt = '你是中央大學的選課與生涯輔導員，根據以下學生資料提供具體建議：\n';

  if (department) prompt += `- 主修學系：${department}\n`;
  if (grade) prompt += `- 年級：${grade}\n`;
  if (takenCourses) prompt += `- 已修課程：${takenCourses}\n`;
  if (question) prompt += `- 學生問題：${question}\n`;

  prompt += '\n請推薦學生適合的進修課程與職涯方向，條列回答。';
  return prompt;
}

// 處理前端請求
app.post('/ask', async (req, res) => {
  if (isCoolingDown) {
    return res.status(429).json({ error: '請稍後再試（API冷卻中）' });
  }

  const { department, grade, takenCourses, question } = req.body;

  if (!department && !grade && !takenCourses && !question) {
    return res.status(400).json({ error: '請至少填寫一項學生資料' });
  }

  // MOCK 模式（開發用）
  if (process.env.MODE === 'mock') {
    return res.json({
      answer: `這是模擬建議結果：你可以考慮進修「人工智慧導論」與「資料結構」，並朝資料分析或軟體工程方向發展。`
    });
  }

  const prompt = formatPrompt({ department, grade, takenCourses, question });
  
  console.log('🔥 本次生成的 Prompt：\n', prompt);

  try {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: '你是大學選課與職涯規劃的專家。' },
          { role: 'user', content: prompt }
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
    // 若是 API 配額過多觸發
    if (error.response && error.response.status === 429) {
      isCoolingDown = true;
      console.warn('⚠️ OpenAI API 過載，啟用冷卻機制（30秒）');
      setTimeout(() => {
        isCoolingDown = false;
      }, 30000); // 30秒冷卻
    }

    console.error('🚨 OpenAI API 錯誤:', error.response?.data || error.message);
    res.status(500).json({ error: '後端錯誤，請稍後再試。' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
