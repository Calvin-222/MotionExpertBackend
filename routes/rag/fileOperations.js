const axios = require("axios");
const {
  auth,
  storage,
  PROJECT_ID,
  LOCATION,
  BUCKET_NAME
} = require("./config");
 const { pool } = require("../../config/database");
class FileOperations {
  constructor() {
    this.auth = auth;
    this.storage = storage;
    this.projectId = PROJECT_ID;
    this.location = LOCATION;
    this.bucketName = BUCKET_NAME;
    this.db = pool;
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

  // 📤 上傳文件到指定的 RAG Engine（加強 debug log）
  async uploadFileToEngine(corpusName, userId, fileBuffer, fileName) {
    try {
      const userBucketPath = `user-data/${userId}/${fileName}`;
      const bucket = this.storage.bucket(this.bucketName);
      const file = bucket.file(userBucketPath);

      console.log(`\n==== [File Upload Debug] ====`);
      console.log(`corpusName:`, corpusName);
      console.log(`userId:`, userId);
      console.log(`fileName:`, fileName);
      console.log(`fileBuffer typeof:`, typeof fileBuffer);
      console.log(`fileBuffer instanceof Buffer:`, Buffer.isBuffer(fileBuffer));
      console.log(`fileBuffer instanceof Array:`, Array.isArray(fileBuffer));

      // 1. 檢查 fileBuffer 是否為 Buffer，若不是則自動轉換並警告
      if (!Buffer.isBuffer(fileBuffer)) {
        console.warn(
          "[Warning] fileBuffer is not a Buffer, will convert to Buffer (may cause PDF corruption if input is not binary)"
        );
        if (typeof fileBuffer === "string") {
          fileBuffer = Buffer.from(fileBuffer, "binary");
        } else if (Array.isArray(fileBuffer)) {
          fileBuffer = Buffer.from(fileBuffer);
        } else {
          // 其他型態直接嘗試轉換
          fileBuffer = Buffer.from(String(fileBuffer), "binary");
        }
      }

      // log buffer內容
      if (Buffer.isBuffer(fileBuffer)) {
        console.log(
          `fileBuffer[0..15]:`,
          fileBuffer.slice(0, 16).toString("hex")
        );
        console.log(
          `fileBuffer as utf8 (first 100):`,
          fileBuffer.toString("utf8", 0, 100)
        );
      }
      console.log(`fileBuffer length:`, fileBuffer?.length);
      console.log(`fileBuffer constructor:`, fileBuffer?.constructor?.name);
      console.log(
        `📤 Uploading to bucket: gs://${this.bucketName}/${userBucketPath}`
      );

      // 2. 檢查副檔名判斷是否正確抓到 pdf
      const ext = fileName.split(".").pop();
      if (!ext) {
        console.warn(`[Warning] fileName has no extension: ${fileName}`);
      }
      const extLower = ext.toLowerCase();
      if (extLower !== "pdf" && fileName.toLowerCase().includes("pdf")) {
        console.warn(
          `[Warning] fileName extension check: got '${extLower}', but fileName contains 'pdf'. Please check fileName: ${fileName}`
        );
      }
      let contentType = "application/octet-stream";
      if (extLower === "pdf") contentType = "application/pdf";
      if (extLower === "txt") contentType = "text/plain";
      if (extLower === "docx")
        contentType =
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      if (extLower === "pptx")
        contentType =
          "application/vnd.openxmlformats-officedocument.presentationml.presentation";

      console.log(`contentType:`, contentType);

      const gcsMeta = {
        contentType,
        metadata: {
          uploadedBy: userId,
          originalName: fileName,
          uploadTime: new Date().toISOString(),
        },
      };
      console.log(`GCS metadata:`, JSON.stringify(gcsMeta, null, 2));

      await file.save(fileBuffer, gcsMeta);

      const gsPath = `gs://${this.bucketName}/${userBucketPath}`;
      console.log(`✅ File uploaded successfully to: ${gsPath}`);

      // 額外檢查 GCS 上的 metadata
      try {
        const [meta] = await file.getMetadata();
        console.log(
          `GCS file metadata after upload:`,
          JSON.stringify(meta, null, 2)
        );
      } catch (metaErr) {
        console.warn(`⚠️ Failed to get GCS file metadata:`, metaErr.message);
      }

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
      console.error("Error stack:", error.stack);
      return {
        success: false,
        error: error.message,
        stack: error.stack,
      };
    }
  }

  // 🔄 導入文件到指定的 RAG Engine（加強 debug log）
  async importFileToRAG(corpusName, filePath) {
    try {
      console.log(`\n==== [RAG Import Debug] ====`);
      console.log(`corpusName:`, corpusName);
      console.log(`filePath:`, filePath);
      console.log(`🔄 Importing single file: ${filePath}`);
      console.log(`🎯 Target corpus: ${corpusName}`);

      // 使用增強版功能和 Cloud Storage 配置
      const gcsConfig = this.createImportConfig("gcs", {
        uris: [filePath],
      });

      if (!gcsConfig) {
        console.error(
          `[RAG Import Debug] createImportConfig failed, gcsConfig is null`
        );
        return { success: false, error: "gcsConfig is null" };
      }

      console.log(
        `[RAG Import Debug] gcsConfig:`,
        JSON.stringify(gcsConfig, null, 2)
      );

      const importResult = await this.importFilesToRAG(corpusName, gcsConfig);
      console.log(`[RAG Import Debug] importFilesToRAG result:`, importResult);
      if (importResult && importResult.response) {
        console.log(
          `[RAG Import Debug] importFilesToRAG API response:`,
          JSON.stringify(importResult.response, null, 2)
        );
      }
      return importResult;
    } catch (error) {
      console.error(`❌ Failed to import file ${filePath} to RAG:`);
      console.error("Error details:", {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        stack: error.stack,
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
        stack: error.stack,
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
            uris: importConfig.gcs_source.uris,
          },
        },
      };

      console.log(
        `📄 Corrected import request:`,
        JSON.stringify(importRequest, null, 2)
      );
      console.log(`📤 Import URL: ${importUrl}`);

      // 額外 log 請求 headers
      const reqHeaders = {
        Authorization: `Bearer ${accessToken.token}`,
        "Content-Type": "application/json",
      };
      console.log(`Import API headers:`, JSON.stringify(reqHeaders, null, 2));

      let response;
      try {
        response = await axios.post(importUrl, importRequest, {
          headers: reqHeaders,
          timeout: 60000, // 設置 60 秒超時
        });
      } catch (apiErr) {
        console.error(`❌ Import API call failed:`, apiErr.message);
        if (apiErr.response) {
          console.error(
            `❌ Import API error response:`,
            JSON.stringify(apiErr.response.data, null, 2)
          );
          console.error(`❌ Import API error status:`, apiErr.response.status);
          console.error(
            `❌ Import API error headers:`,
            JSON.stringify(apiErr.response.headers, null, 2)
          );
        }
        throw apiErr;
      }

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
      console.error(`❌ Import error stack:`, error.stack);

      return {
        success: false,
        error: error.response?.data?.error || error.message,
        statusCode: error.response?.status,
        userMessage: "檔案導入失敗，但文件已成功上傳到 Cloud Storage",
        stack: error.stack,
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

      // 獲取 ragId 以查詢文件名映射
      const ragId = corpusName.split("/").pop();
      const fileMapping = await this.getFileNameMapping(ragId);

      const formattedFiles = files.map((file) => {
        const ragFileId = file.name ? file.name.split("/").pop() : "unknown";
        const mappingData = fileMapping.success
          ? fileMapping.mapping[ragFileId]
          : null;
        
        const originalName = mappingData ? mappingData.filename : ragFileId;
        const createdAt = mappingData ? mappingData.created_at : null;
        
        return {
          id: ragFileId,
          name: originalName,
          uploadTime: file.uploadTime || null,
          created_at: createdAt,
          ...file,
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

  // 🗑️ 智能文檔刪除 - 處理資料庫與 RAG Engine 不同步的情況
  async deleteUserDocument(userId, ragFileId, ragId = null, canUserAccessRAG) {
    try {
      let targetRagId = ragId;

      if (!targetRagId) {
        console.log("No ragId provided, need to implement engine lookup");
        return {
          success: false,
          error: "ragId is required for document deletion",
        };
      }

      // 檢查用戶權限
      // const hasAccess = await canUserAccessRAG(userId, targetRagId);
      // if (!hasAccess) {
      //   return {
      //     success: false,
      //     error: "您沒有權限刪除此文檔",
      //   };
      // }

      console.log(
        `🗑️ User ${userId} deleting document ${ragFileId} from RAG ${targetRagId}`
      );

      // 🔧 第一步：先檢查資料庫中是否有此檔案記錄
      const dbCheckQuery = `
        SELECT fileid, filename FROM rag_file_name 
        WHERE ragid = ? AND fileid = ?
      `;
      const [dbFiles] = await this.db.execute(dbCheckQuery, [
        targetRagId,
        ragFileId,
      ]);

      const fileExistsInDB = dbFiles.length > 0;
      console.log(`📋 檔案在資料庫中存在: ${fileExistsInDB}`);

      if (fileExistsInDB) {
        console.log(`📄 資料庫檔案記錄: ${dbFiles[0].filename}`);
      }

      // 🔧 第二步：檢查 Google RAG Engine 中的檔案
      const authClient = await this.auth.getClient();
      const accessToken = await authClient.getAccessToken();

      const corpusName = `projects/${this.projectId}/locations/${this.location}/ragCorpora/${targetRagId}`;
      const listUrl = `https://${this.location}-aiplatform.googleapis.com/v1beta1/${corpusName}/ragFiles`;

      let actualFileId = null;
      let fileExistsInRAG = false;

      try {
        // 列出 RAG Engine 中的所有檔案
        const listResponse = await axios.get(listUrl, {
          headers: {
            Authorization: `Bearer ${accessToken.token}`,
            "Content-Type": "application/json",
          },
          timeout: 30000,
        });

        const files = listResponse.data.ragFiles || [];
        console.log(`📋 RAG Engine 中找到 ${files.length} 個檔案`);

        // 查找匹配的檔案
        for (const file of files) {
          const fileIdFromPath = file.name.split("/").pop();
          console.log(`📄 檢查檔案: ${fileIdFromPath} (${file.displayName})`);

          if (
            fileIdFromPath === ragFileId ||
            file.name.includes(ragFileId) ||
            ragFileId.includes(fileIdFromPath)
          ) {
            actualFileId = fileIdFromPath;
            fileExistsInRAG = true;
            console.log(`✅ 在 RAG Engine 中找到匹配檔案: ${actualFileId}`);
            break;
          }
        }
      } catch (listError) {
        console.error(`❌ 無法列出 RAG Engine 檔案:`, listError.response?.data);
        // 如果列表檔案失敗，我們仍然可以嘗試刪除
      }

      console.log(`📊 檔案狀態檢查結果:`);
      console.log(`   - 資料庫中存在: ${fileExistsInDB}`);
      console.log(`   - RAG Engine 中存在: ${fileExistsInRAG}`);

      let ragDeleteSuccess = false;
      let dbDeleteSuccess = false;
      let gcsDeleteSuccess = false;

      // 🗑️ 第三步：如果檔案在 RAG Engine 中存在，則刪除
      if (fileExistsInRAG && actualFileId) {
        try {
          const deleteUrl = `https://${this.location}-aiplatform.googleapis.com/v1beta1/${corpusName}/ragFiles/${actualFileId}`;
          console.log(`🗑️ 從 RAG Engine 刪除檔案: ${deleteUrl}`);

          const response = await axios.delete(deleteUrl, {
            headers: {
              Authorization: `Bearer ${accessToken.token}`,
              "Content-Type": "application/json",
            },
            timeout: 30000,
          });

          console.log(`✅ RAG Engine 刪除成功: ${response.status}`);
          ragDeleteSuccess = true;
        } catch (deleteError) {
          console.error(`❌ RAG Engine 刪除失敗:`, deleteError.response?.data);

          // 如果是 404 錯誤，表示檔案已經不存在
          if (deleteError.response?.status === 404) {
            console.log(`📝 檔案已經不存在於 RAG Engine 中 (404)`);
            ragDeleteSuccess = true;
          }
        }
      } else {
        console.log(`📝 檔案不存在於 RAG Engine 中，跳過 RAG 刪除`);
        ragDeleteSuccess = true; // 不存在就算成功
      }

      // 🗑️ 第四步：從資料庫刪除記錄
      if (fileExistsInDB) {
        try {
          const deleteQuery = `DELETE FROM rag_file_name WHERE ragid = ? AND fileid = ?`;
          await this.db.execute(deleteQuery, [targetRagId, ragFileId]);
          console.log(`✅ 資料庫記錄刪除成功`);
          dbDeleteSuccess = true;
        } catch (dbError) {
          console.error(`❌ 資料庫刪除失敗:`, dbError.message);
        }
      } else {
        console.log(`📝 檔案不存在於資料庫中，跳過資料庫刪除`);
        dbDeleteSuccess = true; // 不存在就算成功
      }

      // 🗑️ 第五步：嘗試從 Google Cloud Storage 刪除檔案
      try {
        if (fileExistsInDB && dbFiles[0].filename) {
          const originalName = dbFiles[0].filename;
          const fileExtension = originalName.split(".").pop() || "txt";
          const fileName = `user-data/${userId}/${ragFileId}.${fileExtension}`;

          const file = this.storage.bucket(this.bucketName).file(fileName);
          const [exists] = await file.exists();

          if (exists) {
            await file.delete();
            console.log(`✅ GCS 檔案刪除成功: ${fileName}`);
            gcsDeleteSuccess = true;
          } else {
            console.log(`📝 GCS 檔案不存在: ${fileName}`);
            gcsDeleteSuccess = true;
          }
        }
      } catch (gcsError) {
        console.log(`⚠️ GCS 檔案刪除警告:`, gcsError.message);
        gcsDeleteSuccess = true; // GCS 錯誤不應該影響整體結果
      }

      // 🎯 判斷整體刪除結果
      const overallSuccess = ragDeleteSuccess && dbDeleteSuccess;

      if (overallSuccess) {
        return {
          success: true,
          message: "文檔已成功刪除",
          deletedFileId: ragFileId,
          ragId: targetRagId,
          details: {
            ragDeleted: ragDeleteSuccess,
            dbDeleted: dbDeleteSuccess,
            gcsDeleted: gcsDeleteSuccess,
            existedInRAG: fileExistsInRAG,
            existedInDB: fileExistsInDB,
          },
        };
      } else {
        return {
          success: false,
          error: "檔案刪除部分失敗",
          details: {
            ragDeleted: ragDeleteSuccess,
            dbDeleted: dbDeleteSuccess,
            gcsDeleted: gcsDeleteSuccess,
            existedInRAG: fileExistsInRAG,
            existedInDB: fileExistsInDB,
          },
        };
      }
    } catch (error) {
      console.error(`❌ 刪除檔案時發生錯誤:`, error);
      return {
        success: false,
        error: error.message,
      };
    }
  }
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

      // --- [第一步：確定要使用的 RAG Engine] ---
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
        // 如果未指定，則查找或創建一個默認的 Engine
        console.log(`📤 Checking for existing RAG Engine for user: ${userId}`);
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
          const existing = existingEngines[0];
          console.log(`📤 Using existing RAG Engine: ${existing.ragid}`);
          userEngine = {
            id: existing.ragid,
            fullName: `projects/${this.projectId}/locations/${this.location}/ragCorpora/${existing.ragid}`,
            displayName: existing.ragname,
            ragName: existing.ragname,
          };
        } else {
          console.log(`📤 Creating new default RAG Engine for user: ${userId}`);
          const engineResult = await createUserRAGEngine(
            userId,
            null,
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

      console.log(
        `📤 Uploading to RAG Engine: ${userEngine.id} (${userEngine.displayName})`
      );

      // --- [第二步：在資料庫中創建檔案紀錄，並生成唯一檔名] ---
      let generatedFileId = null;
      try {
        const insertFileQuery = `INSERT INTO rag_file_name (ragid, filename) VALUES (?, ?)`;
        await this.db.execute(insertFileQuery, [userEngine.id, fileName]);

        const getFileQuery = `SELECT fileid FROM rag_file_name WHERE ragid = ? AND filename = ? ORDER BY created_at DESC LIMIT 1`;
        const [fileResults] = await this.db.execute(getFileQuery, [
          userEngine.id,
          fileName,
        ]);

        if (fileResults.length > 0) {
          generatedFileId = fileResults[0].fileid;
          console.log(`✅ Generated file ID from DB: ${generatedFileId}`);
        } else {
          throw new Error(
            "Failed to get generated file ID from database after insertion."
          );
        }
      } catch (dbError) {
        console.error(
          "❌ Database error during file record creation:",
          dbError.message
        );
        return { success: false, error: `資料庫操作失敗: ${dbError.message}` };
      }

      const fileExtension = fileName.split(".").pop() || "tmp";
      const newFileName = `${generatedFileId}.${fileExtension}`;

      // --- [第三步：上傳檔案到 Google Cloud Storage] ---
      const userBucketPath = `user-data/${userId}/${newFileName}`;
      const uploadResult = await this.uploadFileToEngine(
        userEngine.fullName,
        userId,
        file.content || file.buffer || file, // 確保傳遞正確的內容
        newFileName
      );

      if (!uploadResult.success) {
        // 如果上傳 GCS 失敗，最好刪除剛剛建立的資料庫紀錄以保持一致性
        await this.db.execute(`DELETE FROM rag_file_name WHERE fileid = ?`, [
          generatedFileId,
        ]);
        console.log(
          `↩️ Rolled back database record for file ID: ${generatedFileId}`
        );
        return uploadResult;
      }

      // --- [第四步：啟動 Google Cloud RAG 導入操作] ---
      const importResult = await this.importFileToRAG(
        userEngine.fullName,
        uploadResult.bucketPath
      );

      // --- [第五步：【核心修改】等待異步操作完成] ---

      // 1. 檢查導入操作是否成功啟動
      if (!importResult.success || !importResult.operationName) {
        console.error(
          "❌ Failed to start RAG import operation:",
          importResult.error
        );
        // 可選：清理已上傳的 GCS 檔案和資料庫紀錄
        // await this.storage.bucket(this.bucketName).file(userBucketPath).delete();
        // await this.db.execute(`DELETE FROM rag_file_name WHERE fileid = ?`, [generatedFileId]);
        return {
          success: false,
          error: "無法啟動 RAG 引擎導入操作，上傳已取消。",
          details: importResult.error,
        };
      }

      // 2. 等待長時間運行的導入操作完成 (設置 2 分鐘超時)
      console.log(
        `⏳ Waiting for import operation to complete: ${importResult.operationName}`
      );
      const completionResult = await this.waitForImportCompletion(
        importResult.operationName,
        120000
      );

      // 3. 檢查操作的最終結果
      if (
        !completionResult.success ||
        (completionResult.operationStatus &&
          completionResult.operationStatus.error)
      ) {
        const completionError =
          completionResult.error || completionResult.operationStatus.error;
        console.error(
          "❌ RAG import operation failed after waiting:",
          completionError
        );
        return {
          success: false,
          error: "檔案已上傳至雲端，但導入 RAG 引擎時發生錯誤。",
          details: completionError,
          bucketPath: uploadResult.bucketPath,
        };
      }

      // 4. 如果一切順利，表示導入真正完成
      console.log(
        `✅✅✅ File '${fileName}' successfully uploaded and imported into RAG Engine.`
      );

      // --- [第六步：返回最終成功結果] ---
      return {
        success: true,
        message: "文件已成功上傳並導入 RAG Engine。",
        userId: userId,
        fileName: fileName,
        newFileName: newFileName,
        generatedFileId: generatedFileId,
        displayName: fileName,
        bucketPath: uploadResult.bucketPath,
        ragEngine: {
          id: userEngine.id,
          name: userEngine.fullName,
          displayName: userEngine.displayName,
          ragName: userEngine.ragName,
        },
        // 返回導入完成後的詳細資訊，而非僅是啟動時的資訊
        importResult: completionResult,
      };
    } catch (error) {
      console.error(
        `❌ FATAL: An unexpected error occurred in uploadToUserRAG for user ${userId}:`
      );
      console.error("Error details:", error);
      return {
        success: false,
        error: `上傳過程中發生意外錯誤: ${error.message}`,
      };
    }
  }

  async getFileNameMapping(ragId) {
  try {
    const query = `
      SELECT fileid, filename, id, created_at
      FROM rag_file_name 
      WHERE ragid = ?
      ORDER BY created_at DESC
    `;
    const [results] = await this.db.execute(query, [ragId]);

    const mapping = {};
    results.forEach((row) => {
      // Make sure this returns an object, not a string
      mapping[row.fileid] = {
        filename: row.filename,
        created_at: row.created_at
      };
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
            uris: [filePath],
          },
        },
      };

      const importUrl = `https://${this.location}-aiplatform.googleapis.com/v1beta1/${corpusName}/ragFiles:import`;

      console.log(`📤 Import URL: ${importUrl}`);
      console.log(
        `📄 Final import request:`,
        JSON.stringify(importRequest, null, 2)
      );

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
      const errorMessage =
        error.response?.data?.error?.message || error.message;
      const errorCode =
        error.response?.data?.error?.code || error.response?.status;

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
      console.log(
        `📥 Direct import from content for user ${userId} to RAG ${ragId}`
      );
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
              error: "File content is empty",
            });
            continue;
          }

          // 轉換內容為 Buffer
          const fileBuffer = Buffer.isBuffer(file.content)
            ? file.content
            : Buffer.from(file.content, "utf-8");

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
            const [fileResults] = await this.db.execute(getFileQuery, [
              ragId,
              file.name,
            ]);

            if (fileResults.length > 0) {
              generatedFileId = fileResults[0].fileid;
              console.log(`✅ Generated file ID: ${generatedFileId}`);
            } else {
              throw new Error("Failed to get generated file ID");
            }
          } catch (dbError) {
            console.error(
              "❌ Database error saving filename:",
              dbError.message
            );
            results.push({
              name: file.name,
              success: false,
              error: `Database error: ${dbError.message}`,
            });
            continue;
          }

          // 🆕 使用生成的 fileid 作為文件名，保留原始擴展名
          const fileExtension = file.name.split(".").pop() || "txt";
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
              error: uploadResult.error,
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
                  await this.db.execute(updateQuery, [
                    actualFileId,
                    ragId,
                    generatedFileId,
                  ]);
                  console.log(`✅ Updated database with actual file ID`);
                } catch (dbUpdateError) {
                  console.error(
                    "❌ Failed to update file ID in database:",
                    dbUpdateError.message
                  );
                  updateError = `Database update failed: ${dbUpdateError.message}`;
                }
              } else {
                console.log(
                  `⚠️ Could not get actual file ID: ${fileIdResult.error}`
                );
              }
            } else {
              console.log(
                `⚠️ Import operation not completed: ${completionResult.error}`
              );
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
            error: importResult.success ? updateError : importResult.error,
          });
        } catch (fileError) {
          console.error(
            `❌ Error processing file ${file.name}:`,
            fileError.message
          );
          results.push({
            name: file.name,
            success: false,
            error: fileError.message,
          });
        }
      }

      const successCount = results.filter((r) => r.success).length;
      const failCount = results.length - successCount;

      return {
        success: successCount > 0,
        message: `成功導入 ${successCount} 個文件，失敗 ${failCount} 個`,
        results: results,
        summary: {
          total: files.length,
          success: successCount,
          failed: failCount,
        },
      };
    } catch (error) {
      console.error(`❌ Failed to import files from content:`, error.message);
      return {
        success: false,
        error: error.message,
        results: [],
      };
    }
  }

  // 🔍 等待導入操作完成並獲取文件ID
  async waitForImportCompletion(operationName, maxWaitTime = 180000) {
    try {
      const startTime = Date.now();
      console.log(
        `⏳ Waiting for import operation to complete: ${operationName}`
      );

      while (Date.now() - startTime < maxWaitTime) {
        const statusResult = await this.checkImportOperationStatus(
          operationName
        );

        if (!statusResult.success) {
          console.error(
            `❌ Failed to check operation status:`,
            statusResult.error
          );
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
            console.log(
              `✅ Import completed with ${importedFiles.length} files`
            );

            return {
              success: true,
              importedFiles: importedFiles,
              operationStatus: statusResult,
            };
          } else {
            console.log(`✅ Import completed but no file details in response`);
            return {
              success: true,
              importedFiles: [],
              operationStatus: statusResult,
            };
          }
        }

        console.log(`⏳ Operation still running, waiting 5 seconds...`);
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }

      // 超時
      console.log(`⏰ Import operation timed out after ${maxWaitTime}ms`);
      return {
        success: false,
        error: `Import operation timed out after ${maxWaitTime / 1000} seconds`,
        timeout: true,
      };
    } catch (error) {
      console.error(`❌ Error waiting for import completion:`, error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  // 📍 獲取導入文件的實際Google Cloud文件ID
  async getActualFileIdFromCorpus(
    corpusName,
    originalFileName,
    timeWindow = 30000
  ) {
    try {
      console.log(
        `🔍 Looking for file "${originalFileName}" in corpus: ${corpusName}`
      );

      const startTime = Date.now();
      while (Date.now() - startTime < timeWindow) {
        const documentsResult = await this.getUserDocuments(corpusName);

        if (documentsResult.success && documentsResult.files.length > 0) {
          // 查找最近上傳的文件
          const sortedFiles = documentsResult.files.sort(
            (a, b) => new Date(b.uploadTime) - new Date(a.uploadTime)
          );

          // 取最新的文件，假設它就是我們剛上傳的
          const latestFile = sortedFiles[0];
          console.log(
            `📍 Found latest file: ${latestFile.id} (${latestFile.name})`
          );

          return {
            success: true,
            fileId: latestFile.id,
            fileName: latestFile.name,
            uploadTime: latestFile.uploadTime,
          };
        }

        console.log(`⏳ No files found yet, waiting 3 seconds...`);
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }

      console.log(`⏰ Could not find file within ${timeWindow / 1000} seconds`);
      return {
        success: false,
        error: `Could not find imported file within time window`,
      };
    } catch (error) {
      console.error(`❌ Error getting actual file ID:`, error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }
}

module.exports = FileOperations;
