const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const multer = require("multer"); // 添加 multer 支援檔案上傳
const fs = require("fs");
const axios = require("axios"); // 添加 axios 支援診斷功能
const { authenticateToken } = require("./middlewarecheck/middleware");
// 🔧 設置 multer 用於檔案上傳，特別處理中文檔名
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB 限制
  },
  // 🔧 添加檔名處理選項
  fileFilter: (req, file, cb) => {
    console.log(`🔍 [MULTER] 接收檔案: ${file.originalname}`);
    console.log(`🔍 [MULTER] 原始位元組:`, Buffer.from(file.originalname));
    
    // 修復中文檔名編碼問題
    try {
      // 將檔名從 latin1 轉換回正確的 UTF-8
      const fixedFilename = Buffer.from(file.originalname, 'latin1').toString('utf8');
      console.log(`✅ [MULTER] 修復後檔名: ${fixedFilename}`);
      
      // 覆蓋原始檔名
      file.originalname = fixedFilename;
    } catch (error) {
      console.error(`❌ [MULTER] 檔名修復失敗:`, error.message);
    }
    
    cb(null, true);
  }
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

      const result = await ragSystem.updateEngineVisibility(
        userId,
        engineId,
        visibility
      );

      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      console.error("Error updating engine visibility:", error);
      res.status(500).json({
        success: false,
        error: "Internal server error",
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
      const { targetUsername } = req.body;

      if (!targetUsername) {
        return res
          .status(400)
          .json({ success: false, error: "targetUsername is required" });
      }

      const EngineManagement = require("./rag/engineManagement");
      const engineMgmt = new EngineManagement();
      const result = await engineMgmt.shareRAGEngineToUser(
        ownerId,
        engineId,
        targetUsername
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

    const result = await ragSystem.getAllUserEngines(targetUserId);

    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: result.error,
      });
    }

    // 格式化
    const formattedEngines = result.engines.map((engine) => ({
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

// 🧪 測試中文檔名上傳端點
router.post(
  "/test-chinese-upload",
  authenticateToken,
  upload.single("file"),
  async (req, res) => {
    try {
      const file = req.file;
      const userId = req.user.userId;

      console.log(`\n🧪 === CHINESE FILENAME TEST ===`);
      console.log(`👤 User ID: ${userId}`);
      console.log(`📁 File details:`);
      console.log(`  originalname: "${file.originalname}"`);
      console.log(`  originalname type: ${typeof file.originalname}`);
      console.log(`  originalname.length: ${file.originalname.length}`);
      console.log(`  originalname bytes:`, [...Buffer.from(file.originalname)]);
      console.log(`  originalname hex:`, Buffer.from(file.originalname).toString('hex'));
      console.log(`  buffer size: ${file.buffer.length} bytes`);
      console.log(`  mimetype: ${file.mimetype}`);
      console.log(`  encoding: ${file.encoding}`);

      // 測試不同的編碼解析
      console.log(`\n🔍 Testing different encodings:`);
      try {
        const utf8Decoded = Buffer.from(file.originalname, 'utf8').toString('utf8');
        console.log(`  UTF8 roundtrip: "${utf8Decoded}"`);
        console.log(`  UTF8 match: ${utf8Decoded === file.originalname}`);
      } catch (e) {
        console.log(`  UTF8 test failed: ${e.message}`);
      }

      try {
        const latin1ToUtf8 = Buffer.from(file.originalname, 'latin1').toString('utf8');
        console.log(`  Latin1->UTF8: "${latin1ToUtf8}"`);
      } catch (e) {
        console.log(`  Latin1->UTF8 test failed: ${e.message}`);
      }

      // 測試直接插入資料庫
      console.log(`\n💾 Testing database insertion:`);
      try {
        const { pool } = require('../config/database');
        
        // 建立測試記錄
        const testRagId = '9999999999999999999'; // 測試用
        const [insertResult] = await pool.execute(
          'INSERT INTO rag_file_name (ragid, filename) VALUES (?, ?) ON DUPLICATE KEY UPDATE filename = VALUES(filename)',
          [testRagId, file.originalname]
        );
        
        // 立即查詢
        const [selectResult] = await pool.execute(
          'SELECT filename FROM rag_file_name WHERE ragid = ? ORDER BY created_at DESC LIMIT 1',
          [testRagId]
        );
        
        if (selectResult.length > 0) {
          const dbFilename = selectResult[0].filename;
          console.log(`  DB storage: "${dbFilename}"`);
          console.log(`  DB match: ${dbFilename === file.originalname}`);
          
          // 清理測試數據
          await pool.execute('DELETE FROM rag_file_name WHERE ragid = ?', [testRagId]);
        }
      } catch (dbError) {
        console.log(`  DB test failed: ${dbError.message}`);
      }

      res.json({
        success: true,
        originalFilename: file.originalname,
        filenameBytes: [...Buffer.from(file.originalname)],
        filenameHex: Buffer.from(file.originalname).toString('hex'),
        bufferSize: file.buffer.length,
        mimetype: file.mimetype,
        encoding: file.encoding,
        tests: {
          utf8Roundtrip: Buffer.from(file.originalname, 'utf8').toString('utf8'),
          latin1ToUtf8: Buffer.from(file.originalname, 'latin1').toString('utf8')
        }
      });

    } catch (error) {
      console.error('🧪 Test upload error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

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
      
      // 🔍 詳細調試檔名編碼
      console.log(`🔍 File details:`);
      console.log(`  originalname: ${file.originalname}`);
      console.log(`  originalname type: ${typeof file.originalname}`);
      console.log(`  originalname bytes:`, Buffer.from(file.originalname, 'utf8'));
      console.log(`  originalname length: ${file.originalname.length}`);
      console.log(`  buffer size: ${file.buffer.length} bytes`);
      console.log(`  mimetype: ${file.mimetype}`);
      console.log(`  encoding: ${file.encoding}`);

      // 🔧 修正：直接傳遞原始 Buffer，避免破壞二進位檔案
      const fileData = {
        name: file.originalname,
        content: file.buffer, // 使用 content 欄位傳遞 Buffer
        buffer: file.buffer, // 保留 buffer 欄位以保持相容性
      };

      // 復用現有的上傳邏輯，確保正確傳遞 Buffer
      const result = await ragSystem.uploadToUserRAG(
        targetUserId,
        fileData,
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
      console.log(`🔍 RAG ID: ${ragId}`);
      console.log(`🔍 File ID: ${fileId}`);

      if (!ragId) {
        return res.status(400).json({
          success: false,
          error: "ragId is required for document deletion",
        });
      }

      // 🔧 修正：使用更可靠的權限檢查
      console.log(`🔍 Checking access for user ${userId} to RAG ${ragId}`);

      try {
        const userEnginesResult = await ragSystem.getAllUserEngines(userId);
        if (!userEnginesResult.success) {
          console.log(
            `❌ Failed to get user engines: ${userEnginesResult.error}`
          );
          return res.status(500).json({
            success: false,
            error: "無法獲取用戶引擎列表",
          });
        }

        const userEngineIds = userEnginesResult.engines.map((e) => e.ragid);
        const hasAccess = userEngineIds.includes(ragId);

        console.log(`🔍 User's engines:`, userEngineIds);
        console.log(`🔍 Access check result: ${hasAccess}`);

        if (!hasAccess) {
          console.log(`❌ Access denied for user ${userId} to RAG ${ragId}`);
          return res.status(403).json({
            success: false,
            error: "沒有權限刪除此檔案",
          });
        }
      } catch (enginesError) {
        console.log(`⚠️ Error checking user engines:`, enginesError.message);
        return res.status(500).json({
          success: false,
          error: "權限檢查失敗",
        });
      }

      // 🔧 修正：直接呼叫 fileOperations 的刪除方法
      const FileOperations = require("./rag/fileOperations");
      const fileOps = new FileOperations();

      // 🔧 簡化：跳過額外的權限檢查，因為我們已經在上面檢查過了
      const result = await fileOps.deleteUserDocumentDirect(
        userId,
        fileId,
        ragId
      );

      if (result.success) {
        res.json({
          success: true,
          message: result.message || "檔案已成功刪除",
          fileId: fileId,
          ragId: ragId,
          details: {
            ragDeleted: result.ragDeleted,
            dbDeleted: result.dbDeleted,
          },
        });
      } else {
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

// 假設你的上傳 API 是這樣的
// 1. 使用 authenticateToken 驗證
// 2. 使用 multer 中介軟體 `upload.single('file')` 來處理檔案
//    'file' 必須與你前端 <input type="file" name="file"> 的 name 屬性一致
router.post(
  "/engines/:engineId/upload",
  authenticateToken,
  upload.single("file"), // <-- 關鍵在這裡
  async (req, res) => {
    try {
      // multer 處理後，檔案資訊會在 req.file
      if (!req.file) {
        return res
          .status(400)
          .json({ success: false, message: "沒有上傳檔案" });
      }

      const { engineId } = req.params;
      const userId = req.user.userId;

      // 從 req.file 中取得檔名和 Buffer
      const fileName = req.file.originalname;
      const fileBuffer = req.file.buffer; // <-- 這就是正確的二進位 Buffer

      // 現在，用這個正確的 buffer 去呼叫你現有的邏輯
      const result = await ragSystem.fileOps.uploadToUserRAG(
        userId,
        { buffer: fileBuffer }, // 確保傳遞的是 buffer
        fileName,
        engineId
        // ... 傳入其他需要的參數
      );

      if (result.success) {
        res.json(result);
      } else {
        res.status(500).json(result);
      }
    } catch (error) {
      console.error("檔案上傳路由出錯:", error);
      res.status(500).json({ success: false, message: "伺服器內部錯誤" });
    }
  }
);

module.exports = router;
