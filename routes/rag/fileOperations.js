const axios = require("axios");
const {
  auth,
  storage,
  PROJECT_ID,
  LOCATION,
  BUCKET_NAME,
  dbPool,
} = require("./config");

class FileOperations {
  constructor() {
    this.auth = auth;
    this.storage = storage;
    this.projectId = PROJECT_ID;
    this.location = LOCATION;
    this.bucketName = BUCKET_NAME;
    this.db = dbPool;
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

  // 📤 上傳文件到指定的 RAG Engine
  async uploadFileToEngine(corpusName, userId, fileBuffer, fileName) {
    try {
      const userBucketPath = `user-data/${userId}/${fileName}`;
      const bucket = this.storage.bucket(this.bucketName);
      const file = bucket.file(userBucketPath);

      console.log(
        `📤 Uploading to bucket: gs://${this.bucketName}/${userBucketPath}`
      );

      await file.save(fileBuffer, {
        metadata: {
          contentType: "application/octet-stream",
          metadata: {
            uploadedBy: userId,
            originalName: fileName,
            uploadTime: new Date().toISOString(),
          },
        },
      });

      const gsPath = `gs://${this.bucketName}/${userBucketPath}`;
      console.log(`✅ File uploaded successfully to: ${gsPath}`);

      return {
        success: true,
        userId: userId,
        fileName: fileName,
        bucketPath: gsPath,
        corpusName: corpusName,
      };
    } catch (error) {
      console.error(`❌ Failed to upload file to engine for user ${userId}:`);
      console.error("Error details:", error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  // 🔄 導入文件到指定的 RAG Engine（使用官方 API 格式）
  async importFileToRAG(corpusName, filePath) {
    try {
      console.log(`🔄 Importing single file: ${filePath}`);
      console.log(`🎯 Target corpus: ${corpusName}`);

      // 使用增強版功能和 Cloud Storage 配置
      const gcsConfig = this.createImportConfig("gcs", {
        uris: [filePath],
      });

      if (!gcsConfig) {
        throw new Error("Failed to create GCS import configuration");
      }

      return await this.importFilesToRAG(corpusName, gcsConfig);
    } catch (error) {
      console.error(`❌ Failed to import file ${filePath} to RAG:`);
      console.error("Error details:", {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
      });

      const isQuotaError =
        error.response?.data?.error?.code === 429 ||
        error.response?.data?.error?.status === "RESOURCE_EXHAUSTED" ||
        error.response?.data?.error?.message?.includes("Quota exceeded");

      return {
        success: false,
        error: error.response?.data || error.message,
        isQuotaError: isQuotaError,
        userMessage: isQuotaError ? "目前系統繁忙，請稍後再試" : "文件導入失敗",
      };
    }
  }

  // 🔄 增強版：支援多種數據來源的檔案導入功能
  // 根據 Google 官方文檔：https://cloud.google.com/vertex-ai/generative-ai/docs/rag/rag-data-ingestion
  async importFilesToRAG(corpusName, importConfig, importResultSink = null) {
    try {
      console.log(`🔄 Enhanced import operation to: ${corpusName}`);
      console.log(`📋 Import config type:`, Object.keys(importConfig)[0]);

      const authClient = await this.auth.getClient();
      const accessToken = await authClient.getAccessToken();

      const importUrl = `https://${this.location}-aiplatform.googleapis.com/v1beta1/${corpusName}/ragFiles:import`;

      // 構建導入請求，支援多種來源
      const importRequest = {
        import_rag_files_config: importConfig,
      };

      // 如果提供了結果接收器，加入到請求中
      if (importResultSink) {
        importRequest.import_result_sink = importResultSink;
      }

      console.log(`📤 Importing to: ${importUrl}`);
      console.log(`📄 Import request:`, JSON.stringify(importRequest, null, 2));

      const response = await axios.post(importUrl, importRequest, {
        headers: {
          Authorization: `Bearer ${accessToken.token}`,
          "Content-Type": "application/json",
        },
      });

      console.log(`✅ Enhanced import operation started successfully`);
      console.log(`🆔 Operation name: ${response.data.name || "N/A"}`);

      return {
        success: true,
        status: "import_started",
        message: "增強版檔案導入操作已啟動",
        operationName: response.data.name,
        importConfig: importConfig,
        corpusName: corpusName,
        response: response.data,
      };
    } catch (error) {
      console.error(`❌ Enhanced import failed:`, error.message);
      console.error("Error details:", {
        response: error.response?.data,
        status: error.response?.status,
      });

      const isQuotaError =
        error.response?.data?.error?.code === 429 ||
        error.response?.data?.error?.status === "RESOURCE_EXHAUSTED" ||
        error.response?.data?.error?.message?.includes("Quota exceeded");

      return {
        success: false,
        error: error.response?.data || error.message,
        isQuotaError: isQuotaError,
        userMessage: isQuotaError
          ? "目前系統繁忙，請稍後再試"
          : "增強版檔案導入失敗",
      };
    }
  }

  // 🛠️ 創建不同數據來源的導入配置
  // 根據官方文檔支援: Cloud Storage, Google Drive, Slack, Jira, SharePoint
  createImportConfig(sourceType, sourceConfig) {
    const configs = {
      // Cloud Storage 來源
      gcs: {
        gcs_source: {
          uris: sourceConfig.uris || [],
        },
      },

      // Google Drive 來源
      drive: {
        google_drive_source: {
          resource_ids: sourceConfig.resourceIds || [],
        },
      },

      // Slack 來源
      slack: {
        slack_source: {
          channels: [
            {
              api_key_config: {
                api_key_secret_version: sourceConfig.apiKeySecretVersion,
              },
              channels: sourceConfig.channels || [],
            },
          ],
        },
      },

      // Jira 來源
      jira: {
        jira_source: {
          jira_queries: [
            {
              projects: sourceConfig.projects || [],
              custom_queries: sourceConfig.customQueries || [],
              email: sourceConfig.email,
              server_uri: sourceConfig.serverUri,
              api_key_config: {
                api_key_secret_version: sourceConfig.apiKeySecretVersion,
              },
            },
          ],
        },
      },

      // SharePoint 來源
      sharepoint: {
        share_point_sources: {
          share_point_source: [
            {
              client_id: sourceConfig.clientId,
              api_key_config: {
                api_key_secret_version: sourceConfig.apiKeySecretVersion,
              },
              tenant_id: sourceConfig.tenantId,
              sharepoint_site_name: sourceConfig.siteName,
              sharepoint_folder_path: sourceConfig.folderPath || "",
              drive_name: sourceConfig.driveName,
            },
          ],
        },
      },
    };

    return configs[sourceType] || null;
  }

  // 🔍 檢查導入操作狀態
  async checkImportOperationStatus(operationName) {
    try {
      const authClient = await this.auth.getClient();
      const accessToken = await authClient.getAccessToken();

      // 操作狀態檢查 URL
      const statusUrl = `https://${this.location}-aiplatform.googleapis.com/v1beta1/${operationName}`;

      console.log(`🔍 Checking operation status: ${statusUrl}`);

      const response = await axios.get(statusUrl, {
        headers: {
          Authorization: `Bearer ${accessToken.token}`,
          "Content-Type": "application/json",
        },
      });

      const operation = response.data;
      const isDone = operation.done || false;
      const hasError = operation.error ? true : false;

      let status = "running";
      if (isDone && hasError) {
        status = "failed";
      } else if (isDone && !hasError) {
        status = "completed";
      }

      console.log(`📊 Operation status: ${status}, Done: ${isDone}`);

      return {
        success: true,
        operationName: operationName,
        status: status,
        done: isDone,
        error: operation.error || null,
        result: operation.response || null,
        metadata: operation.metadata || null,
        rawResponse: operation,
      };
    } catch (error) {
      console.error(`❌ Failed to check operation status:`, error.message);
      return {
        success: false,
        error: error.response?.data || error.message,
        operationName: operationName,
      };
    }
  }

  // 📋 用戶所有文檔列表（支援多 Engine，前端與測試專用）
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

      // 🆕 獲取 ragId 以查詢文件名映射
      const ragId = corpusName.split("/").pop();
      const fileMapping = await this.getFileNameMapping(ragId);

      const formattedFiles = files.map((file) => {
        const ragFileId = file.name ? file.name.split("/").pop() : "unknown";
        const originalName = fileMapping.success
          ? fileMapping.mapping[ragFileId] || ragFileId
          : ragFileId;

        return {
          id: ragFileId,
          name: originalName, // 🆕 使用原始文件名
          displayName: file.displayName || originalName,
          size: "unknown",
          type: "document",
          uploadTime: file.createTime || "unknown",
          source: file.ragFileSource || "unknown",
          corpusName: corpusName,
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

  // 🗑️ 刪除用戶文檔（改进版 - 使用資料庫權限檢查）
  async deleteUserDocument(userId, ragFileId, ragId = null, canUserAccessRAG) {
    try {
      let targetRagId = ragId;

      // 如果沒有提供 ragId，嘗試從用戶的 RAG Engine 中查找
      if (!targetRagId) {
        console.log("No ragId provided, need to implement engine lookup");
        return {
          success: false,
          error: "ragId is required for document deletion",
        };
      }

      if (!targetRagId) {
        return {
          success: false,
          error: "找不到對應的 RAG Engine",
        };
      }

      // 檢查用戶權限
      const hasAccess = await canUserAccessRAG(userId, targetRagId);
      if (!hasAccess) {
        return {
          success: false,
          error: "您沒有權限刪除此文檔",
        };
      }

      const authClient = await this.auth.getClient();
      const accessToken = await authClient.getAccessToken();

      const corpusName = `projects/${this.projectId}/locations/${this.location}/ragCorpora/${targetRagId}`;
      const deleteUrl = `https://${this.location}-aiplatform.googleapis.com/v1beta1/${corpusName}/ragFiles/${ragFileId}`;

      console.log(`🗑️ Deleting document: ${ragFileId} from ${corpusName}`);

      const response = await axios.delete(deleteUrl, {
        headers: {
          Authorization: `Bearer ${accessToken.token}`,
          "Content-Type": "application/json",
        },
      });

      console.log("Delete response:", response.status);

      return {
        success: true,
        message: "文檔已成功刪除",
        deletedFileId: ragFileId,
      };
    } catch (error) {
      console.error(`❌ Failed to delete document ${ragFileId}:`);
      console.error("Error details:", {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
      });

      return {
        success: false,
        error: error.response?.data || error.message,
      };
    }
  }

  // 📤 用戶文檔上傳到專屬 RAG（修正版 - 使用資料庫和統一命名）
  async uploadToUserRAG(
    userId,
    file,
    fileName,
    ragId = null,
    createUserRAGEngine,
    getRAGEngineFromDB
  ) {
    try {
      let userEngine;

      if (ragId) {
        // 使用指定的 RAG Engine
        console.log(`📤 Using specified RAG Engine: ${ragId}`);
        const engineResult = await getRAGEngineFromDB(ragId);

        if (!engineResult.success) {
          return {
            success: false,
            error: `指定的 RAG Engine 不存在: ${ragId}`,
          };
        }

        userEngine = {
          id: ragId,
          fullName: `projects/${this.projectId}/locations/${this.location}/ragCorpora/${ragId}`,
          displayName: engineResult.ragEngine.ragname,
          ragName: engineResult.ragEngine.ragname,
        };
      } else {
        // 🔧 先檢查用戶是否已有 RAG Engine，如果有則使用，沒有才創建
        console.log(`📤 Checking for existing RAG Engine for user: ${userId}`);

        // 先嘗試獲取用戶現有的 RAG Engine
        const existingEngineQuery = `
          SELECT ragid, ragname, visibility 
          FROM rag 
          WHERE userid = ? 
          ORDER BY created_at DESC 
          LIMIT 1
        `;
        const [existingEngines] = await this.db.execute(existingEngineQuery, [
          userId,
        ]);

        if (existingEngines.length > 0) {
          // 使用現有的 RAG Engine
          const existing = existingEngines[0];
          console.log(`📤 Using existing RAG Engine: ${existing.ragid}`);

          userEngine = {
            id: existing.ragid,
            fullName: `projects/${this.projectId}/locations/${this.location}/ragCorpora/${existing.ragid}`,
            displayName: existing.ragname,
            ragName: existing.ragname,
          };
        } else {
          // 創建新的 RAG Engine
          console.log(`📤 Creating new default RAG Engine for user: ${userId}`);
          const engineResult = await createUserRAGEngine(
            userId,
            null, // 使用默認名稱
            `Default RAG for user ${userId}`,
            "private"
          );

          if (!engineResult.success) {
            return {
              success: false,
              error: engineResult.userMessage || "無法創建 RAG Engine",
              details: engineResult,
            };
          }

          userEngine = {
            id: engineResult.corpusId,
            fullName: engineResult.corpusName,
            displayName: engineResult.displayName,
            ragName: engineResult.ragName,
          };
        }
      }

      console.log(`📤 Uploading to RAG Engine: ${userEngine.id}`);

      // 🆕 先保存文件名到資料庫，獲取生成的 fileid
      let generatedFileId = null;
      try {
        const insertFileQuery = `
          INSERT INTO rag_file_name (ragid, filename) 
          VALUES (?, ?)
        `;
        const [insertResult] = await this.db.execute(insertFileQuery, [
          userEngine.id,
          fileName,
        ]);

        // 獲取剛插入的記錄以取得生成的 fileid
        const getFileQuery = `
          SELECT fileid FROM rag_file_name 
          WHERE ragid = ? AND filename = ? 
          ORDER BY created_at DESC LIMIT 1
        `;
        const [fileResults] = await this.db.execute(getFileQuery, [
          userEngine.id,
          fileName,
        ]);

        if (fileResults.length > 0) {
          generatedFileId = fileResults[0].fileid;
          console.log(`✅ Generated file ID: ${generatedFileId}`);
        } else {
          throw new Error("Failed to get generated file ID");
        }
      } catch (dbError) {
        console.error("❌ Database error saving filename:", dbError.message);
        throw new Error(`Database error: ${dbError.message}`);
      }

      // 🆕 使用生成的 fileid 作為文件名，保留原始擴展名
      const fileExtension = fileName.split(".").pop();
      const newFileName = `${generatedFileId}.${fileExtension}`;

      // 上傳文件到 Google Cloud Storage
      const userBucketPath = `user-data/${userId}/${newFileName}`;
      const uploadResult = await this.uploadFileToEngine(
        userEngine.fullName,
        userId,
        file,
        newFileName
      );

      if (!uploadResult.success) {
        return uploadResult;
      }

      // 導入文件到 RAG Engine
      const importResult = await this.importFileToRAG(
        userEngine.fullName,
        uploadResult.bucketPath
      );

      console.log(`✅ Upload completed for user ${userId}`);

      return {
        success: true,
        userId: userId,
        fileName: fileName,
        newFileName: newFileName, // 🆕 新增
        generatedFileId: generatedFileId, // 🆕 新增
        displayName: fileName, // 顯示原始文件名
        bucketPath: `gs://${this.bucketName}/${userBucketPath}`,
        ragEngine: {
          id: userEngine.id,
          name: userEngine.fullName,
          displayName: userEngine.displayName,
          ragName: userEngine.ragName,
          fileName: fileName,
          newFileName: newFileName, // 🆕 新增
        },
        importResult: importResult,
      };
    } catch (error) {
      console.error(`❌ Failed to upload to user RAG for ${userId}:`);
      console.error("Error details:", error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async getFileNameMapping(ragId) {
    try {
      const query = `
        SELECT fileid, filename, id
        FROM rag_file_name 
        WHERE ragid = ?
        ORDER BY created_at DESC
      `;
      const [results] = await this.db.execute(query, [ragId]);

      const mapping = {};
      results.forEach((row) => {
        mapping[row.fileid] = row.filename;
      });

      return {
        success: true,
        mapping: mapping,
        count: results.length,
      };
    } catch (error) {
      console.error("Error getting file name mapping:", error);
      return {
        success: false,
        error: error.message,
        mapping: {},
      };
    }
  }
}

module.exports = FileOperations;
