const express = require("express");
const router = express.Router();
const multer = require("multer");
const axios = require("axios");

// 導入模組化的 RAG 系統
const { MultiUserRAGSystem, authenticateToken, config } = require("./rag/");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

// 從配置中獲取常數
const { PROJECT_ID, LOCATION, auth } = config;

// 初始化 RAG 系統實例
const ragSystem = new MultiUserRAGSystem();

// 📋 獲取所有 RAG Engines 概覽
router.get("/engines/overview", async (req, res) => {
  try {
    const result = await ragSystem.listAllRAGEngines();
    if (result.success) {
      res.json({
        success: true,
        engines: result.engines,
        totalEngines: result.totalEngines,
        dbEngines: result.dbEngines,
        timestamp: result.timestamp,
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error,
        userMessage: result.userMessage || "獲取 RAG Engines 失敗",
      });
    }
  } catch (error) {
    console.error("Get engines overview error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// 👤 用戶專屬文檔上傳 - 修正路由（支持指定 ragId）
router.post(
  "/users/:userId/upload",
  authenticateToken,
  upload.single("file"),
  async (req, res) => {
    try {
      const userId = req.params.userId || req.user.userId;
      const file = req.file;
      const { ragId } = req.body; // 可選的 ragId 參數

      if (!file) {
        return res.status(400).json({
          success: false,
          message: "No file uploaded",
        });
      }

      console.log(
        `📤 User ${userId} uploading file: ${file.originalname} (${file.size} bytes)`
      );

      // 🔧 修正中文檔案名編碼問題
      let correctedFileName = file.originalname;
      try {
        // 嘗試修正 UTF-8 雙重編碼問題
        const buffer = Buffer.from(file.originalname, "latin1");
        correctedFileName = buffer.toString("utf8");
        console.log(`📝 Original filename: ${file.originalname}`);
        console.log(`📝 Corrected filename: ${correctedFileName}`);
      } catch (error) {
        console.log(
          `⚠️ Filename encoding correction failed, using original: ${file.originalname}`
        );
        correctedFileName = file.originalname;
      }

      if (ragId) {
        console.log(`📤 Uploading to specified RAG Engine: ${ragId}`);
      }

      const result = await ragSystem.uploadToUserRAG(
        userId,
        file.buffer,
        correctedFileName, // 使用修正後的檔案名
        ragId
      );

      if (result.success) {
        res.json({
          success: true,
          message: `文件 "${correctedFileName}" 成功上傳`,
          data: result,
        });
      } else {
        res.status(500).json({
          success: false,
          error: result.error,
          userMessage:
            result.userMessage || `文件 "${correctedFileName}" 上傳失敗`,
        });
      }
    } catch (error) {
      console.error("User upload error:", error);
      res.status(500).json({
        success: false,
        error: error.message,
        stack: error.stack,
      });
    }
  }
);

router.get(
  "/users/engines/:engineId/file-mapping",
  authenticateToken,
  async (req, res) => {
    try {
      const userId = req.user.userId;
      const { engineId } = req.params;

      // 檢查用戶權限
      const hasAccess = await ragSystem.canUserAccessRAG(userId, engineId);
      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          error: "您沒有權限訪問此 RAG Engine",
        });
      }

      const result = await ragSystem.getFileNameMapping(engineId);

      if (result.success) {
        res.json({
          success: true,
          mapping: result.mapping,
          count: result.count,
        });
      } else {
        res.status(500).json({
          success: false,
          error: result.error,
        });
      }
    } catch (error) {
      console.error("Get file mapping error:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
);

// 📊 獲取用戶的 RAG Engines - 修正版（使用資料庫）
router.get("/users/:userId/engines", authenticateToken, async (req, res) => {
  try {
    const userId = req.params.userId || req.user.userId;

    console.log(`Getting RAG engines for user: ${userId}`);

    const accessibleRags = await ragSystem.getUserAccessibleRAGEngines(userId);

    if (!accessibleRags.success) {
      return res.status(500).json({
        success: false,
        error: accessibleRags.error,
        engines: [],
        userId: userId,
      });
    }

    // 格式化 Engine 列表
    const formattedEngines = accessibleRags.ownRags.map((rag) => ({
      id: rag.ragid,
      name: rag.ragname,
      displayName: rag.ragname,
      visibility: rag.visibility,
      fileCount: 0,
      status: "active",
      createdAt: rag.created_at,
      updatedAt: rag.updated_at,
      isOwner: true,
    }));

    const sharedEngines = [
      ...accessibleRags.friendSharedRags.map((rag) => ({
        id: rag.ragid,
        name: rag.ragname,
        displayName: rag.ragname,
        visibility: rag.visibility,
        fileCount: 0,
        status: "active",
        createdAt: rag.created_at,
        updatedAt: rag.updated_at,
        isOwner: false,
        ownerUsername: rag.owner_username,
        shareType: "friend",
      })),
      ...accessibleRags.privateSharedRags.map((rag) => ({
        id: rag.ragid,
        name: rag.ragname,
        displayName: rag.ragname,
        visibility: rag.visibility,
        fileCount: 0,
        status: "active",
        createdAt: rag.created_at,
        updatedAt: rag.updated_at,
        isOwner: false,
        ownerUsername: rag.owner_username,
        shareType: "private",
      })),
    ];

    res.json({
      success: true,
      hasRAGEngine: formattedEngines.length > 0,
      userId: userId,
      engines: formattedEngines,
      sharedEngines: sharedEngines,
      totalEngines: formattedEngines.length,
      totalSharedEngines: sharedEngines.length,
      totalAccessible: accessibleRags.totalAccessible,
    });
  } catch (error) {
    const userId = req.params.userId || req.user.userId;
    console.error(`Error getting engines for user ${userId}:`, error);
    res.status(500).json({
      success: false,
      error: error.message,
      engines: [],
      userId: userId,
    });
  }
});

// 🏗️ 創建新的 RAG Engine（修正版）
router.post("/users/engines", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { engineName, name, description, visibility = "private" } = req.body;

    const finalEngineName = engineName || name;

    if (!finalEngineName) {
      return res.status(400).json({
        success: false,
        error: "Engine name is required",
      });
    }

    console.log(`🏗️ User ${userId} creating new engine: ${finalEngineName}`);

    // 檢查用戶是否已經有同名的 Engine
    const ragEngine = await ragSystem.getRAGEngineFromDB(finalEngineName);
    if (ragEngine.success) {
      return res.status(400).json({
        success: false,
        error: "已存在同名的 RAG Engine",
      });
    }

    const result = await ragSystem.createUserRAGEngine(
      userId,
      finalEngineName,
      description,
      visibility
    );

    if (result.success) {
      res.json({
        success: true,
        message: `RAG Engine "${finalEngineName}" 創建成功`,
        engine: {
          id: result.corpusId,
          name: result.ragName,
          displayName: result.displayName,
          visibility: result.visibility,
          createdAt: result.createdAt,
        },
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error,
        userMessage: result.userMessage || "RAG Engine 創建失敗",
        isQuotaError: result.isQuotaError,
        details: result.details,
      });
    }
  } catch (error) {
    console.error(`Create engine error for user ${req.user.userId}:`, error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// 💬 Engine 內全域查詢 - 修正版（使用資料庫）
router.post(
  "/users/:userId/engines/:engineId/query",
  authenticateToken,
  async (req, res) => {
    try {
      const userId = req.params.userId || req.user.userId;
      const { engineId } = req.params;
      const { question } = req.body;

      if (!question) {
        return res.status(400).json({
          success: false,
          error: "Question is required",
        });
      }

      console.log(
        `💬 User ${userId} querying engine ${engineId}: ${question.substring(
          0,
          50
        )}...`
      );

      const result = await ragSystem.queryUserRAG(userId, question, engineId);

      if (result.success) {
        res.json({
          success: true,
          question: result.question,
          answer: result.answer,
          ragEngine: result.ragEngine,
          sources: result.sources,
          responseTime: result.responseTime,
          timestamp: result.timestamp,
        });
      } else {
        res.status(500).json({
          success: false,
          error: result.error,
          question: result.question,
        });
      }
    } catch (error) {
      const userId = req.params.userId || req.user.userId;
      const engineId = req.params.engineId;
      console.error(
        `Engine query error for user ${userId}, engine ${engineId}:`,
        error
      );
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
);

// 🗑️ 刪除整個 RAG Engine - 修正版
router.delete(
  "/users/:userId/engines/:engineId",
  authenticateToken,
  async (req, res) => {
    try {
      const userId = req.params.userId || req.user.userId;
      const { engineId } = req.params;

      console.log(`🗑️ User ${userId} deleting engine: ${engineId}`);

      const corpusName = `projects/${ragSystem.projectId}/locations/${ragSystem.location}/ragCorpora/${engineId}`;
      const result = await ragSystem.deleteUserRAGEngine(corpusName, userId);

      if (result.success) {
        res.json({
          success: true,
          message: result.message,
          deletedEngine: result.deletedEngine,
        });
      } else {
        res.status(500).json({
          success: false,
          error: result.error,
        });
      }
    } catch (error) {
      const userId = req.params.userId || req.user.userId;
      const engineId = req.params.engineId;
      console.error(
        `Delete engine error for user ${userId}, engine ${engineId}:`,
        error
      );
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
);

// 🤝 好友管理路由
router.post("/users/friends/add", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { friendUsername } = req.body;

    if (!friendUsername) {
      return res.status(400).json({
        success: false,
        error: "Friend username is required",
      });
    }

    const result = await ragSystem.addFriend(userId, friendUsername);

    if (result.success) {
      res.json({
        success: true,
        message: result.message,
        friendId: result.friendId,
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    console.error("Add friend error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

router.post("/users/friends/accept", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { friendId } = req.body;

    if (!friendId) {
      return res.status(400).json({
        success: false,
        error: "Friend ID is required",
      });
    }

    const result = await ragSystem.acceptFriendRequest(userId, friendId);

    if (result.success) {
      res.json({
        success: true,
        message: result.message,
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    console.error("Accept friend error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// 🔗 RAG Engine 分享路由
router.post(
  "/users/engines/:engineId/share",
  authenticateToken,
  async (req, res) => {
    try {
      const userId = req.user.userId;
      const { engineId } = req.params;
      const { targetUserId, targetUsername } = req.body;

      let finalTargetUserId = targetUserId;

      // 如果提供的是用戶名，查找對應的 userId
      if (targetUsername && !finalTargetUserId) {
        // 這裡需要實現用戶名查找邏輯
        return res.status(400).json({
          success: false,
          error: "Please provide target user ID directly",
        });
      }

      if (!finalTargetUserId) {
        return res.status(400).json({
          success: false,
          error: "Target user ID is required",
        });
      }

      const result = await ragSystem.shareRAGEngineToUser(
        userId,
        engineId,
        finalTargetUserId
      );

      if (result.success) {
        res.json({
          success: true,
          message: result.message,
          sharedEngine: {
            ragId: result.ragId,
            targetUserId: result.targetUserId,
          },
        });
      } else {
        res.status(500).json({
          success: false,
          error: result.error,
        });
      }
    } catch (error) {
      console.error("Share engine error:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
);

// 🔍 操作狀態檢查
router.get("/operation-status/:operationId", async (req, res) => {
  try {
    const { operationId } = req.params;
    const authClient = await auth.getClient();
    const accessToken = await authClient.getAccessToken();

    const statusUrl = `https://${LOCATION}-aiplatform.googleapis.com/v1beta1/projects/${PROJECT_ID}/locations/${LOCATION}/operations/${operationId}`;

    const response = await axios.get(statusUrl, {
      headers: {
        Authorization: `Bearer ${accessToken.token}`,
        "Content-Type": "application/json",
      },
    });

    const operation = response.data;
    let status = operation.done ? "completed" : "running";

    if (operation.done && operation.error) {
      status = "failed";
    }

    res.json({
      success: true,
      operationId: operationId,
      status: status,
      done: operation.done || false,
      error: operation.error || null,
      result: operation.response || null,
      metadata: operation.metadata || null,
      recommendations: operation.done
        ? operation.error
          ? ["❌ 操作失敗，請檢查錯誤信息", "🔄 嘗試重新上傳文件"]
          : ["✅ 處理完成！", "🧪 可以開始測試查詢功能"]
        : ["⏳ 操作進行中，請稍候", "🕐 通常需要1-3分鐘完成"],
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.response?.data || error.message,
    });
  }
});

// 🔍 用戶 RAG 狀態查詢
router.get("/users/status", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    console.log(`Getting RAG status for user: ${userId}`);

    const accessibleRags = await ragSystem.getUserAccessibleRAGEngines(userId);

    if (!accessibleRags.success) {
      return res.status(500).json({
        success: false,
        error: accessibleRags.error,
      });
    }

    let hasRAGEngine = false;
    let engineInfo = null;

    if (accessibleRags.ownRags.length > 0) {
      hasRAGEngine = true;
      const firstRag = accessibleRags.ownRags[0];
      engineInfo = {
        id: firstRag.ragid,
        name: firstRag.ragname,
        visibility: firstRag.visibility,
        createdAt: firstRag.created_at,
      };
    }

    res.json({
      success: true,
      hasRAGEngine: hasRAGEngine,
      userId: userId,
      engine: engineInfo,
      message: hasRAGEngine
        ? `您有 ${accessibleRags.ownRags.length} 個 RAG Engine`
        : "您還沒有 RAG Engine，上傳文件時會自動建立",
    });
  } catch (error) {
    console.error(`Error getting RAG status for user:`, error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// 🗑️ 刪除用戶的特定文檔
router.delete(
  "/users/documents/:documentId",
  authenticateToken,
  async (req, res) => {
    try {
      const userId = req.user.userId;
      const { documentId } = req.params;

      console.log(`🗑️ User ${userId} deleting document: ${documentId}`);

      const result = await ragSystem.deleteUserDocument(userId, documentId);

      if (result.success) {
        res.json({
          success: true,
          message: result.message,
          deletedFileId: result.deletedFileId,
        });
      } else {
        res.status(500).json({
          success: false,
          error: result.error,
        });
      }
    } catch (error) {
      console.error(
        `Delete document error for user ${req.user.userId}:`,
        error
      );
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
);

// 📋 用戶所有文檔列表（支援多 Engine，前端與測試專用）
router.get("/users/documents", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    // 取得用戶可訪問的所有 RAG Engine
    const accessibleRags = await ragSystem.getUserAccessibleRAGEngines(userId);
    if (!accessibleRags.success) {
      return res.status(500).json({
        success: false,
        error: accessibleRags.error,
      });
    }

    // 合併所有可訪問的 Engine
    const allRags = [
      ...accessibleRags.ownRags,
      ...accessibleRags.friendSharedRags,
      ...accessibleRags.privateSharedRags,
    ];

    let allFiles = [];

    for (const rag of allRags) {
      const corpusName = `projects/${ragSystem.projectId}/locations/${ragSystem.location}/ragCorpora/${rag.ragid}`;
      const documentsResult = await ragSystem.getUserDocuments(corpusName);

      if (documentsResult.success) {
        const filesWithEngine = documentsResult.files.map((file) => ({
          ...file,
          engineId: rag.ragid,
          engineName: rag.ragname,
          isOwner: accessibleRags.ownRags.some(
            (own) => own.ragid === rag.ragid
          ),
        }));
        allFiles = allFiles.concat(filesWithEngine);
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
      error: error.message,
    });
  }
});

// 🧪 測試端點
router.get("/test", (req, res) => {
  res.json({
    success: true,
    message:
      "Multi-User Multi-Engine RAG System with Database Integration is running",
    version: "5.0.0 - Modularized",
    features: [
      "✅ 模組化架構",
      "✅ 資料庫整合 (MySQL)",
      "✅ 統一 RAG Engine 命名 (只使用 userId)",
      "✅ Google RAG Corpus ID 保存為 ragid",
      "✅ 用戶權限檢查",
      "✅ 好友系統和 RAG 分享",
      "✅ 私人 RAG Engine 分享",
      "✅ 多文檔上傳到同一 Engine",
      "✅ 分頁查詢所有 Engine",
      "✅ 完整的錯誤處理",
      "✅ 用戶隔離保護",
      "✅ 檔案名稱映射功能",
    ],
    modules: [
      "MultiUserRAGSystem - 主要系統類別",
      "DatabaseOperations - 資料庫操作",
      "FileOperations - 檔案操作",
      "QueryOperations - 查詢操作",
      "EngineManagement - RAG Engine 管理",
      "middleware - 認證中間件",
      "config - 配置管理",
    ],
    endpoints: {
      createEngine: "POST /api/rag/users/engines",
      listEngines: "GET /api/rag/users/engines",
      userStatus: "GET /api/rag/users/status",
      userUpload: "POST /api/rag/users/upload",
      userQuery: "POST /api/rag/users/query",
      userDocuments: "GET /api/rag/users/documents",
      deleteDocument: "DELETE /api/rag/users/documents/:documentId",
      enginesOverview: "GET /api/rag/engines/overview",
      operationStatus: "GET /api/rag/operation-status/:operationId",
      addFriend: "POST /api/rag/users/friends/add",
      acceptFriend: "POST /api/rag/users/friends/accept",
      shareEngine: "POST /api/rag/users/engines/:engineId/share",
      fileMapping: "GET /api/rag/users/engines/:engineId/file-mapping",
    },
    database: {
      tables: ["users", "rag", "friendship", "private_rag", "rag_file_name"],
      features: [
        "用戶管理",
        "RAG Engine 管理",
        "好友關係",
        "私人分享",
        "檔案名稱映射",
      ],
    },
  });
});

module.exports = router;
