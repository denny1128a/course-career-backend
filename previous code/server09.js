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

// [新增] 檢查問題是否與選課或職涯相關
function isQuestionRelevant(question) {
  const keywords = [
    '課程', '選課', '課', '學', '學習', '修', '職涯', '職業', '工作', 
    '規劃', '建議', '推薦', '分析', '程式', '資料', '數據', '工程', 
    '管理', '設計', '技能', '實習', '面試', '準備'
  ];
  const lowerQuestion = question.toLowerCase();
  return keywords.some(keyword => lowerQuestion.includes(keyword));
}

// 主要處理請求的 API
app.post('/ask', async (req, res) => {
  const { department, grade, takenCourses, question, followupQuestion, previousAnswer, isFollowup } = req.body;

  // 驗證必填字段
  if (!department || !grade || !takenCourses || !question) {
    return res.status(400).json({ error: '缺少必要的資料，請確認所有欄位都已填寫。' });
  }

  // [新增] 檢查問題相關性
  if (!isFollowup && !isQuestionRelevant(question)) {
    return res.status(400).json({ error: '請問與課程或職涯相關的問題' });
  }
  if (isFollowup && (!followupQuestion || !isQuestionRelevant(followupQuestion))) {
    return res.status(400).json({ error: '請問與課程或職涯相關的問題' });
  }

  // 檢索相關課程，優先匹配 course_name 和 department
  const relevantCourses = allCourses.filter(course => {
    const courseName = course.course_name.toLowerCase();
    const departmentMatch = course.department?.toLowerCase().includes(department.toLowerCase());
    const questionMatch = courseName.includes(question.toLowerCase());
    const takenMatch = takenCourses.toLowerCase().includes(courseName);
    const contentMatch = course.course_content_zh?.toLowerCase().includes(question.toLowerCase());
    return (departmentMatch || questionMatch || takenMatch) && (!contentMatch || (departmentMatch || questionMatch));
  }).sort((a, b) => b.semester.localeCompare(a.semester)).slice(0, 5);

  console.log('檢索到的課程：', relevantCourses.map(c => `${c.course_name} (${c.semester})`));

  // 更新 Prompt
  let prompt = '';
  if (isFollowup) {
    if (!previousAnswer) {
      return res.status(400).json({ error: '追問缺少必要資料，請確保已提交初始問題並輸入追問內容。' });
    }
    // [改進] 移除追問的課程格式要求，允許自由回應
    prompt = `你是大學課程與職涯顧問，請根據以下學生資料和課程資料（涵蓋多學年），延續上一次的建議回答追問。請提供清晰、易讀的回應，使用標題和分段，可自由回答（例如補充課程細節、職涯建議或其他相關資訊）。回應應基於提供的課程資料，但不需強制列出課程清單。

學生資料：
- 主修學系：${department}
- 年級：${grade}
- 已修課程：${takenCourses}

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
- 主修學系：${department}
- 年級：${grade}
- 已修課程：${takenCourses}
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
console.log("客戶端輸出的prompt:",prompt)
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
      // [改進] 追問無課程清單，直接返回 advice
      return res.json({
        followupResult: aiAdvice.advice || { title: '追問回應', content: '無 AI 建議' }
      });
    }

    // 驗證課程名稱是否來自資料庫
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