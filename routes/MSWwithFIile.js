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

    // 直接用 RAG query function
    const result = await ragSystem.queryUserRAG(
      userId,
      synopsisString,
      engineId
    );

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
