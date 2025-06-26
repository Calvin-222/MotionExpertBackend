const express = require("express");
const router = express.Router();
const { VertexAI } = require("@google-cloud/vertexai");
const { GoogleAuth } = require("google-auth-library");
const { Storage } = require("@google-cloud/storage");
const multer = require("multer");
const axios = require("axios");
const jwt = require("jsonwebtoken");

// 初始化 Google Cloud Storage
const storage = new Storage({
  projectId: "motionexpaiweb",
  keyFilename: "./motionexpaiweb-471ee0d1e3d6.json",
});

// 初始化認證
const auth = new GoogleAuth({
  keyFile: "./motionexpaiweb-471ee0d1e3d6.json",
  scopes: ["https://www.googleapis.com/auth/cloud-platform"],
});

// 初始化 Vertex AI
const vertexAI = new VertexAI({
  project: "motionexpaiweb",
  location: "us-central1",
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

// 配置資訊
const PROJECT_ID = "motionexpaiweb";
const LOCATION = "us-central1";
const BUCKET_NAME = "motionexpert-rag-documents";

// 動態 RAG Engine 管理
let CURRENT_CORPUS_ID = "2305843009213693952";
let CURRENT_CORPUS_NAME = `projects/${PROJECT_ID}/locations/${LOCATION}/ragCorpora/${CURRENT_CORPUS_ID}`;

class MultiUserRAGSystem {
  constructor() {
    this.projectId = PROJECT_ID;
    this.location = LOCATION;
    this.bucketName = BUCKET_NAME;
    this.auth = auth;
    this.storage = storage;
    this.vertexAI = vertexAI;
    // 添加速率限制
    this.lastApiCall = 0;
    this.minApiInterval = 2000; // 2秒間隔
  }

  // 添加速率限制方法
  async rateLimitedCall(apiCall) {
    const now = Date.now();
    const timeSinceLastCall = now - this.lastApiCall;

    if (timeSinceLastCall < this.minApiInterval) {
      const waitTime = this.minApiInterval - timeSinceLastCall;
      console.log(`Rate limiting: waiting ${waitTime}ms before API call`);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }

    this.lastApiCall = Date.now();
    return await apiCall();
  }

  // 🏗️ 為用戶創建專屬的 RAG Engine（修正版 - 使用用戶ID作為Engine名稱）
  async createUserRAGEngine(userId, displayName = null, fileName = null) {
    try {
      const authClient = await this.auth.getClient();
      const accessToken = await authClient.getAccessToken();

      const createUrl = `https://${this.location}-aiplatform.googleapis.com/v1beta1/projects/${this.projectId}/locations/${this.location}/ragCorpora`;

      // 使用用戶ID作為Engine名稱
      const engineDisplayName = `${userId} Knowledge Base`;

      const corpusData = {
        displayName: engineDisplayName,
        description: `RAG corpus for user ${userId} - Created ${new Date().toISOString()}`,
      };

      console.log(`Creating RAG Engine for user ${userId}...`);
      console.log("Request URL:", createUrl);
      console.log("Request payload:", JSON.stringify(corpusData, null, 2));

      const response = await axios.post(createUrl, corpusData, {
        headers: {
          Authorization: `Bearer ${accessToken.token}`,
          "Content-Type": "application/json",
        },
      });

      console.log(
        "Create response received:",
        JSON.stringify(response.data, null, 2)
      );

      // 檢查是否是異步操作
      if (response.data.name && response.data.name.includes("/operations/")) {
        console.log(
          "RAG Engine creation is an async operation, waiting for completion..."
        );

        const operationResult = await this.waitForOperation(response.data.name);

        if (!operationResult.success) {
          throw new Error(`Operation failed: ${operationResult.error}`);
        }

        const corpusName = operationResult.result?.name;
        if (!corpusName) {
          throw new Error("No corpus name found in operation result");
        }

        const corpusId = corpusName.split("/").pop();

        console.log(`✅ RAG Engine created for user ${userId}`);
        console.log("Full corpus name:", corpusName);
        console.log("Corpus ID:", corpusId);

        return {
          success: true,
          userId: userId,
          corpusId: corpusId,
          corpusName: corpusName,
          displayName: operationResult.result?.displayName || engineDisplayName,
          bucketPath: `user-data/${userId}`,
          createdAt: new Date().toISOString(),
          operationId: response.data.name.split("/").pop(),
        };
      } else {
        const corpusName = response.data.name;
        const corpusId = corpusName.split("/").pop();

        return {
          success: true,
          userId: userId,
          corpusId: corpusId,
          corpusName: corpusName,
          displayName: response.data.displayName,
          bucketPath: `user-data/${userId}`,
          createdAt: new Date().toISOString(),
        };
      }
    } catch (error) {
      console.error(`❌ Failed to create RAG Engine for user ${userId}:`);
      console.error("Error details:", {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
      });

      return {
        success: false,
        error: error.response?.data || error.message,
        details: {
          status: error.response?.status,
          message: error.message,
        },
      };
    }
  }

  // 🕐 等待操作完成
  async waitForOperation(operationName, maxWaitTime = 300000) {
    try {
      const authClient = await this.auth.getClient();
      const startTime = Date.now();

      console.log(`⏳ Waiting for operation to complete: ${operationName}`);

      while (Date.now() - startTime < maxWaitTime) {
        const accessToken = await authClient.getAccessToken();

        const statusUrl = `https://${this.location}-aiplatform.googleapis.com/v1beta1/${operationName}`;

        const response = await axios.get(statusUrl, {
          headers: {
            Authorization: `Bearer ${accessToken.token}`,
            "Content-Type": "application/json",
          },
        });

        const operation = response.data;
        console.log(
          `Operation status: done=${operation.done}, name=${operation.name}`
        );

        if (operation.done) {
          if (operation.error) {
            console.error("Operation failed:", operation.error);
            return {
              success: false,
              error: operation.error,
            };
          }

          console.log("✅ Operation completed successfully");
          return {
            success: true,
            result: operation.response,
            metadata: operation.metadata,
          };
        }

        // 等待 10 秒後重試
        await new Promise((resolve) => setTimeout(resolve, 10000));
      }

      return {
        success: false,
        error: "Operation timeout",
      };
    } catch (error) {
      console.error("Error waiting for operation:", error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  // 📋 列出所有 RAG Engines - 添加速率限制
  async listAllRAGEngines() {
    try {
      return await this.rateLimitedCall(async () => {
        const authClient = await this.auth.getClient();
        const accessToken = await authClient.getAccessToken();

        const listUrl = `https://${this.location}-aiplatform.googleapis.com/v1beta1/projects/${this.projectId}/locations/${this.location}/ragCorpora`;

        console.log("Listing RAG engines from:", listUrl);

        const response = await axios.get(listUrl, {
          headers: {
            Authorization: `Bearer ${accessToken.token}`,
            "Content-Type": "application/json",
          },
        });

        const corpora = response.data.ragCorpora || [];

        console.log(`Found ${corpora.length} RAG engines`);

        const enginesWithDetails = await Promise.all(
          corpora.map(async (corpus) => {
            const details = await this.getEngineFileCount(corpus.name);
            const corpusId = corpus.name.split("/").pop();

            return {
              id: corpusId,
              fullName: corpus.name,
              displayName: corpus.displayName,
              description: corpus.description,
              createTime: corpus.createTime,
              updateTime: corpus.updateTime,
              fileCount: details.fileCount,
              status: details.status,
              isUserEngine:
                corpus.displayName?.includes("Knowledge Base") ||
                corpus.description?.includes("user "),
              userId: this.extractUserIdFromEngine(corpus),
            };
          })
        );

        return {
          success: true,
          totalEngines: corpora.length,
          userEngines: enginesWithDetails.filter((e) => e.isUserEngine),
          systemEngines: enginesWithDetails.filter((e) => !e.isUserEngine),
          allEngines: enginesWithDetails,
        };
      });
    } catch (error) {
      console.error(
        "List RAG engines error:",
        error.response?.data || error.message
      );

      // 如果是配額超限錯誤，返回緩存的結果或空結果
      if (error.response?.data?.error?.code === 429) {
        console.log("API quota exceeded, returning empty result");
        return {
          success: true,
          totalEngines: 0,
          userEngines: [],
          systemEngines: [],
          allEngines: [],
          quotaExceeded: true,
        };
      }

      return {
        success: false,
        error: error.response?.data || error.message,
      };
    }
  }

  // 🔍 從 Engine 中提取用戶 ID（改进版 - 支持數據庫 UUID）
  extractUserIdFromEngine(corpus) {
    // 嘗試從 description 中提取用戶 ID（UUID格式）
    if (corpus.description) {
      const match = corpus.description.match(/user ([a-f0-9\-]{36})/i);
      if (match) {
        return match[1];
      }
    }

    // 嘗試從 displayName 中提取（如果有的話）
    if (corpus.displayName) {
      // 如果 displayName 包含 userid 前綴
      const match = corpus.displayName.match(/^([a-f0-9\-]{36})-(.+)$/);
      if (match) {
        return match[1]; // 返回 userid
      }
    }

    return null;
  }

  // 🔍 獲取 Engine 文件數量
  async getEngineFileCount(corpusName) {
    try {
      const authClient = await this.auth.getClient();
      const accessToken = await authClient.getAccessToken();

      const filesUrl = `https://${this.location}-aiplatform.googleapis.com/v1beta1/${corpusName}/ragFiles`;

      const response = await axios.get(filesUrl, {
        headers: {
          Authorization: `Bearer ${accessToken.token}`,
          "Content-Type": "application/json",
        },
      });

      const files = response.data.ragFiles || [];

      return {
        fileCount: files.length,
        status: files.length > 0 ? "active" : "empty",
        recentFiles: files.slice(-3),
      };
    } catch (error) {
      console.error(
        `Error getting file count for ${corpusName}:`,
        error.message
      );
      return {
        fileCount: 0,
        status: "unknown",
        recentFiles: [],
      };
    }
  }

  // 📋 獲取用戶文檔列表
  async getUserDocuments(corpusName) {
    try {
      const authClient = await this.auth.getClient();
      const accessToken = await authClient.getAccessToken();

      const filesUrl = `https://${this.location}-aiplatform.googleapis.com/v1beta1/${corpusName}/ragFiles`;

      console.log(`Getting documents from: ${filesUrl}`);

      const response = await axios.get(filesUrl, {
        headers: {
          Authorization: `Bearer ${accessToken.token}`,
          "Content-Type": "application/json",
        },
      });

      const files = response.data.ragFiles || [];

      const formattedFiles = files.map((file) => {
        const fileId = file.name.split("/").pop();
        return {
          id: fileId,
          name: file.displayName || fileId,
          fullName: file.name,
          createTime: file.createTime,
          updateTime: file.updateTime,
          sizeBytes: file.sizeBytes,
          ragFileType: file.ragFileType,
        };
      });

      return {
        success: true,
        files: formattedFiles,
        totalFiles: formattedFiles.length,
      };
    } catch (error) {
      console.error(
        `Error getting documents from ${corpusName}:`,
        error.message
      );
      return {
        success: false,
        error: error.message,
        files: [],
      };
    }
  }

  // 🗑️ 刪除用戶文檔（改进版）
  async deleteUserDocument(userId, ragFileId) {
    try {
      const userEngines = await this.listAllRAGEngines();
      const userEngine = userEngines.userEngines.find(
        (e) =>
          e.userId === userId ||
          e.displayName?.includes(`${userId}'s Knowledge Base`) ||
          e.description?.includes(`user ${userId}`)
      );

      if (!userEngine) {
        return {
          success: false,
          error: "User RAG engine not found",
        };
      }

      const authClient = await this.auth.getClient();
      const accessToken = await authClient.getAccessToken();

      const deleteUrl = `https://${this.location}-aiplatform.googleapis.com/v1beta1/${userEngine.fullName}/ragFiles/${ragFileId}`;

      console.log(`Deleting document: ${deleteUrl}`);

      await axios.delete(deleteUrl, {
        headers: {
          Authorization: `Bearer ${accessToken.token}`,
          "Content-Type": "application/json",
        },
      });

      return {
        success: true,
        message: "Document deleted successfully",
        documentId: ragFileId,
        userId: userId,
      };
    } catch (error) {
      console.error(
        `Error deleting document ${ragFileId} for user ${userId}:`,
        error.response?.data || error.message
      );
      return {
        success: false,
        error: error.response?.data || error.message,
      };
    }
  }

  // 📤 用戶文檔上傳到專屬 RAG（修正版 - 使用同一個 Engine）
  async uploadToUserRAG(userId, file, fileName) {
    try {
      console.log(
        `📤 Starting upload process for user ${userId}, file: ${fileName}`
      );

      // 檢查用戶是否已有 RAG Engine
      const allEngines = await this.listAllRAGEngines();
      let userEngine = allEngines.userEngines.find(
        (e) => e.userId === userId
      );

      // 如果沒有 Engine，創建一個
      if (!userEngine) {
        console.log(`No existing RAG Engine found for user ${userId}, creating new one...`);
        const createResult = await this.createUserRAGEngine(userId);
        
        if (!createResult.success) {
          throw new Error(
            `Failed to create RAG engine for user: ${JSON.stringify(
              createResult.error
            )}`
          );
        }

        userEngine = {
          id: createResult.corpusId,
          fullName: createResult.corpusName,
          displayName: createResult.displayName,
          userId: userId,
        };
        console.log(`✅ Created new RAG Engine: ${userEngine.id} for user: ${userId}`);
      } else {
        console.log(`✅ Using existing RAG Engine: ${userEngine.id} for user: ${userId}`);
      }

      // 上傳文件到用戶專屬路徑
      const timestamp = Date.now();
      const userBucketPath = `user-data/${userId}/${timestamp}-${fileName}`;
      console.log(`📁 Uploading to bucket path: ${userBucketPath}`);

      const bucket = this.storage.bucket(this.bucketName);

      try {
        const [bucketExists] = await bucket.exists();
        if (!bucketExists) {
          console.log(`Creating bucket: ${this.bucketName}`);
          await this.storage.createBucket(this.bucketName, {
            location: this.location,
            storageClass: "STANDARD",
          });
        }
      } catch (bucketError) {
        console.error("Bucket check/create error:", bucketError.message);
      }

      const bucketFile = bucket.file(userBucketPath);
      await bucketFile.save(file, {
        metadata: {
          contentType: "text/plain",
          metadata: {
            userId: userId,
            originalName: fileName,
            uploadedAt: new Date().toISOString(),
            ragEngine: userEngine.id,
          },
        },
      });

      console.log(
        `✅ File uploaded to Cloud Storage: gs://${this.bucketName}/${userBucketPath}`
      );

      // 導入到 RAG Engine
      console.log(`🔄 Importing file to RAG Engine: ${userEngine.fullName}`);

      if (userEngine.fullName.includes("/operations/")) {
        console.error(
          "❌ Invalid corpus name - appears to be an operation name"
        );
        throw new Error(
          "RAG Engine creation may not be complete. Please try again later."
        );
      }

      const importResult = await this.importFileToRAG(
        userEngine.fullName,
        userBucketPath
      );

      if (!importResult.success) {
        console.error("Import to RAG failed:", importResult.error);
      } else {
        console.log(`✅ Import operation started: ${importResult.operationId}`);
      }

      return {
        success: true,
        userId: userId,
        fileName: fileName,
        displayName: fileName, // 前端顯示用
        bucketPath: `gs://${this.bucketName}/${userBucketPath}`,
        ragEngine: {
          id: userEngine.id,
          name: userEngine.fullName,
          displayName: userEngine.displayName,
          fileName: fileName,
        },
        importResult: importResult,
        engineCreated: !allEngines.userEngines.find(e => e.userId === userId), // 是否為新創建的 Engine
      };
    } catch (error) {
      console.error(`❌ Upload to user RAG error (${userId}):`, error);
      return {
        success: false,
        error: error.message,
        stack: error.stack,
      };
    }
  }

  // 🔄 導入文件到指定的 RAG Engine（改进版）
  async importFileToRAG(corpusName, filePath) {
    try {
      // 確保 corpusName 不是操作名稱
      if (corpusName.includes("/operations/")) {
        throw new Error(
          `Invalid corpus name: ${corpusName}. This appears to be an operation name, not a corpus name.`
        );
      }

      const authClient = await this.auth.getClient();
      const accessToken = await authClient.getAccessToken();

      const importUrl = `https://${this.location}-aiplatform.googleapis.com/v1beta1/${corpusName}/ragFiles:import`;

      const importData = {
        importRagFilesConfig: {
          gcsSource: {
            uris: [`gs://${this.bucketName}/${filePath}`],
          },
          ragFileChunkingConfig: {
            chunkSize: 1024,
            chunkOverlap: 200,
          },
        },
      };

      console.log(`Importing file to RAG: ${corpusName}`);
      console.log(`Import URL: ${importUrl}`);
      console.log(`File URI: gs://${this.bucketName}/${filePath}`);
      console.log("Import request data:", JSON.stringify(importData, null, 2));

      const response = await axios.post(importUrl, importData, {
        headers: {
          Authorization: `Bearer ${accessToken.token}`,
          "Content-Type": "application/json",
        },
      });

      console.log("Import response:", JSON.stringify(response.data, null, 2));

      return {
        success: true,
        operationName: response.data.name,
        operationId: response.data.name?.split("/").pop() || "unknown",
      };
    } catch (error) {
      console.error("Import to RAG error:", {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        corpusName: corpusName,
      });

      return {
        success: false,
        error: error.response?.data || error.message,
      };
    }
  }

  // 💬 用戶專屬 RAG 查詢
  async queryUserRAG(userId, question) {
    try {
      const userEngines = await this.listAllRAGEngines();
      const userEngine = userEngines.userEngines.find(
        (e) =>
          e.userId === userId ||
          e.displayName?.includes(`${userId}'s Knowledge Base`) ||
          e.description?.includes(`user ${userId}`)
      );

      if (!userEngine) {
        return {
          success: false,
          error:
            "User RAG engine not found. Please upload some documents first.",
        };
      }

      const generativeModel = this.vertexAI.getGenerativeModel({
        model: "gemini-2.5-flash-preview-05-20",
      });

      const request = {
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `基於我的個人知識庫，請回答以下問題：

${question}

請確保回答基於我上傳的文檔內容，如果找不到相關信息，請誠實說明。`,
              },
            ],
          },
        ],
        tools: [
          {
            retrieval: {
              vertexRagStore: {
                ragCorpora: [userEngine.fullName],
                similarityTopK: 10,
                vectorDistanceThreshold: 0.5,
              },
            },
          },
        ],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 8192,
          topP: 0.95,
        },
      };

      const result = await generativeModel.generateContent(request);
      const answer = this.extractResponseText(result.response);

      return {
        success: true,
        answer: answer,
        question: question,
        userId: userId,
        ragEngine: userEngine.displayName,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  // 📝 提取回應文本
  extractResponseText(response) {
    try {
      if (response && response.candidates && response.candidates.length > 0) {
        const candidate = response.candidates[0];
        if (
          candidate.content &&
          candidate.content.parts &&
          candidate.content.parts.length > 0
        ) {
          return candidate.content.parts[0].text || "No response generated";
        }
      }

      if (typeof response.text === "function") {
        return response.text();
      }

      if (response.text) {
        return response.text;
      }

      return "No response generated";
    } catch (error) {
      console.error("Error extracting response text:", error);
      return "Error extracting response";
    }
  }

  // 💬 查詢特定 RAG Engine
  async querySpecificRAG(corpusName, question, userId, fileName) {
    try {
      const generativeModel = this.vertexAI.getGenerativeModel({
        model: "gemini-2.5-flash-preview-05-20",
      });

      const request = {
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `基於我上傳的文檔 "${fileName}"，請回答以下問題：

${question}

請確保回答基於文檔內容，如果找不到相關信息，請誠實說明。`,
              },
            ],
          },
        ],
        tools: [
          {
            retrieval: {
              vertexRagStore: {
                ragCorpora: [corpusName],
                similarityTopK: 10,
                vectorDistanceThreshold: 0.5,
              },
            },
          },
        ],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 8192,
          topP: 0.95,
        },
      };

      const result = await generativeModel.generateContent(request);
      const answer = this.extractResponseText(result.response);

      return {
        success: true,
        answer: answer,
        question: question,
        userId: userId,
        fileName: fileName,
        ragEngine: fileName,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  // 🗑️ 刪除整個 RAG Engine
  async deleteUserRAGEngine(corpusName) {
    try {
      const authClient = await this.auth.getClient();
      const accessToken = await authClient.getAccessToken();

      const deleteUrl = `https://${this.location}-aiplatform.googleapis.com/v1beta1/${corpusName}`;

      console.log(`Deleting RAG Engine: ${deleteUrl}`);

      await axios.delete(deleteUrl, {
        headers: {
          Authorization: `Bearer ${accessToken.token}`,
          "Content-Type": "application/json",
        },
      });

      return {
        success: true,
        message: "RAG Engine deleted successfully",
      };
    } catch (error) {
      console.error(
        `Error deleting RAG Engine ${corpusName}:`,
        error.response?.data || error.message
      );
      return {
        success: false,
        error: error.response?.data || error.message,
      };
    }
  }
}

const ragSystem = new MultiUserRAGSystem();

// 認證中間件
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Access token required",
    });
  }

  jwt.verify(
    token,
    process.env.JWT_SECRET || "fheisbwfiwghbtjdkwajedfegrjefujhub41354trhj",
    (err, user) => {
      if (err) {
        return res.status(403).json({
          success: false,
          message: "Invalid or expired token",
        });
      }
      req.user = user;
      next();
    }
  );
};

// 📋 獲取所有 RAG Engines 概覽
router.get("/engines/overview", async (req, res) => {
  try {
    const result = await ragSystem.listAllRAGEngines();
    if (result.success) {
      res.json({
        success: true,
        totalEngines: result.totalEngines,
        userEngines: result.userEngines,
        systemEngines: result.systemEngines,
        stats: {
          totalCount: result.totalEngines,
          userCount: result.userEngines.length,
          systemCount: result.systemEngines.length,
          activeEngines: result.allEngines.filter((e) => e.status === "active")
            .length,
        },
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error,
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

// 👤 用戶專屬文檔上傳 - 修正路由
router.post(
  "/users/:userId/upload",
  authenticateToken,
  upload.single("file"),
  async (req, res) => {
    try {
      const userId = req.params.userId || req.user.userId; // 支持路徑參數或JWT
      const file = req.file;

      if (!file) {
        return res.status(400).json({
          success: false,
          message: "No file uploaded",
        });
      }

      console.log(
        `📤 User ${userId} uploading file: ${file.originalname} (${file.size} bytes)`
      );

      const result = await ragSystem.uploadToUserRAG(
        userId,
        file.buffer,
        file.originalname
      );

      if (result.success) {
        res.json({
          success: true,
          message: `文檔 "${result.displayName}" 已成功上傳到您的個人知識庫`,
          engineCreated: true, // 前端需要這個字段
          engineName: result.displayName,
          data: {
            userId: result.userId,
            fileName: result.displayName,
            bucketPath: result.bucketPath,
            ragEngine: result.ragEngine,
            operationId: result.importResult?.operationId,
            note: "Document is being processed. It will be available for queries in a few minutes.",
          },
        });
      } else {
        console.error("Upload failed:", result);
        res.status(500).json({
          success: false,
          message: "Upload failed",
          error: result.error,
          details: result.stack,
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

// 📊 獲取用戶的 RAG Engines - 修正格式化邏輯
router.get("/users/:userId/engines", authenticateToken, async (req, res) => {
  try {
    const userId = req.params.userId || req.user.userId;

    console.log(`Getting RAG engines for user: ${userId}`);

    const allEngines = await ragSystem.listAllRAGEngines();

    if (!allEngines.success) {
      throw new Error(allEngines.error);
    }

    // 處理配額超限情況
    if (allEngines.quotaExceeded) {
      return res.json({
        success: true,
        hasRAGEngine: false,
        message: "API quota exceeded. Please try again later.",
        userId: userId,
        engines: [],
        totalEngines: 0,
        quotaExceeded: true,
      });
    }

    const userEngines = allEngines.userEngines.filter(
      (e) => e.userId === userId
    );

    console.log(`Found ${userEngines.length} engines for user ${userId}`);

    if (userEngines.length === 0) {
      res.json({
        success: true,
        hasRAGEngine: false,
        message:
          "No personal RAG engines found. Upload documents to create them.",
        userId: userId,
        engines: [],
        totalEngines: 0,
      });
    } else {
      const formattedEngines = userEngines.map((engine) => ({
        id: engine.id,
        name: engine.displayName, // 使用 displayName 作為名稱
        fileName: engine.displayName,
        status: engine.fileCount > 0 ? "active" : "processing",
        fileCount: engine.fileCount || 0,
        createdAt: engine.createTime,
        createTime: engine.createTime,
        description: `個人知識庫，包含 ${engine.fileCount || 0} 個文件`,
      }));

      res.json({
        success: true,
        hasRAGEngine: true,
        userId: userId,
        totalEngines: formattedEngines.length,
        engines: formattedEngines,
      });
    }
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

// 💬 Engine 內全域查詢 - 新增端點
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
          message: "Question is required",
        });
      }

      console.log(
        `💬 User ${userId} querying engine ${engineId}: ${question.substring(
          0,
          50
        )}...`
      );

      // 查找對應的 RAG Engine
      const allEngines = await ragSystem.listAllRAGEngines();
      const userEngine = allEngines.userEngines.find(
        (e) => e.userId === userId && e.id === engineId
      );

      if (!userEngine) {
        return res.status(404).json({
          success: false,
          error: `Engine not found or not accessible.`,
        });
      }

      const result = await ragSystem.querySpecificRAG(
        userEngine.fullName,
        question,
        userId,
        userEngine.displayName || userEngine.fileName
      );

      if (result.success) {
        res.json({
          success: true,
          answer: result.answer,
          question: question,
          userId: userId,
          engineId: engineId,
          sources: [], // 可以後续添加来源信息
        });
      } else {
        res.status(500).json({
          success: false,
          error: result.error,
        });
      }
    } catch (error) {
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

// 🗑️ 刪除整個 RAG Engine - 新增端點
router.delete(
  "/users/:userId/engines/:engineId",
  authenticateToken,
  async (req, res) => {
    try {
      const userId = req.params.userId || req.user.userId;
      const { engineId } = req.params;

      console.log(`🗑️ User ${userId} deleting engine: ${engineId}`);

      // 查找對應的 RAG Engine
      const allEngines = await ragSystem.listAllRAGEngines();
      const userEngine = allEngines.userEngines.find(
        (e) => e.userId === userId && e.id === engineId
      );

      if (!userEngine) {
        return res.status(404).json({
          success: false,
          message: `Engine not found or not accessible.`,
        });
      }

      const result = await ragSystem.deleteUserRAGEngine(userEngine.fullName);

      if (result.success) {
        res.json({
          success: true,
          message: `Engine "${
            userEngine.displayName || userEngine.fileName
          }" 已成功刪除`,
          engineId: engineId,
          userId: userId,
        });
      } else {
        res.status(500).json({
          success: false,
          message: "Failed to delete engine",
          error: result.error,
        });
      }
    } catch (error) {
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

// 🧪 測試端點
router.get("/test", (req, res) => {
  res.json({
    success: true,
    message: "Multi-User RAG System is running",
    version: "2.0.3",
    features: [
      "Multi-user RAG engines",
      "User-specific document upload",
      "User-specific querying",
      "Document management (list, delete)",
      "System-wide RAG engine management",
      "Auto RAG engine creation",
      "Document isolation per user",
      "Enhanced error handling and logging",
    ],
    endpoints: {
      userUpload: "POST /api/rag/users/:userId/upload",
      userQuery: "POST /api/rag/users/:userId/engines/:engineId/query",
      userEngines: "GET /api/rag/users/:userId/engines",
      deleteEngine: "DELETE /api/rag/users/:userId/engines/:engineId",
      enginesOverview: "GET /api/rag/engines/overview",
      operationStatus: "GET /api/rag/operation-status/:operationId",
    },
    currentSystemEngine: {
      id: CURRENT_CORPUS_ID,
      name: CURRENT_CORPUS_NAME,
    },
  });
});

module.exports = router;
