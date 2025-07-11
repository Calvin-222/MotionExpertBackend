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

  // 🔄 增強版：支援多种數據來源的檔案導入功能
  // 根據 Google 官方文檔：https://cloud.google.com/vertex-ai/generative-ai/docs/rag/rag-data-ingestion
  // 🔧 修正 importFilesToRAG 方法 - 使用正確的 API 格式
  async importFilesToRAG(corpusName, importConfig, importResultSink = null) {
    try {
      console.log(`🔄 Enhanced import operation to: ${corpusName}`);
      console.log(
        `🔄 Import config received:`,
        JSON.stringify(importConfig, null, 2)
      );

      const authClient = await this.auth.getClient();
      const accessToken = await authClient.getAccessToken();

      const importUrl = `https://${this.location}-aiplatform.googleapis.com/v1beta1/${corpusName}/ragFiles:import`;

      // 🔧 修正：使用正確的最新 API 格式
      const importRequest = {
        importRagFilesConfig: {
          gcsSource: {
            uris: importConfig.gcs_source.uris
          }
        }
      };

      console.log(
        `📄 Corrected import request:`,
        JSON.stringify(importRequest, null, 2)
      );
      console.log(`📤 Import URL: ${importUrl}`);

      const response = await axios.post(importUrl, importRequest, {
        headers: {
          Authorization: `Bearer ${accessToken.token}`,
          "Content-Type": "application/json",
        },
        timeout: 60000, // 設置 60 秒超時
      });

      console.log(
        `✅ Import response:`,
        JSON.stringify(response.data, null, 2)
      );

      return {
        success: true,
        status: "import_started",
        message: "檔案導入操作已啟動",
        operationName: response.data.name,
        response: response.data,
      };
    } catch (error) {
      console.error(
        `❌ Enhanced import failed:`,
        error.response?.data || error.message
      );
      console.error(`❌ Import error status:`, error.response?.status);
      console.error(`❌ Import error headers:`, error.response?.headers);

      return {
        success: false,
        error: error.response?.data?.error || error.message,
        statusCode: error.response?.status,
        userMessage: "檔案導入失敗，但文件已成功上傳到 Cloud Storage",
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
      console.log(`🔗 Delete URL: ${deleteUrl}`);

      // 🔧 改進的刪除邏輯 - 添加詳細錯誤處理
      let deleteSuccess = false;
      let deleteError = null;

      try {
        const response = await axios.delete(deleteUrl, {
          headers: {
            Authorization: `Bearer ${accessToken.token}`,
            "Content-Type": "application/json",
          },
          timeout: 30000, // 30秒超時
        });

        console.log(`✅ RAG delete response status: ${response.status}`);
        console.log(`✅ RAG delete response data:`, response.data);
        deleteSuccess = true;

        // 🆕 驗證文件是否真的被刪除
        console.log(`🔍 Verifying file deletion...`);
        await new Promise(resolve => setTimeout(resolve, 3000)); // 等待3秒

        try {
          const verifyUrl = `https://${this.location}-aiplatform.googleapis.com/v1beta1/${corpusName}/ragFiles`;
          const verifyResponse = await axios.get(verifyUrl, {
            headers: {
              Authorization: `Bearer ${accessToken.token}`,
              "Content-Type": "application/json",
            },
          });

          const remainingFiles = verifyResponse.data.ragFiles || [];
          const stillExists = remainingFiles.some(f => f.name && f.name.includes(ragFileId));

          if (stillExists) {
            console.log(`⚠️ File ${ragFileId} still exists in RAG Engine after deletion`);
            deleteSuccess = false;
            deleteError = "File still exists in RAG Engine after deletion attempt";
          } else {
            console.log(`✅ File ${ragFileId} successfully removed from RAG Engine`);
          }
        } catch (verifyError) {
          console.log(`⚠️ Could not verify file deletion:`, verifyError.message);
          // 不將驗證錯誤視為刪除失敗，因為可能是權限問題
        }

      } catch (apiError) {
        console.error(`❌ RAG delete API failed:`, {
          status: apiError.response?.status,
          statusText: apiError.response?.statusText,
          data: apiError.response?.data,
          message: apiError.message
        });

        deleteSuccess = false;
        deleteError = apiError.response?.data || apiError.message;

        // 如果是404錯誤，可能文件已經不存在了
        if (apiError.response?.status === 404) {
          console.log(`📝 File ${ragFileId} not found in RAG Engine (404) - treating as already deleted`);
          deleteSuccess = true;
          deleteError = null;
        }
      }

      // 🆕 從資料庫中刪除文檔記錄（只有在RAG刪除成功時才執行）
      if (deleteSuccess) {
        try {
          const deleteQuery = `
            DELETE FROM rag_file_name 
            WHERE ragid = ? AND fileid = ?
          `;
          await this.db.execute(deleteQuery, [targetRagId, ragFileId]);
          console.log(`✅ File mapping deleted from database`);
        } catch (dbError) {
          console.log(`⚠️ Database deletion warning:`, dbError.message);
          // 數據庫錯誤不應該影響整體成功狀態，因為RAG已經刪除成功
        }

        // 🆕 嘗試從 Google Cloud Storage 刪除檔案
        try {
          // 首先嘗試獲取文件名映射以確定正確的文件路徑
          const fileMapping = await this.getFileNameMapping(targetRagId);
          let fileName = null;
          
          if (fileMapping.success && fileMapping.mapping[ragFileId]) {
            // 使用映射中的文件名構建路徑
            const originalName = fileMapping.mapping[ragFileId];
            const fileExtension = originalName.split(".").pop() || 'txt';
            fileName = `user-data/${userId}/${ragFileId}.${fileExtension}`;
          } else {
            // 備用：嘗試常見的文件擴展名
            const extensions = ['txt', 'pdf', 'doc', 'docx'];
            for (const ext of extensions) {
              const testFileName = `user-data/${userId}/${ragFileId}.${ext}`;
              try {
                const file = this.storage.bucket(this.bucketName).file(testFileName);
                const [exists] = await file.exists();
                if (exists) {
                  fileName = testFileName;
                  break;
                }
              } catch (checkError) {
                // 繼續檢查其他擴展名
              }
            }
          }
          
          if (fileName) {
            await this.storage.bucket(this.bucketName).file(fileName).delete();
            console.log(`✅ File deleted from GCS: ${fileName}`);
          } else {
            console.log(`⚠️ Could not find GCS file to delete for ragFileId: ${ragFileId}`);
          }
        } catch (gcsError) {
          console.log(`⚠️ GCS file deletion warning:`, gcsError.message);
        }

        return {
          success: true,
          message: "文檔已成功刪除",
          deletedFileId: ragFileId,
          ragId: targetRagId,
        };
      } else {
        // RAG 刪除失敗
        return {
          success: false,
          error: deleteError || "無法從 RAG Engine 刪除文檔",
          details: {
            ragFileId: ragFileId,
            corpusName: corpusName,
            deleteUrl: deleteUrl
          }
        };
      }
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
        file.content || file, // 🔧 確保傳遞正確的內容
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

  // 🔧 修復的 importToRAG 方法 - 使用最新的 Google AI Platform API 格式
  async importToRAG(ragId, filePath, originalFileName) {
    try {
      console.log(`🔄 === FIXED RAG FILE IMPORT ===`);
      console.log(`📁 File: ${filePath}`);
      console.log(`🆔 RAG ID: ${ragId}`);

      const corpusName = `projects/${this.projectId}/locations/${this.location}/ragCorpora/${ragId}`;
      console.log(`🎯 Target corpus: ${corpusName}`);

      const authClient = await this.auth.getClient();
      const accessToken = await authClient.getAccessToken();

      // 🔧 使用正確的 Google AI Platform RAG API 格式 (2024年最新版本)
      const importRequest = {
        importRagFilesConfig: {
          gcsSource: {
            uris: [filePath]
          }
        }
      };

      const importUrl = `https://${this.location}-aiplatform.googleapis.com/v1beta1/${corpusName}/ragFiles:import`;

      console.log(`📤 Import URL: ${importUrl}`);
      console.log(`📄 Final import request:`, JSON.stringify(importRequest, null, 2));

      const response = await axios.post(importUrl, importRequest, {
        headers: {
          Authorization: `Bearer ${accessToken.token}`,
          "Content-Type": "application/json",
        },
        timeout: 60000,
      });

      console.log(`✅ Import successful:`, response.data);

      // 檢查是否是異步操作
      if (response.data.name && response.data.name.includes("/operations/")) {
        console.log(`⏳ Import is async operation: ${response.data.name}`);

        return {
          success: true,
          operationName: response.data.name,
          message: "檔案導入已開始，正在處理中",
          isAsync: true,
        };
      } else {
        console.log(`✅ Import completed synchronously`);
        return {
          success: true,
          response: response.data,
          message: "檔案導入 Google RAG 成功",
          isAsync: false,
        };
      }
    } catch (error) {
      console.error(`❌ === RAG IMPORT FAILED ===`);
      console.error(`❌ Error Status: ${error.response?.status}`);
      console.error(`❌ Error Data:`, error.response?.data);
      console.error(`❌ Error Headers:`, error.response?.headers);

      // 詳細錯誤分析
      const errorMessage = error.response?.data?.error?.message || error.message;
      const errorCode = error.response?.data?.error?.code || error.response?.status;

      // 根據錯誤類型提供更好的錯誤信息
      let friendlyMessage = "檔案導入失敗";
      if (errorMessage.includes("Invalid rag corpus ID")) {
        friendlyMessage = "RAG Corpus 尚未就緒，請稍後再試";
      } else if (errorMessage.includes("invalid argument")) {
        friendlyMessage = "檔案格式或請求格式不正確";
      } else if (errorMessage.includes("not found")) {
        friendlyMessage = "RAG Corpus 不存在，請先檢查 Corpus 狀態";
      }

      return {
        success: false,
        error: errorMessage,
        errorCode: errorCode,
        friendlyMessage: friendlyMessage,
        note: "檔案已上傳到 Cloud Storage，但 Google RAG 導入失敗",
      };
    }
  }

  // 📥 直接從文件內容導入到 RAG Engine（支援 JSON 格式的文件數組）
  async importFilesFromContent(userId, ragId, files) {
    try {
      console.log(`📥 Direct import from content for user ${userId} to RAG ${ragId}`);
      console.log(`📁 Files to import: ${files.length}`);

      const results = [];
      const corpusName = `projects/${this.projectId}/locations/${this.location}/ragCorpora/${ragId}`;

      for (const file of files) {
        try {
          console.log(`📄 Processing file: ${file.name}`);
          
          // 確保文件有內容
          if (!file.content) {
            results.push({
              name: file.name,
              success: false,
              error: 'File content is empty'
            });
            continue;
          }

          // 轉換內容為 Buffer
          const fileBuffer = Buffer.isBuffer(file.content) 
            ? file.content 
            : Buffer.from(file.content, 'utf-8');

          // 🆕 先保存文件名到資料庫，獲取生成的 fileid
          let generatedFileId = null;
          try {
            const insertFileQuery = `
              INSERT INTO rag_file_name (ragid, filename) 
              VALUES (?, ?)
            `;
            await this.db.execute(insertFileQuery, [ragId, file.name]);

            // 獲取剛插入的記錄以取得生成的 fileid
            const getFileQuery = `
              SELECT fileid FROM rag_file_name 
              WHERE ragid = ? AND filename = ? 
              ORDER BY created_at DESC LIMIT 1
            `;
            const [fileResults] = await this.db.execute(getFileQuery, [ragId, file.name]);

            if (fileResults.length > 0) {
              generatedFileId = fileResults[0].fileid;
              console.log(`✅ Generated file ID: ${generatedFileId}`);
            } else {
              throw new Error("Failed to get generated file ID");
            }
          } catch (dbError) {
            console.error("❌ Database error saving filename:", dbError.message);
            results.push({
              name: file.name,
              success: false,
              error: `Database error: ${dbError.message}`
            });
            continue;
          }

          // 🆕 使用生成的 fileid 作為文件名，保留原始擴展名
          const fileExtension = file.name.split(".").pop() || 'txt';
          const newFileName = `${generatedFileId}.${fileExtension}`;

          // 上傳到 GCS
          const uploadResult = await this.uploadFileToEngine(
            corpusName,
            userId,
            fileBuffer,
            newFileName
          );

          if (!uploadResult.success) {
            results.push({
              name: file.name,
              success: false,
              error: uploadResult.error
            });
            continue;
          }

          // 導入到 RAG Engine
          const importResult = await this.importFileToRAG(
            corpusName,
            uploadResult.bucketPath
          );

          let actualFileId = generatedFileId;
          let updateError = null;

          // 🆕 如果導入成功且有操作名稱，等待完成並獲取實際文件ID
          if (importResult.success && importResult.operationName) {
            console.log(`⏳ Waiting for import operation to complete...`);
            
            // 等待導入完成
            const completionResult = await this.waitForImportCompletion(
              importResult.operationName, 
              60000 // 1分鐘超時
            );
            
            if (completionResult.success) {
              // 嘗試獲取實際的文件ID
              const fileIdResult = await this.getActualFileIdFromCorpus(
                corpusName, 
                file.name,
                30000 // 30秒時間窗口
              );
              
              if (fileIdResult.success) {
                actualFileId = fileIdResult.fileId;
                console.log(`✅ Got actual file ID: ${actualFileId}`);
                
                // 🆕 更新數據庫記錄以使用實際的文件ID
                try {
                  const updateQuery = `
                    UPDATE rag_file_name 
                    SET fileid = ? 
                    WHERE ragid = ? AND fileid = ?
                  `;
                  await this.db.execute(updateQuery, [actualFileId, ragId, generatedFileId]);
                  console.log(`✅ Updated database with actual file ID`);
                } catch (dbUpdateError) {
                  console.error("❌ Failed to update file ID in database:", dbUpdateError.message);
                  updateError = `Database update failed: ${dbUpdateError.message}`;
                }
              } else {
                console.log(`⚠️ Could not get actual file ID: ${fileIdResult.error}`);
              }
            } else {
              console.log(`⚠️ Import operation not completed: ${completionResult.error}`);
            }
          }

          results.push({
            name: file.name,
            success: importResult.success,
            generatedFileId: generatedFileId,
            actualFileId: actualFileId, // 🆕 添加實際文件ID
            newFileName: newFileName,
            bucketPath: uploadResult.bucketPath,
            importResult: importResult,
            updateError: updateError, // 🆕 添加更新錯誤信息
            error: importResult.success ? updateError : importResult.error
          });

        } catch (fileError) {
          console.error(`❌ Error processing file ${file.name}:`, fileError.message);
          results.push({
            name: file.name,
            success: false,
            error: fileError.message
          });
        }
      }

      const successCount = results.filter(r => r.success).length;
      const failCount = results.length - successCount;

      return {
        success: successCount > 0,
        message: `成功導入 ${successCount} 個文件，失敗 ${failCount} 個`,
        results: results,
        summary: {
          total: files.length,
          success: successCount,
          failed: failCount
        }
      };

    } catch (error) {
      console.error(`❌ Failed to import files from content:`, error.message);
      return {
        success: false,
        error: error.message,
        results: []
      };
    }
  }

  // 🔍 等待導入操作完成並獲取文件ID
  async waitForImportCompletion(operationName, maxWaitTime = 180000) {
    try {
      const startTime = Date.now();
      console.log(`⏳ Waiting for import operation to complete: ${operationName}`);
      
      while (Date.now() - startTime < maxWaitTime) {
        const statusResult = await this.checkImportOperationStatus(operationName);
        
        if (!statusResult.success) {
          console.error(`❌ Failed to check operation status:`, statusResult.error);
          return { success: false, error: statusResult.error };
        }
        
        if (statusResult.done) {
          if (statusResult.error) {
            console.error(`❌ Import operation failed:`, statusResult.error);
            return { success: false, error: statusResult.error };
          }
          
          // 操作成功完成，嘗試提取文件ID
          if (statusResult.result && statusResult.result.ragFiles) {
            const importedFiles = statusResult.result.ragFiles;
            console.log(`✅ Import completed with ${importedFiles.length} files`);
            
            return {
              success: true,
              importedFiles: importedFiles,
              operationStatus: statusResult
            };
          } else {
            console.log(`✅ Import completed but no file details in response`);
            return {
              success: true,
              importedFiles: [],
              operationStatus: statusResult
            };
          }
        }
        
        console.log(`⏳ Operation still running, waiting 5 seconds...`);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
      
      // 超時
      console.log(`⏰ Import operation timed out after ${maxWaitTime}ms`);
      return {
        success: false,
        error: `Import operation timed out after ${maxWaitTime / 1000} seconds`,
        timeout: true
      };
      
    } catch (error) {
      console.error(`❌ Error waiting for import completion:`, error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // 📍 獲取導入文件的實際Google Cloud文件ID
  async getActualFileIdFromCorpus(corpusName, originalFileName, timeWindow = 30000) {
    try {
      console.log(`🔍 Looking for file "${originalFileName}" in corpus: ${corpusName}`);
      
      const startTime = Date.now();
      while (Date.now() - startTime < timeWindow) {
        const documentsResult = await this.getUserDocuments(corpusName);
        
        if (documentsResult.success && documentsResult.files.length > 0) {
          // 查找最近上傳的文件
          const sortedFiles = documentsResult.files.sort((a, b) => 
            new Date(b.uploadTime) - new Date(a.uploadTime)
          );
          
          // 取最新的文件，假設它就是我們剛上傳的
          const latestFile = sortedFiles[0];
          console.log(`📍 Found latest file: ${latestFile.id} (${latestFile.name})`);
          
          return {
            success: true,
            fileId: latestFile.id,
            fileName: latestFile.name,
            uploadTime: latestFile.uploadTime
          };
        }
        
        console.log(`⏳ No files found yet, waiting 3 seconds...`);
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
      
      console.log(`⏰ Could not find file within ${timeWindow / 1000} seconds`);
      return {
        success: false,
        error: `Could not find imported file within time window`
      };
      
    } catch (error) {
      console.error(`❌ Error getting actual file ID:`, error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = FileOperations;
