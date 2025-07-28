const express = require("express");
const router = express.Router();
const { authenticateToken } = require("./middlewarecheck/middleware");
const MultiUserRAGSystem = require("./rag/MultiUserRAGSystem");
const ragSystem = new MultiUserRAGSystem();

// 主要 router：直接用 RAG Engine 回答
router.post("/askai", authenticateToken, async (req, res) => {
  try {
    const { synopsisString, engineId } = req.body;
    const userId = req.user.userId;

    if (!synopsisString || !engineId) {
      return res.status(400).json({
        success: false,
        message: "synopsisString 和 engineId 都是必填欄位",
      });
    }

    // 建構給 AI 的提示詞
    const aiPrompt = `請基於以下劇情概要結構，生成一個專業的詳細的電影劇本（Movie Script）。請確保劇本格式正確，包含場景描述、角色對話、動作指示等專業電影劇本元素：\n\n${synopsisString}\n\n請生成一個完整的電影劇本，包含：\n1. 正確的劇本格式（場景標題、角色名稱、對話、動作描述）\n2. 詳細的場景描述和角色動作\n3. 自然流暢的角色對話\n4. 適當的場景轉換\n5. 專業的劇本結構\n\n劇本應該適合拍攝製作使用。除了使用RAG Engine裡面的文件內容，你可以使用你的知識和經驗來生成劇本。請確保劇本符合專業標準，並遵循電影劇本的格式，並包含場景描述、角色對話、動作指示等專業電影劇本元素，劇本應該足夠長，每一個片段（SCENE）都不能太短。`;

    // 用包裝後的 prompt 送給 RAG query function
    const result = await ragSystem.queryUserRAG(userId, aiPrompt, engineId);

    if (result.success) {
      res.json({
        success: true,
        message: "AI 回答成功",
        aiProcessedOutput: result.answer || result.data || result.response,
        originalInput: synopsisString,
      });
    } else {
      res.status(500).json({
        success: false,
        message: result.error || "RAG 回答失敗",
      });
    }
  } catch (error) {
    console.error("Full error:", error);
    res.status(500).json({
      success: false,
      message: "Error processing movie script",
      error: error.message,
      details: error.details || "Unknown error",
    });
  }
});

module.exports = router;
