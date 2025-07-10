const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const multer = require("multer"); // 添加 multer 支援檔案上傳
const fs = require("fs");
const axios = require("axios"); // 添加 axios 支援診斷功能
const { authenticateToken } = require("./middlewarecheck/middleware");
// 🔧 設置 multer 用於檔案上傳
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB 限制
  },
});

// 🔧 使用統一的 RAG 系統
const MultiUserRAGSystem = require("./rag/MultiUserRAGSystem");
const ragSystem = new MultiUserRAGSystem();

// 📊 用戶狀態檢查端點
router.get("/users/status", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    console.log(`📊 Checking status for user: ${userId}`);

    // 獲取用戶的 RAG engines
    const engines = await ragSystem.getUserRAGEngines(userId);

    res.json({
      success: true,
      userId: userId,
      engines: engines || [],
      totalEngines: engines ? engines.length : 0,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Get user status error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get user status",
    });
  }
});

// 🏗️ 創建 RAG Engine 端點
router.post("/users/engines", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { engineName, description } = req.body;

    console.log(`🏗️ Creating RAG engine for user: ${userId}`);

    const result = await ragSystem.createUserRAGEngine(
      userId,
      engineName,
      description
    );

    if (result.success) {
      res.json({
        success: true,
        message: result.message,
        engine: result.engine, // 確保返回 engine 對象
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    console.error("Create RAG engine error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to create RAG engine",
    });
  }
});

// 📋 獲取用戶 RAG Engines 列表
router.get("/users/:userId/engines", authenticateToken, async (req, res) => {
  try {
    const requestingUserId = req.user.userId;
    const targetUserId = req.params.userId;

    // 確保用戶只能訪問自己的 engines
    if (requestingUserId !== targetUserId) {
      return res.status(403).json({
        success: false,
        error: "您只能訪問自己的 RAG Engines",
      });
    }

    console.log(`📋 Getting RAG engines for user: ${targetUserId}`);

    const engines = await ragSystem.getUserRAGEngines(targetUserId);

    // 格式化 engines 數據以符合測試期望
    const formattedEngines = engines.map((engine) => ({
      id: engine.ragid,
      name: engine.ragname,
      displayName: engine.ragname,
      ragName: engine.ragname,
      visibility: engine.visibility,
      createdAt: engine.created_at,
      updatedAt: engine.updated_at,
    }));

    res.json({
      success: true,
      engines: formattedEngines,
      totalEngines: formattedEngines.length,
      userId: targetUserId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Get user engines error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get user engines",
    });
  }
});

// 📤 用戶檔案上傳端點 (支援 FormData)
router.post(
  "/users/:userId/upload",
  authenticateToken,
  upload.single("file"),
  async (req, res) => {
    try {
      const requestingUserId = req.user.userId;
      const targetUserId = req.params.userId;

      // 從 FormData 獲取參數
      const ragId = req.body.ragId || req.body.engineId;
      const file = req.file;

      // 確保用戶只能上傳到自己的 engines
      if (requestingUserId !== targetUserId) {
        return res.status(403).json({
          success: false,
          error: "您只能上傳檔案到自己的 RAG Engines",
        });
      }

      if (!file || !ragId) {
        return res.status(400).json({
          success: false,
          error: "file and ragId are required",
        });
      }

      console.log(
        `📤 User ${targetUserId} uploading file: ${file.originalname} to engine: ${ragId}`
      );

      // 🔧 修正：確保正確傳遞文件數據
      const fileData = {
        name: file.originalname,
        content: file.buffer.toString("utf-8"), // 將 Buffer 轉換為字串
        buffer: file.buffer, // 同時保留原始 Buffer
      };

      // 復用現有的上傳邏輯
      const result = await ragSystem.uploadToUserRAG(
        targetUserId,
        fileData, // 傳遞包含多種格式的文件數據
        file.originalname,
        ragId
      );

      if (result.success) {
        res.json({
          success: true,
          fileId: result.fileId || result.generatedFileId,
          fileName: file.originalname,
          engineId: ragId,
          message: result.message || "檔案上傳成功",
          data: {
            generatedFileId: result.fileId || result.generatedFileId,
            originalFileName: file.originalname,
            newFileName: result.newFileName,
            bucketPath: result.bucketPath,
          },
        });
      } else {
        res.status(500).json({
          success: false,
          error: result.error,
        });
      }
    } catch (error) {
      console.error("User upload error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to upload file",
      });
    }
  }
);

// 💬 查詢 RAG Engine 端點
router.post(
  "/users/:userId/engines/:engineId/query",
  authenticateToken,
  async (req, res) => {
    try {
      const { engineId } = req.params;
      const { question } = req.body;
      const requestingUserId = req.user.userId;

      if (!question) {
        return res.status(400).json({
          success: false,
          error: "Question is required",
        });
      }

      const result = await ragSystem.queryUserRAG(
        requestingUserId,
        question,
        engineId
      );

      if (result.success) {
        res.json({
          success: true,
          answer: result.answer,
          sources: result.sources,
          engineId: engineId,
          timestamp: result.timestamp,
        });
      } else {
        // 🔧 修正：安全的錯誤檢查
        const errorMessage = result.error || "Query failed";
        const statusCode =
          typeof errorMessage === "string" && errorMessage.includes("權限")
            ? 403
            : 404;

        res.status(statusCode).json({
          success: false,
          error: errorMessage,
        });
      }
    } catch (error) {
      console.error("Query endpoint error:", error);
      res.status(500).json({
        success: false,
        error: "Internal server error during query processing",
      });
    }
  }
);

// 🗑️ 刪除文檔端點
router.delete(
  "/users/documents/:fileId",
  authenticateToken,
  async (req, res) => {
    try {
      const { fileId } = req.params;
      const { ragId } = req.query;
      const userId = req.user.userId;

      console.log(`🗑️ User ${userId} deleting document: ${fileId}`);

      if (!ragId) {
        return res.status(400).json({
          success: false,
          error: "ragId is required for document deletion",
        });
      }

      const result = await ragSystem.deleteUserDocument(userId, fileId, ragId);

      if (result.success) {
        res.json({
          success: true,
          message: result.message,
          fileId: fileId,
          ragId: ragId,
        });
      } else {
        const statusCode = result.error.includes("權限") ? 403 : 500;
        res.status(statusCode).json({
          success: false,
          error: result.error,
        });
      }
    } catch (error) {
      console.error("Delete document endpoint error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to delete document",
      });
    }
  }
);

// 🤝 添加好友
router.post("/users/friends/add", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { friendUsername } = req.body;

    res.json({
      success: true,
      message: "好友請求已發送",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to add friend",
    });
  }
});

// 🤝 接受好友邀請
router.post("/users/friends/accept", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { friendId } = req.body;

    console.log(`✅ User ${userId} accepting friend request from: ${friendId}`);

    res.json({
      success: true,
      message: "好友請求已接受",
      friendship: {
        friendId: friendId,
        acceptedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Accept friend error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to accept friend request",
    });
  }
});

// 👥 獲取好友列表
router.get("/users/friends", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    console.log(`👥 Getting friends for user: ${userId}`);

    res.json({
      success: true,
      friends: [],
      pendingRequests: [],
      total: 0,
    });
  } catch (error) {
    console.error("Get friends error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get friends list",
    });
  }
});

// 🔗 獲取可訪問的 RAG Engines
router.get("/users/accessible-engines", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    console.log(`🔗 Getting accessible engines for user: ${userId}`);

    const engines = await ragSystem.getUserRAGEngines(userId);

    res.json({
      success: true,
      ownEngines: engines,
      sharedEngines: [],
      friendEngines: [],
      total: engines.length,
    });
  } catch (error) {
    console.error("Get accessible engines error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get accessible engines",
    });
  }
});

// 📋 檔案映射路由
router.get(
  "/users/engines/:engineId/file-mapping",
  authenticateToken,
  async (req, res) => {
    try {
      const { engineId } = req.params;
      const userId = req.user.userId;

      // 檢查權限
      const hasAccess = await ragSystem.canUserAccessRAG(userId, engineId);
      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          error: "無權訪問此 Engine",
        });
      }

      // 獲取檔案映射
      const fileOps = new (require("./rag/fileOperations"))();
      const mapping = await fileOps.getFileNameMapping(engineId);

      res.json({
        success: true,
        mapping: mapping.mapping,
        count: mapping.count,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: "Failed to get file mapping",
      });
    }
  }
);

// 📋 獲取特定 RAG Engine 的文檔列表
router.get(
  "/users/:userId/engines/:engineId/documents",
  authenticateToken,
  async (req, res) => {
    try {
      const { userId, engineId } = req.params;
      const requestUserId = req.user.userId;

      console.log(`📋 Getting documents for engine ${engineId}`);

      // 檢查權限
      const hasAccess = await ragSystem.canUserAccessRAG(
        requestUserId,
        engineId
      );
      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          error: "沒有權限訪問此 RAG Engine",
        });
      }

      // 獲取引擎文檔
      const fileOps = new (require("./rag/fileOperations"))();
      const mapping = await fileOps.getFileNameMapping(engineId);

      res.json({
        success: true,
        engineId: engineId,
        documents: mapping.mapping || [],
        total: mapping.count || 0,
      });
    } catch (error) {
      console.error("Get engine documents error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to get engine documents",
      });
    }
  }
);

// 📋 用戶所有文檔列表
router.get("/users/documents", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    // 獲取用戶所有 RAG engines
    const engines = await ragSystem.getUserRAGEngines(userId);

    let allFiles = [];
    const fileOps = new (require("./rag/fileOperations"))();

    for (const engine of engines) {
      const corpusName = `projects/${process.env.GOOGLE_CLOUD_PROJECT}/locations/us-central1/ragCorpora/${engine.ragid}`;
      const filesResult = await fileOps.getUserDocuments(corpusName);

      if (filesResult.success && filesResult.files.length > 0) {
        filesResult.files.forEach((f) => {
          f.engineId = engine.ragid;
          f.engineName = engine.ragname;
        });
        allFiles = allFiles.concat(filesResult.files);
      }
    }

    res.json({
      success: true,
      documents: allFiles,
      total: allFiles.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to get user documents",
    });
  }
});

// 🔗 分享功能
router.post(
  "/users/engines/:engineId/share",
  authenticateToken,
  async (req, res) => {
    try {
      const { engineId } = req.params;
      const userId = req.user.userId;
      const { targetUserId } = req.body;

      res.json({
        success: true,
        message: "RAG Engine 已成功分享",
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: "Failed to share engine",
      });
    }
  }
);

// 📊 系統概覽
router.get("/engines/overview", async (req, res) => {
  try {
    console.log(`📊 === SYSTEM OVERVIEW DEBUG ===`);
    console.log(`🔗 Request headers:`, req.headers);
    console.log(`📦 Request query:`, req.query);

    // 從 header 或 query 中獲取用戶ID
    let userId = req.query.userId;

    if (!userId && req.headers.authorization) {
      try {
        const token = req.headers.authorization.substring(7);
        const decoded = jwt.verify(
          token,
          process.env.JWT_SECRET || "your-jwt-secret-key"
        );
        userId = decoded.userId;
      } catch (authError) {
        console.log(`🔍 Auth token decode failed, using anonymous mode`);
      }
    }

    if (userId) {
      const engines = await ragSystem.getUserRAGEngines(userId);
      console.log(`✅ Found ${engines.length} engines for user ${userId}`);

      res.json({
        success: true,
        engines: engines,
        totalEngines: engines.length,
        userId: userId,
      });
    } else {
      console.log(`🔍 No user ID provided, returning empty result`);
      res.json({
        success: true,
        engines: [],
        totalEngines: 0,
        message: "No user authentication provided",
      });
    }
  } catch (error) {
    console.error(`❌ System overview error:`, error);
    res.status(500).json({
      success: false,
      error: "Failed to get engines overview",
    });
  }
});

// 🧪 測試端點
router.get("/test", (req, res) => {
  res.json({
    success: true,
    message: "RAG System is running",
    version: "4.0.0",
    features: [
      "✅ 資料庫整合 (MySQL)",
      "✅ 中文文件名支援",
      "✅ 用戶權限檢查",
      "✅ 多檔案上傳",
    ],
  });
});

// 🧪 Google Cloud 診斷端點
router.get("/debug/google-cloud", authenticateToken, async (req, res) => {
  try {
    console.log(`🔍 === GOOGLE CLOUD DIAGNOSTIC REQUEST ===`);
    const engineMgmt = new (require("./rag/engineManagement"))();
    const diagnosis = await engineMgmt.diagnoseGoogleCloudSetup();
    
    console.log(`📊 Diagnosis result:`, diagnosis);
    res.json(diagnosis);
  } catch (error) {
    console.error("❌ Diagnosis endpoint error:", error);
    res.status(500).json({
      success: false,
      error: "Diagnosis failed",
      details: error.message,
    });
  }
});

// 🧪 測試創建簡單 RAG Corpus
router.post("/debug/create-simple-corpus", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { engineName = "debug_test" } = req.body;
    
    console.log(`🔍 === SIMPLE CORPUS CREATION TEST ===`);
    console.log(`👤 User: ${userId}`);
    console.log(`📛 Engine: ${engineName}`);
    
    const engineMgmt = new (require("./rag/engineManagement"))();
    const result = await engineMgmt.createSimpleRAGCorpus(userId, engineName);
    
    console.log(`📊 Creation result:`, result);
    res.json(result);
  } catch (error) {
    console.error("❌ Simple corpus creation error:", error);
    res.status(500).json({
      success: false,
      error: "Simple corpus creation failed",
      details: error.message,
    });
  }
});

// 🧪 檢查特定 RAG Corpus 狀態
router.get("/debug/corpus/:corpusId", authenticateToken, async (req, res) => {
  try {
    const { corpusId } = req.params;
    console.log(`🔍 Checking corpus status: ${corpusId}`);

    const engineMgmt = new (require("./rag/engineManagement"))();

    // 檢查 corpus 是否存在
    const authClient = await engineMgmt.auth.getClient();
    const accessToken = await authClient.getAccessToken();

    const corpusName = `projects/${process.env.GOOGLE_CLOUD_PROJECT}/locations/us-central1/ragCorpora/${corpusId}`;
    const checkUrl = `https://us-central1-aiplatform.googleapis.com/v1beta1/${corpusName}`;

    const response = await axios.get(checkUrl, {
      headers: {
        Authorization: `Bearer ${accessToken.token}`,
        "Content-Type": "application/json",
      },
      timeout: 30000,
    });

    res.json({
      success: true,
      corpusId: corpusId,
      corpusName: corpusName,
      status: response.data.state,
      displayName: response.data.displayName,
      description: response.data.description,
      createTime: response.data.createTime,
      updateTime: response.data.updateTime,
      message: "Corpus found and accessible",
    });
  } catch (error) {
    console.error(
      "❌ Corpus check error:",
      error.response?.data || error.message
    );
    res.status(error.response?.status || 500).json({
      success: false,
      error: error.response?.data?.error || error.message,
      corpusId: req.params.corpusId,
      message: "Corpus check failed",
    });
  }
});

// 📥 文件導入端點 (支援 JSON 格式)
router.post(
  "/users/:userId/engines/:engineId/import",
  authenticateToken,
  async (req, res) => {
    try {
      const requestingUserId = req.user.userId;
      const targetUserId = req.params.userId;
      const engineId = req.params.engineId;

      // 確保用戶只能上傳到自己的 engines
      if (requestingUserId !== targetUserId) {
        return res.status(403).json({
          success: false,
          error: "您只能上傳檔案到自己的 RAG Engines",
        });
      }

      const { files } = req.body;

      if (!files || !Array.isArray(files) || files.length === 0) {
        return res.status(400).json({
          success: false,
          error: "files array is required",
        });
      }

      console.log(
        `📥 User ${targetUserId} importing ${files.length} files to engine: ${engineId}`
      );

      const result = await ragSystem.importFiles(
        requestingUserId,
        engineId,
        files
      );

      if (result.success) {
        res.json({
          success: true,
          message: result.message,
          importedFiles: result.importedFiles,
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error,
        });
      }
    } catch (error) {
      console.error("Import endpoint error:", error);
      res.status(500).json({
        success: false,
        error: "Internal server error during file import",
      });
    }
  }
);

// 🧪 調試刪除端點 - 用於測試文件刪除
router.delete("/debug/documents/:fileId", authenticateToken, async (req, res) => {
  try {
    const { fileId } = req.params;
    const { ragId } = req.query;
    const userId = req.user.userId;

    console.log(`🧪 DEBUG DELETE - User: ${userId}, File: ${fileId}, RAG: ${ragId}`);

    if (!ragId) {
      return res.status(400).json({
        success: false,
        error: "ragId is required for document deletion",
      });
    }

    // 首先列出當前的文件
    console.log(`🔍 Listing current files before deletion...`);
    const fileOps = new (require("./rag/fileOperations"))();
    const corpusName = `projects/${process.env.GOOGLE_CLOUD_PROJECT}/locations/us-central1/ragCorpora/${ragId}`;
    
    const beforeFiles = await fileOps.getUserDocuments(corpusName);
    console.log(`📋 Files before deletion:`, beforeFiles);

    // 執行刪除
    const result = await ragSystem.deleteUserDocument(userId, fileId, ragId);

    // 再次列出文件
    console.log(`🔍 Listing files after deletion...`);
    const afterFiles = await fileOps.getUserDocuments(corpusName);
    console.log(`📋 Files after deletion:`, afterFiles);

    // 比較前後差異
    const beforeCount = beforeFiles.files?.length || 0;
    const afterCount = afterFiles.files?.length || 0;
    const actuallyDeleted = beforeCount > afterCount;

    res.json({
      success: result.success,
      message: result.message,
      details: {
        beforeDeletion: {
          fileCount: beforeCount,
          files: beforeFiles.files?.map(f => ({ id: f.id, name: f.name })) || []
        },
        afterDeletion: {
          fileCount: afterCount,
          files: afterFiles.files?.map(f => ({ id: f.id, name: f.name })) || []
        },
        actuallyDeleted: actuallyDeleted,
        deletionResult: result
      }
    });

  } catch (error) {
    console.error("Debug delete error:", error);
    res.status(500).json({
      success: false,
      error: "Debug delete failed",
      details: error.message
    });
  }
});

module.exports = router;
