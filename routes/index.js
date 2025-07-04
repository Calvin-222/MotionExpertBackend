var express = require("express");
var router = express.Router();
const { pool } = require("../config/database");
const { VertexAI } = require("@google-cloud/vertexai");
//waghaha
// Initialize Vertex AI
const vertexAI = new VertexAI({
  project: process.env.GOOGLE_CLOUD_PROJECT,
  location: process.env.GOOGLE_CLOUD_LOCATION || "us-central1",
});

// Set up generation config
const generationConfig = {
  maxOutputTokens: 8192,
  temperature: 1,
  topP: 1,
};

// 安全設定
const safetySettings = [
  {
    category: "HARM_CATEGORY_HATE_SPEECH",
    threshold: "BLOCK_NONE",
  },
  {
    category: "HARM_CATEGORY_DANGEROUS_CONTENT",
    threshold: "BLOCK_NONE",
  },
  {
    category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
    threshold: "BLOCK_NONE",
  },
  {
    category: "HARM_CATEGORY_HARASSMENT",
    threshold: "BLOCK_NONE",
  },
];

/* GET home page. */
router.get("/", function (req, res, next) {
  res.render("index", { title: "Motion Expert Backend" });
});

/* GET API health check */
router.get("/api/health", function (req, res, next) {
  res.json({
    success: true,
    status: "healthy",
    message: "MotionExpert Backend is running",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: "1.0.0",
  });
});

/* GET API status check */
router.get("/api/status", function (req, res, next) {
  res.json({
    success: true,
    status: "operational",
    services: {
      database: "connected",
      vertexAI: "available",
      ragSystem: "operational",
    },
    timestamp: new Date().toISOString(),
  });
});

/* GET test API endpoint */
router.get("/api/test", function (req, res, next) {
  res.json({
    success: true,
    message: "API is working!",
    timestamp: new Date().toISOString(),
    availableServices: {
      basicGeneration: "/api/generate",
      synopsis: "/api/synopsis",
      synopsisFollowUp: "/api/synopsis/follow-up",
      ragServices: "/api/rag/*",
    },
  });
});

/* POST API for Vertex AI content generation */
router.post("/api/generate", async function (req, res, next) {
  try {
    console.log("正在初始化 Vertex AI...");

    const { prompt } = req.body;

    if (!prompt) {
      return res.status(400).json({
        success: false,
        error: "Prompt is required",
      });
    }

    const generativeModel = vertexAI.getGenerativeModel({
      model: "gemini-2.5-flash-preview-05-20",
      generationConfig: generationConfig,
      safetySettings: safetySettings,
    });

    console.log("正在生成內容...");

    const result = await generativeModel.generateContentStream(prompt);

    let generatedText = "";

    for await (const chunk of result.stream) {
      if (
        chunk.candidates &&
        chunk.candidates[0] &&
        chunk.candidates[0].content
      ) {
        const parts = chunk.candidates[0].content.parts;
        for (const part of parts) {
          if (part.text) {
            generatedText += part.text;
          }
        }
      }
    }

    console.log("生成完成");

    res.json({
      success: true,
      text: generatedText,
      prompt: prompt,
    });
  } catch (error) {
    console.error("Vertex AI 錯誤:", error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      details: error.details || "Unknown error",
    });
  }
});

/* 新增：POST API for Synopsis processing - 處理完整的劇情概要 */
router.post("/api/synopsis", async function (req, res, next) {
  try {
    console.log("正在處理劇情概要...");

    const { synopsisString } = req.body;

    if (!synopsisString) {
      return res.status(400).json({
        success: false,
        message: "Synopsis string is required",
      });
    }

    // 建構給 AI 的提示詞 - 直接要求生成電影劇本
    const aiPrompt = `請基於以下劇情概要結構，生成一個專業的詳細的電影劇本（Movie Script）。請確保劇本格式正確，包含場景描述、角色對話、動作指示等專業電影劇本元素：

${synopsisString}

請生成一個完整的電影劇本，包含：
1. 正確的劇本格式（場景標題、角色名稱、對話、動作描述）
2. 詳細的場景描述和角色動作
3. 自然流暢的角色對話
4. 適當的場景轉換
5. 專業的劇本結構

劇本應該適合拍攝製作使用。`;

    const generativeModel = vertexAI.getGenerativeModel({
      model: "gemini-2.5-flash-preview-05-20",
      generationConfig: generationConfig,
      safetySettings: safetySettings,
    });

    console.log("正在生成電影劇本...");

    const result = await generativeModel.generateContentStream(aiPrompt);

    let generatedText = "";

    for await (const chunk of result.stream) {
      if (
        chunk.candidates &&
        chunk.candidates[0] &&
        chunk.candidates[0].content
      ) {
        const parts = chunk.candidates[0].content.parts;
        for (const part of parts) {
          if (part.text) {
            generatedText += part.text;
          }
        }
      }
    }

    console.log("電影劇本生成完成");

    res.json({
      success: true,
      message: "Movie script generated successfully",
      aiProcessedOutput: generatedText,
      originalInput: synopsisString,
    });
  } catch (error) {
    console.error("電影劇本處理錯誤:", error.message);
    res.status(500).json({
      success: false,
      message: "Error processing movie script",
      error: error.message,
      details: error.details || "Unknown error",
    });
  }
});

/* 新增：POST API for Synopsis follow-up - 處理後續指令 */
router.post("/api/synopsis/follow-up", async function (req, res, next) {
  try {
    console.log("正在處理劇本後續指令...");

    const { followUpString } = req.body;

    if (!followUpString) {
      return res.status(400).json({
        success: false,
        message: "Follow-up instruction is required",
      });
    }

    // 建構給 AI 的後續提示詞 - 針對劇本進行修改
    const aiPrompt = `用戶對之前生成的電影劇本有以下後續指令或修改要求，請基於這些要求調整劇本內容：

用戶指令：${followUpString}

請提供相應的劇本修改或重新生成符合要求的劇本內容。保持專業的劇本格式和結構。`;

    const generativeModel = vertexAI.getGenerativeModel({
      model: "gemini-2.5-flash-preview-05-20",
      generationConfig: generationConfig,
      safetySettings: safetySettings,
    });

    console.log("正在處理劇本後續指令...");

    const result = await generativeModel.generateContentStream(aiPrompt);

    let generatedText = "";

    for await (const chunk of result.stream) {
      if (
        chunk.candidates &&
        chunk.candidates[0] &&
        chunk.candidates[0].content
      ) {
        const parts = chunk.candidates[0].content.parts;
        for (const part of parts) {
          if (part.text) {
            generatedText += part.text;
          }
        }
      }
    }

    console.log("劇本後續指令處理完成");

    res.json({
      success: true,
      message: "Script follow-up processed successfully",
      aiProcessedOutput: generatedText,
      originalFollowUp: followUpString,
    });
  } catch (error) {
    console.error("劇本後續指令處理錯誤:", error.message);
    res.status(500).json({
      success: false,
      message: "Error processing script follow-up",
      error: error.message,
      details: error.details || "Unknown error",
    });
  }
});

/* GET API for simple Vertex AI test */
router.get("/api/test-vertex", async function (req, res, next) {
  try {
    console.log("正在測試 Vertex AI 連接...");

    const generativeModel = vertexAI.getGenerativeModel({
      model: "gemini-2.5-flash-preview-05-20",
      generationConfig: generationConfig,
      safetySettings: safetySettings,
    });

    const testPrompt = "Hello! Please introduce yourself in one sentence.";
    const result = await generativeModel.generateContentStream(testPrompt);

    let generatedText = "";

    for await (const chunk of result.stream) {
      if (
        chunk.candidates &&
        chunk.candidates[0] &&
        chunk.candidates[0].content
      ) {
        const parts = chunk.candidates[0].content.parts;
        for (const part of parts) {
          if (part.text) {
            generatedText += part.text;
          }
        }
      }
    }

    res.json({
      success: true,
      text: generatedText,
      message: "Vertex AI connection test successful!",
    });
  } catch (error) {
    console.error("Vertex AI 測試錯誤:", error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      details: error.details || "Unknown error",
    });
  }
});

/* GET API to check current model */
router.get("/api/model-info", function (req, res, next) {
  res.json({
    success: true,
    currentModel: "gemini-2.5-flash-preview-05-20",
    modelType: "Gemini 2.5 Flash Preview",
    description: "Latest Gemini 2.5 Flash preview model with RAG capabilities",
    timestamp: new Date().toISOString(),
    ragEnabled: true,
  });
});

router.get('/api/add-friends', async (req, res) => {
  try {
    const searchTerm = req.query.search || '';
    
    let query = 'SELECT userid, username, created_at FROM users';
    let queryParams = [];
    
    if (searchTerm) {
      query += ' WHERE username LIKE ?';
      queryParams.push(`%${searchTerm}%`);
    }
    
    query += ' ORDER BY created_at DESC LIMIT 50';
    
    const [users] = await pool.execute(query, queryParams);
    
    res.json({
      success: true,
      users: users,
      count: users.length
    });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error' 
    });
  }
});

module.exports = router;
