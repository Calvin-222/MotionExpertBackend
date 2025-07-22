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

// 🔧 更新 RAG Engine 可見性
router.patch(
  "/users/engines/:engineId/visibility",
  authenticateToken,
  async (req, res) => {
    try {
      const { engineId } = req.params;
      const { visibility } = req.body;
      const userId = req.user.userId;
     
      const result = await ragSystem.updateEngineVisibility(userId, engineId, visibility);

      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      console.error('Error updating engine visibility:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error' 
      });
    }
  }
);

router.post(
  "/users/engines/:engineId/share",
  authenticateToken,
  async (req, res) => {
    try {
      const { engineId } = req.params;
      const ownerId = req.user.userId;
      const { targetUserId } = req.body;

      if (!targetUserId) {
        return res
          .status(400)
          .json({ success: false, error: "targetUserId is required" });
      }

      const EngineManagement = require("./rag/engineManagement");
      const engineMgmt = new EngineManagement();
      const result = await engineMgmt.shareRAGEngineToUser(
        ownerId,
        engineId,
        targetUserId
      );

      if (result.success) {
        res.json({ success: true, message: result.message });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// 📋 獲取用戶 RAG Engines 列表
// router.get("/users/:userId/engines", authenticateToken, async (req, res) => {
//   try {
//     const requestingUserId = req.user.userId;
//     const targetUserId = req.params.userId;

//     // 確保用戶只能訪問自己的 engines
//     if (requestingUserId !== targetUserId) {
//       return res.status(403).json({
//         success: false,
//         error: "您只能訪問自己的 RAG Engines",
//       });
//     }

//     console.log(`📋 Getting RAG engines for user: ${targetUserId}`);

//     const engines = await ragSystem.getUserRAGEngines(targetUserId);

//     // 格式化 engines 數據以符合測試期望
//     const formattedEngines = engines.map((engine) => ({
//       id: engine.ragid,
//       name: engine.ragname,
//       displayName: engine.ragname,
//       ragName: engine.ragname,
//       visibility: engine.visibility,
//       createdAt: engine.created_at,
//       updatedAt: engine.updated_at,
//     }));

//     res.json({
//       success: true,
//       engines: formattedEngines,
//       totalEngines: formattedEngines.length,
//       userId: targetUserId,
//       timestamp: new Date().toISOString(),
//     });
//   } catch (error) {
//     console.error("Get user engines error:", error);
//     res.status(500).json({
//       success: false,
//       error: "Failed to get user engines",
//     });
//   }
// });

router.get("/users/:userId/engines", authenticateToken, async (req, res) => {
  try {
    const requestingUserId = req.user.userId;
    const targetUserId = req.params.userId;

    if (requestingUserId !== targetUserId) {
      return res.status(403).json({
        success: false,
        error: "您只能訪問自己的 RAG Engines",
      });
    }

    // 查詢自己擁有的 engines
    const ownEngines = await ragSystem.getUserRAGEngines(targetUserId);

    // 查詢被分享給我的 engines
     const [sharedRows] = await ragSystem.pool.execute(
      `SELECT r.*, u.username as owner_name, u.userid as owner_id 
       FROM private_rag pr 
       JOIN rag r ON pr.ragid = r.ragid 
       JOIN users u ON r.userid = u.userid 
       WHERE pr.userid = ?`,
      [targetUserId]
    );
    const sharedEngines = sharedRows || [];

    // 合併
    const allEngines = [
      ...ownEngines.map((e) => ({ ...e, isOwner: true, comingFrom: "yourself" })),
      ...sharedEngines.map((e) => ({ ...e, isOwner: false, comingFrom: e.owner_name })),
    ];

    // 格式化
    const formattedEngines = allEngines.map((engine) => ({
      id: engine.ragid,
      name: engine.ragname,
      displayName: engine.ragname,
      ragName: engine.ragname,
      visibility: engine.visibility,
      createdAt: engine.created_at,
      updatedAt: engine.updated_at,
      isOwner: engine.isOwner,
      comingFrom: engine.comingFrom,
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

// 🗑️ 刪除文檔端點 - 修正版
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
        // 🔧 修正：安全的錯誤檢查
        const errorMessage = result.error || "Failed to delete document";
        const statusCode =
          typeof errorMessage === "string" && errorMessage.includes("權限")
            ? 403
            : 500;

        res.status(statusCode).json({
          success: false,
          error: errorMessage,
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
      // const hasAccess = await ragSystem.canUserAccessRAG(
      //   requestUserId,
      //   engineId
      // );
      // if (!hasAccess) {
      //   return res.status(403).json({
      //     success: false,
      //     error: "沒有權限訪問此 RAG Engine",
      //   });
      // }

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


// 🗑️ 刪除 RAG Engine 端點
router.delete(
  "/users/:userId/engines/:engineId",
  authenticateToken,
  async (req, res) => {
    try {
      const { userId, engineId } = req.params;
      const requestingUserId = req.user.userId;

      // 確保用戶只能刪除自己的 engines
      if (requestingUserId !== userId) {
        return res.status(403).json({
          success: false,
          error: "您只能刪除自己的 RAG Engines",
        });
      }

      console.log(`🗑️ User ${userId} deleting RAG engine: ${engineId}`);

      // 構建 corpus 名稱
      const corpusName = `projects/${process.env.GOOGLE_CLOUD_PROJECT}/locations/us-central1/ragCorpora/${engineId}`;

      // 🔧 修正：直接使用 engineManagement
      const EngineManagement = require("./rag/engineManagement");
      const engineMgmt = new EngineManagement();
      const result = await engineMgmt.deleteUserRAGEngine(corpusName, userId);

      if (result.success) {
        res.json({
          success: true,
          message: result.message,
          engineId: engineId,
          deletedEngine: result.deletedEngine,
        });
      } else {
        const errorMessage = result.error || "Failed to delete RAG engine";
        const statusCode =
          typeof errorMessage === "string" && errorMessage.includes("權限")
            ? 403
            : 500;

        res.status(statusCode).json({
          success: false,
          error: errorMessage,
        });
      }
    } catch (error) {
      console.error("Delete RAG engine endpoint error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to delete RAG engine",
      });
    }
  }
);

module.exports = router;
