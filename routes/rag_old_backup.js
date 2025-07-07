// const express = require("express");
// const router = express.Router();
// const multer = require("multer");
// const axios = require("axios");

// // 導入模組化的 RAG 系統
// const { MultiUserRAGSystem, authenticateToken, config } = require('./rag');

// const upload = multer({
//   storage: multer.memoryStorage(),
//   limits: { fileSize: 50 * 1024 * 1024 },
// });

// // 從配置中獲取常數
// const { PROJECT_ID, LOCATION, auth } = config;

// // 初始化 RAG 系統實例
// const ragSystem = new MultiUserRAGSystem();
//     try {
//       const authClient = await this.auth.getClient();
//       const accessToken = await authClient.getAccessToken();

//       const createUrl = `https://${this.location}-aiplatform.googleapis.com/v1beta1/projects/${this.projectId}/locations/${this.location}/ragCorpora`;

//       // 統一命名：只使用 userId 作為 displayName
//       const engineDisplayName = userId;
//       const finalRagName = engineName || `${userId}_default_rag`;

//       const engineDescription =
//         description ||
//         `RAG corpus for user ${userId}${
//           engineName ? ` - ${engineName}` : ""
//         } - Created ${new Date().toISOString()}`;

//       const corpusData = {
//         displayName: engineDisplayName,
//         description: engineDescription,
//       };

//       console.log(`Creating RAG Engine for user ${userId}...`);
//       console.log("Request URL:", createUrl);
//       console.log("Request payload:", JSON.stringify(corpusData, null, 2));

//       const response = await axios.post(createUrl, corpusData, {
//         headers: {
//           Authorization: `Bearer ${accessToken.token}`,
//           "Content-Type": "application/json",
//         },
//       });

//       console.log(
//         "Create response received:",
//         JSON.stringify(response.data, null, 2)
//       );

//       let corpusId, corpusName, finalDisplayName;

//       // 檢查是否是異步操作
//       if (response.data.name && response.data.name.includes("/operations/")) {
//         console.log(
//           "RAG Engine creation is an async operation, waiting for completion..."
//         );

//         const operationResult = await this.waitForOperation(response.data.name);

//         if (!operationResult.success) {
//           throw new Error(`Operation failed: ${operationResult.error}`);
//         }

//         corpusName = operationResult.result?.name;
//         if (!corpusName) {
//           throw new Error("No corpus name found in operation result");
//         }

//         corpusId = corpusName.split("/").pop();
//         finalDisplayName =
//           operationResult.result?.displayName || engineDisplayName;
//       } else {
//         corpusName = response.data.name;
//         corpusId = corpusName.split("/").pop();
//         finalDisplayName = response.data.displayName;
//       }

//       // 保存到資料庫
//       try {
//         const insertQuery = `
//           INSERT INTO rag (ragid, userid, ragname, visibility, created_at, updated_at) 
//           VALUES (?, ?, ?, ?, NOW(), NOW())
//         `;
//         await this.db.execute(insertQuery, [
//           corpusId,
//           userId,
//           finalRagName,
//           visibility,
//         ]);
//         console.log(`✅ RAG Engine saved to database: ${corpusId}`);
//       } catch (dbError) {
//         console.error("❌ Failed to save to database:", dbError.message);
//         // 如果資料庫保存失敗，考慮是否要刪除已創建的 Google RAG Engine
//         // 這裡可以選擇繼續，但要記錄錯誤
//       }

//       console.log(`✅ RAG Engine created for user ${userId}`);
//       console.log("Full corpus name:", corpusName);
//       console.log("Corpus ID:", corpusId);

//       return {
//         success: true,
//         userId: userId,
//         corpusId: corpusId,
//         corpusName: corpusName,
//         displayName: finalDisplayName,
//         ragName: finalRagName,
//         visibility: visibility,
//         bucketPath: `user-data/${userId}`,
//         createdAt: new Date().toISOString(),
//       };
//     } catch (error) {
//       console.error(`❌ Failed to create RAG Engine for user ${userId}:`);
//       console.error("Error details:", {
//         message: error.message,
//         response: error.response?.data,
//         status: error.response?.status,
//       });

//       // 檢查是否為配額限制錯誤
//       const isQuotaError =
//         error.response?.data?.error?.code === 429 ||
//         error.response?.data?.error?.status === "RESOURCE_EXHAUSTED" ||
//         error.response?.data?.error?.message?.includes("Quota exceeded");

//       let userFriendlyMessage = "Engine 創建失敗";

//       if (isQuotaError) {
//         userFriendlyMessage =
//           "Google Cloud API 配額限制，請稍後再試。系統每分鐘限制60次 RAG 操作。";
//         console.log("🚨 配額限制檢測到，建議等待後重試");
//       }

//       return {
//         success: false,
//         error: error.response?.data || error.message,
//         userMessage: userFriendlyMessage,
//         isQuotaError: isQuotaError,
//         details: {
//           status: error.response?.status,
//           message: error.message,
//           quotaInfo: isQuotaError
//             ? {
//                 limit: "60 requests per minute per region",
//                 suggestion: "請等待1-2分鐘後重試，或聯繫管理員申請提高配額",
//               }
//             : null,
//         },
//       };
//     }
//   }

//   // 🕐 等待操作完成
//   async waitForOperation(operationName, maxWaitTime = 300000) {
//     try {
//       const authClient = await this.auth.getClient();
//       const startTime = Date.now();

//       console.log(`⏳ Waiting for operation to complete: ${operationName}`);

//       while (Date.now() - startTime < maxWaitTime) {
//         const accessToken = await authClient.getAccessToken();

//         const statusUrl = `https://${this.location}-aiplatform.googleapis.com/v1beta1/${operationName}`;

//         const response = await axios.get(statusUrl, {
//           headers: {
//             Authorization: `Bearer ${accessToken.token}`,
//             "Content-Type": "application/json",
//           },
//         });

//         const operation = response.data;
//         console.log(
//           `Operation status: done=${operation.done}, name=${operation.name}`
//         );

//         if (operation.done) {
//           if (operation.error) {
//             console.error("Operation failed:", operation.error);
//             return {
//               success: false,
//               error: operation.error,
//             };
//           }

//           console.log("✅ Operation completed successfully");
//           return {
//             success: true,
//             result: operation.response,
//             metadata: operation.metadata,
//           };
//         }

//         // 等待 10 秒後重試
//         await new Promise((resolve) => setTimeout(resolve, 10000));
//       }

//       return {
//         success: false,
//         error: "Operation timeout",
//       };
//     } catch (error) {
//       console.error("Error waiting for operation:", error.message);
//       return {
//         success: false,
//         error: error.message,
//       };
//     }
//   }

//   // 📋 列出所有 RAG Engines - 整合資料庫信息
//   async listAllRAGEngines() {
//     try {
//       return await this.rateLimitedCall(async () => {
//         const authClient = await this.auth.getClient();
//         const accessToken = await authClient.getAccessToken();

//         let allCorpora = [];
//         let nextPageToken = null;
//         let pageCount = 0;

//         do {
//           pageCount++;
//           const params = new URLSearchParams();
//           params.append("pageSize", "100");
//           if (nextPageToken) {
//             params.append("pageToken", nextPageToken);
//           }

//           const listUrl = `https://${
//             this.location
//           }-aiplatform.googleapis.com/v1beta1/projects/${
//             this.projectId
//           }/locations/${this.location}/ragCorpora?${params.toString()}`;

//           console.log(`Fetching RAG engines page ${pageCount} from:`, listUrl);

//           const response = await axios.get(listUrl, {
//             headers: {
//               Authorization: `Bearer ${accessToken.token}`,
//               "Content-Type": "application/json",
//             },
//           });

//           const pageCorpora = response.data.ragCorpora || [];
//           allCorpora = allCorpora.concat(pageCorpora);
//           nextPageToken = response.data.nextPageToken;

//           console.log(
//             `Page ${pageCount}: Found ${pageCorpora.length} RAG engines`
//           );
//           console.log(`Total so far: ${allCorpora.length} RAG engines`);

//           if (nextPageToken) {
//             await new Promise((resolve) => setTimeout(resolve, 1000));
//           }
//         } while (nextPageToken);

//         console.log(
//           `TOTAL: Found ${allCorpora.length} RAG engines across ${pageCount} pages`
//         );

//         // 從資料庫獲取所有 RAG Engine 信息
//         const dbRagsQuery = `
//           SELECT r.*, u.username as owner_username
//           FROM rag r 
//           JOIN users u ON r.userid = u.userid
//         `;
//         const [dbRags] = await this.db.execute(dbRagsQuery);
//         const dbRagMap = new Map(dbRags.map((rag) => [rag.ragid, rag]));

//         const enginesWithDetails = await Promise.all(
//           allCorpora.map(async (corpus) => {
//             const details = await this.getEngineFileCount(corpus.name);
//             const corpusId = corpus.name.split("/").pop();
//             const dbInfo = dbRagMap.get(corpusId);

//             return {
//               id: corpusId,
//               fullName: corpus.name,
//               displayName: corpus.displayName,
//               description: corpus.description,
//               createTime: corpus.createTime,
//               updateTime: corpus.updateTime,
//               fileCount: details.fileCount,
//               status: details.status,
//               // 從資料庫獲取的信息
//               ragName: dbInfo?.ragname,
//               visibility: dbInfo?.visibility,
//               ownerId: dbInfo?.userid,
//               ownerUsername: dbInfo?.owner_username,
//               dbCreateTime: dbInfo?.created_at,
//               dbUpdateTime: dbInfo?.updated_at,
//               isUserEngine: !!dbInfo, // 如果在資料庫中存在就是用戶 Engine
//               userId: dbInfo?.userid || this.extractUserIdFromEngine(corpus),
//             };
//           })
//         );

//         return {
//           success: true,
//           totalEngines: allCorpora.length,
//           userEngines: enginesWithDetails.filter((e) => e.isUserEngine),
//           systemEngines: enginesWithDetails.filter((e) => !e.isUserEngine),
//           allEngines: enginesWithDetails,
//           pagesProcessed: pageCount,
//         };
//       });
//     } catch (error) {
//       console.error(
//         "List RAG engines error:",
//         error.response?.data || error.message
//       );

//       if (error.response?.data?.error?.code === 429) {
//         console.log("API quota exceeded, returning empty result");
//         return {
//           success: true,
//           totalEngines: 0,
//           userEngines: [],
//           systemEngines: [],
//           allEngines: [],
//           pagesProcessed: 0,
//           error: "API quota exceeded",
//         };
//       }

//       return {
//         success: false,
//         error: error.response?.data || error.message,
//       };
//     }
//   }

//   // 🔍 從 Engine 中提取用戶 ID（改进版 - 支持數據庫 UUID 和舊格式用戶名）
//   extractUserIdFromEngine(corpus) {
//     // 嘗試從 displayName 中提取（新格式：userId - engineName）
//     if (corpus.displayName) {
//       // 匹配新格式 "userId - engineName"
//       const newFormatMatch = corpus.displayName.match(
//         /^([a-f0-9\-]{36}) - (.+)$/
//       );
//       if (newFormatMatch) {
//         return newFormatMatch[1]; // 返回 userId
//       }

//       // 匹配舊格式 "userId-engineName"
//       const oldFormatMatch = corpus.displayName.match(
//         /^([a-f0-9\-]{36})-(.+)$/
//       );
//       if (oldFormatMatch) {
//         return oldFormatMatch[1]; // 返回 userId
//       }

//       // 匹配 Knowledge Base 格式 "userId Knowledge Base"
//       const kbFormatMatch = corpus.displayName.match(
//         /^([a-f0-9\-]{36}) Knowledge Base$/
//       );
//       if (kbFormatMatch) {
//         return kbFormatMatch[1]; // 返回 userId
//       }

//       // 🆕 匹配舊的用戶名格式 "username's Knowledge Base"
//       const legacyKbFormatMatch = corpus.displayName.match(
//         /^(.+)'s Knowledge Base$/
//       );
//       if (legacyKbFormatMatch) {
//         return legacyKbFormatMatch[1]; // 返回用戶名
//       }

//       // 🆕 匹配其他舊格式 "username-engineName"
//       const legacyFormatMatch = corpus.displayName.match(/^([^-]+)-(.+)$/);
//       if (
//         legacyFormatMatch &&
//         !legacyFormatMatch[1].match(/^[a-f0-9\-]{36}$/)
//       ) {
//         return legacyFormatMatch[1]; // 返回用戶名（非UUID）
//       }
//     }

//     // 嘗試從 description 中提取用戶 ID（UUID格式）
//     if (corpus.description) {
//       const uuidMatch = corpus.description.match(/user ([a-f0-9\-]{36})/i);
//       if (uuidMatch) {
//         return uuidMatch[1];
//       }

//       // 🆕 嘗試從 description 中提取舊格式用戶名
//       const legacyUserMatch = corpus.description.match(/user ([^-\s]+)/i);
//       if (legacyUserMatch) {
//         return legacyUserMatch[1];
//       }
//     }

//     return null;
//   }

//   // 🔍 獲取 Engine 文件數量
//   async getEngineFileCount(corpusName) {
//     try {
//       const authClient = await this.auth.getClient();
//       const accessToken = await authClient.getAccessToken();

//       const filesUrl = `https://${this.location}-aiplatform.googleapis.com/v1beta1/${corpusName}/ragFiles`;

//       const response = await axios.get(filesUrl, {
//         headers: {
//           Authorization: `Bearer ${accessToken.token}`,
//           "Content-Type": "application/json",
//         },
//       });

//       const files = response.data.ragFiles || [];

//       return {
//         fileCount: files.length,
//         status: files.length > 0 ? "active" : "empty",
//         recentFiles: files.slice(-3),
//       };
//     } catch (error) {
//       console.error(
//         `Error getting file count for ${corpusName}:`,
//         error.message
//       );
//       return {
//         fileCount: 0,
//         status: "unknown",
//         recentFiles: [],
//       };
//     }
//   }

//   // 📋 用戶所有文檔列表（支援多 Engine，前端與測試專用）
//   async getUserDocuments(corpusName) {
//   try {
//     const authClient = await this.auth.getClient();
//     const accessToken = await authClient.getAccessToken();

//     const filesUrl = `https://${this.location}-aiplatform.googleapis.com/v1beta1/${corpusName}/ragFiles`;

//     console.log(`Getting documents from: ${filesUrl}`);

//     const response = await axios.get(filesUrl, {
//       headers: {
//         Authorization: `Bearer ${accessToken.token}`,
//         "Content-Type": "application/json",
//       },
//     });

//     const files = response.data.ragFiles || [];
    
//     // 🆕 獲取 ragId 以查詢文件名映射
//     const ragId = corpusName.split('/').pop();
//     const fileMapping = await this.getFileNameMapping(ragId);

//     const formattedFiles = files.map((file) => {
//       const fileId = file.name.split("/").pop();
      
//       // 🆕 嘗試從資料庫獲取原始文件名
//       let originalFileName = file.displayName || fileId;
      
//       if (fileMapping.success && fileMapping.mapping) {
//         // 尋找匹配的 fileid（可能包含在 displayName 或 metadata 中）
//         for (const [mappedFileId, mappedFileName] of Object.entries(fileMapping.mapping)) {
//           if (file.displayName && file.displayName.includes(mappedFileId)) {
//             originalFileName = mappedFileName;
//             break;
//           }
//         }
//       }

//       return {
//         id: fileId,
//         ragFileId: fileId,
//         name: originalFileName, // 🆕 顯示原始文件名
//         displayName: originalFileName, // 🆕 顯示原始文件名
//         fullName: file.name,
//         createTime: file.createTime,
//         updateTime: file.updateTime,
//         sizeBytes: file.sizeBytes,
//         ragFileType: file.ragFileType,
//       };
//     });

//     return {
//       success: true,
//       files: formattedFiles,
//       totalFiles: formattedFiles.length,
//     };
//   } catch (error) {
//     console.error(
//       `Error getting documents from ${corpusName}:`,
//       error.message
//     );
//     return {
//       success: false,
//       error: error.message,
//       files: [],
//     };
//   }
// }

//   // 🗑️ 刪除用戶文檔（改进版 - 使用資料庫權限檢查）
//   async deleteUserDocument(userId, ragFileId, ragId = null) {
//     try {
//       let targetRagId = ragId;

//       // 如果沒有提供 ragId，嘗試從用戶的 RAG Engine 中查找
//       if (!targetRagId) {
//         const accessibleRags = await this.getUserAccessibleRAGEngines(userId);
//         if (!accessibleRags.success) {
//           return {
//             success: false,
//             error: "無法獲取用戶可訪問的 RAG Engine",
//           };
//         }

//         // 查找包含該文檔的 RAG Engine
//         for (const rag of accessibleRags.ownRags) {
//           const corpusName = `projects/${this.projectId}/locations/${this.location}/ragCorpora/${rag.ragid}`;
//           const documents = await this.getUserDocuments(corpusName);
//           const hasDocument = documents.files?.some(
//             (doc) =>
//               doc.ragFileId === ragFileId || doc.displayName === ragFileId
//           );
//           if (hasDocument) {
//             targetRagId = rag.ragid;
//             break;
//           }
//         }
//       }

//       if (!targetRagId) {
//         return {
//           success: false,
//           error: "找不到包含該文檔的 RAG Engine",
//         };
//       }

//       // 檢查用戶權限
//       const hasAccess = await this.canUserAccessRAG(userId, targetRagId);
//       if (!hasAccess) {
//         return {
//           success: false,
//           error: "您沒有權限刪除此文檔",
//         };
//       }

//       const authClient = await this.auth.getClient();
//       const accessToken = await authClient.getAccessToken();

//       const corpusName = `projects/${this.projectId}/locations/${this.location}/ragCorpora/${targetRagId}`;
//       const deleteUrl = `https://${this.location}-aiplatform.googleapis.com/v1beta1/${corpusName}/ragFiles/${ragFileId}`;

//       console.log(`Deleting document: ${deleteUrl}`);

//       await axios.delete(deleteUrl, {
//         headers: {
//           Authorization: `Bearer ${accessToken.token}`,
//           "Content-Type": "application/json",
//         },
//       });

//       return {
//         success: true,
//         message: "Document deleted successfully",
//         documentId: ragFileId,
//         userId: userId,
//         ragId: targetRagId,
//       };
//     } catch (error) {
//       console.error(
//         `Error deleting document ${ragFileId} for user ${userId}:`,
//         error.response?.data || error.message
//       );
//       return {
//         success: false,
//         error: error.response?.data || error.message,
//       };
//     }
//   }

//   // 📤 用戶文檔上傳到專屬 RAG（修正版 - 使用資料庫和統一命名）
//   async uploadToUserRAG(userId, file, fileName, ragId = null) {
//   try {
//     console.log(
//       `📤 Starting upload process for user ${userId}, file: ${fileName}`
//     );

//     let userEngine = null;

//     if (ragId) {
//       // 如果指定了 ragId，檢查用戶是否有權限訪問
//       const hasAccess = await this.canUserAccessRAG(userId, ragId);
//       if (!hasAccess) {
//         throw new Error("您沒有權限上傳到此 RAG Engine");
//       }

//       const dbInfo = await this.getRAGEngineFromDB(ragId);
//       if (dbInfo) {
//         userEngine = {
//           id: ragId,
//           fullName: `projects/${this.projectId}/locations/${this.location}/ragCorpora/${ragId}`,
//           displayName: userId, // 統一使用 userId 作為 displayName
//           ragName: dbInfo.ragname,
//           userId: dbInfo.userid,
//         };
//       }
//     } else {
//       // 如果沒有指定 ragId，查找用戶的默認 RAG Engine
//       const accessibleRags = await this.getUserAccessibleRAGEngines(userId);
//       if (accessibleRags.success && accessibleRags.ownRags.length > 0) {
//         const defaultRag = accessibleRags.ownRags[0]; // 使用第一個作為默認
//         userEngine = {
//           id: defaultRag.ragid,
//           fullName: `projects/${this.projectId}/locations/${this.location}/ragCorpora/${defaultRag.ragid}`,
//           displayName: userId,
//           ragName: defaultRag.ragname,
//           userId: defaultRag.userid,
//         };
//       }
//     }

//     // 如果沒有找到 Engine，創建一個新的
//     if (!userEngine) {
//       console.log(
//         `No existing RAG Engine found for user ${userId}, creating new one...`
//       );
//       const createResult = await this.createUserRAGEngine(userId);

//       if (!createResult.success) {
//         throw new Error(
//           `Failed to create RAG engine for user: ${JSON.stringify(
//             createResult.error
//           )}`
//         );
//       }

//       userEngine = {
//         id: createResult.corpusId,
//         fullName: createResult.corpusName,
//         displayName: createResult.displayName,
//         ragName: createResult.ragName,
//         userId: userId,
//       };
//       console.log(
//         `✅ Created new RAG Engine: ${userEngine.id} for user: ${userId}`
//       );
//     } else {
//       console.log(
//         `✅ Using existing RAG Engine: ${userEngine.id} for user: ${userId}`
//       );
//     }

//     // 🆕 先保存文件名到資料庫，獲取生成的 fileid
//     let generatedFileId = null;
//     try {
//       const insertFileQuery = `
//         INSERT INTO rag_file_name (ragid, filename) 
//         VALUES (?, ?)
//       `;
//       const [insertResult] = await this.db.execute(insertFileQuery, [
//         userEngine.id,
//         fileName
//       ]);

//       // 獲取剛插入的記錄以取得生成的 fileid
//       const getFileQuery = `
//         SELECT fileid FROM rag_file_name 
//         WHERE ragid = ? AND filename = ? 
//         ORDER BY created_at DESC LIMIT 1
//       `;
//       const [fileResults] = await this.db.execute(getFileQuery, [
//         userEngine.id,
//         fileName
//       ]);

//       if (fileResults.length > 0) {
//         generatedFileId = fileResults[0].fileid;
//         console.log(`✅ Generated file ID: ${generatedFileId}`);
//       } else {
//         throw new Error("Failed to get generated file ID");
//       }
//     } catch (dbError) {
//       console.error("❌ Database error saving filename:", dbError.message);
//       throw new Error(`Database error: ${dbError.message}`);
//     }

//     // 🆕 使用生成的 fileid 作為文件名，保留原始擴展名
//     const fileExtension = fileName.split('.').pop();
//     const newFileName = `${generatedFileId}.${fileExtension}`;
    
//     // 上傳文件到用戶專屬路徑，使用新的文件名
//     const timestamp = Date.now();
//     const userBucketPath = `user-data/${userId}/${timestamp}-${newFileName}`;
//     console.log(`📁 Uploading to bucket path: ${userBucketPath}`);

//     const bucket = this.storage.bucket(this.bucketName);

//     try {
//       const [bucketExists] = await bucket.exists();
//       if (!bucketExists) {
//         console.log(`Creating bucket: ${this.bucketName}`);
//         await this.storage.createBucket(this.bucketName, {
//           location: this.location,
//           storageClass: "STANDARD",
//         });
//       }
//     } catch (bucketError) {
//       console.error("Bucket check/create error:", bucketError.message);
//     }

//     const bucketFile = bucket.file(userBucketPath);
//     await bucketFile.save(file, {
//       metadata: {
//         contentType: "text/plain",
//         metadata: {
//           userId: userId,
//           originalName: fileName,
//           newFileName: newFileName,
//           generatedFileId: generatedFileId,
//           uploadedAt: new Date().toISOString(),
//           ragEngine: userEngine.id,
//         },
//       },
//     });

//     console.log(
//       `✅ File uploaded to Cloud Storage: gs://${this.bucketName}/${userBucketPath}`
//     );

//     // 導入到 RAG Engine
//     console.log(`🔄 Importing file to RAG Engine: ${userEngine.fullName}`);

//     if (userEngine.fullName.includes("/operations/")) {
//       console.error(
//         "❌ Invalid corpus name - appears to be an operation name"
//       );
//       throw new Error(
//         "RAG Engine creation may not be complete. Please try again later."
//       );
//     }

//     const importResult = await this.importFileToRAG(
//       userEngine.fullName,
//       userBucketPath
//     );

//     if (!importResult.success) {
//       console.error("Import to RAG failed:", importResult.error);
//     } else {
//       console.log(`✅ Import operation started: ${importResult.operationId}`);
//     }

//     return {
//       success: true,
//       userId: userId,
//       fileName: fileName,
//       newFileName: newFileName,           // 🆕 新增
//       generatedFileId: generatedFileId,   // 🆕 新增
//       displayName: fileName, // 顯示原始文件名
//       bucketPath: `gs://${this.bucketName}/${userBucketPath}`,
//       ragEngine: {
//         id: userEngine.id,
//         name: userEngine.fullName,
//         displayName: userEngine.displayName,
//         ragName: userEngine.ragName,
//         fileName: fileName,
//         newFileName: newFileName,         // 🆕 新增
//       },
//       importResult: importResult,
//     };
//   } catch (error) {
//     console.error(`❌ Upload to user RAG error (${userId}):`, error);
//     return {
//       success: false,
//       error: error.message,
//       stack: error.stack,
//     };
//   }
// }

// async getFileNameMapping(ragId) {
//   try {
//     const query = `
//       SELECT fileid, filename, id
//       FROM rag_file_name 
//       WHERE ragid = ?
//       ORDER BY created_at DESC
//     `;
//     const [results] = await this.db.execute(query, [ragId]);
    
//     const mapping = {};
//     results.forEach(row => {
//       mapping[row.fileid] = row.filename;
//     });
    
//     return {
//       success: true,
//       mapping: mapping,
//       count: results.length
//     };
//   } catch (error) {
//     console.error("Error getting file name mapping:", error);
//     return {
//       success: false,
//       error: error.message,
//       mapping: {}
//     };
//   }
// }

// // 🆕 根據 fileid 獲取原始文件名
// async getOriginalFileName(ragId, fileId) {
//   try {
//     const query = `
//       SELECT filename, fileid
//       FROM rag_file_name 
//       WHERE ragid = ? AND fileid = ?
//     `;
//     const [results] = await this.db.execute(query, [ragId, fileId]);
    
//     if (results.length > 0) {
//       return {
//         success: true,
//         filename: results[0].filename,
//         fileid: results[0].fileid
//       };
//     } else {
//       return {
//         success: false,
//         error: "File not found"
//       };
//     }
//   } catch (error) {
//     console.error("Error getting original filename:", error);
//     return {
//       success: false,
//       error: error.message
//     };
//   }
// }

//   // 📤 上傳文件到指定的 RAG Engine
//   async uploadFileToEngine(corpusName, userId, fileBuffer, fileName) {
//     try {
//       console.log(
//         `📤 Uploading file ${fileName} to engine ${corpusName} for user ${userId}`
//       );

//       // 上傳文件到 Cloud Storage
//       const timestamp = Date.now();
//       const userBucketPath = `user-data/${userId}/${timestamp}-${fileName}`;

//       const bucket = this.storage.bucket(this.bucketName);

//       try {
//         const [bucketExists] = await bucket.exists();
//         if (!bucketExists) {
//           console.log(`Creating bucket: ${this.bucketName}`);
//           await this.storage.createBucket(this.bucketName, {
//             location: this.location,
//             storageClass: "STANDARD",
//           });
//         }
//       } catch (bucketError) {
//         console.error("Bucket check/create error:", bucketError.message);
//       }

//       const bucketFile = bucket.file(userBucketPath);
//       await bucketFile.save(fileBuffer, {
//         metadata: {
//           contentType: "text/plain",
//           metadata: {
//             userId: userId,
//             originalName: fileName,
//             uploadedAt: new Date().toISOString(),
//           },
//         },
//       });

//       console.log(
//         `✅ File uploaded to Cloud Storage: gs://${this.bucketName}/${userBucketPath}`
//       );

//       // 導入到 RAG Engine
//       console.log(`🔄 Importing file to RAG Engine: ${corpusName}`);
//       const importResult = await this.importFileToRAG(
//         corpusName,
//         userBucketPath
//       );

//       return {
//         success: true,
//         fileName: fileName,
//         bucketPath: `gs://${this.bucketName}/${userBucketPath}`,
//         importResult: importResult,
//       };
//     } catch (error) {
//       console.error(`❌ Upload file to engine error:`, error);
//       return {
//         success: false,
//         error: error.message,
//       };
//     }
//   }

//   // 🔄 導入文件到指定的 RAG Engine（改进版）
//   async importFileToRAG(corpusName, filePath) {
//     try {
//       // 確保 corpusName 不是操作名稱
//       if (corpusName.includes("/operations/")) {
//         throw new Error(
//           `Invalid corpus name: ${corpusName}. This appears to be an operation name, not a corpus name.`
//         );
//       }

//       const authClient = await this.auth.getClient();
//       const accessToken = await authClient.getAccessToken();

//       const importUrl = `https://${this.location}-aiplatform.googleapis.com/v1beta1/${corpusName}/ragFiles:import`;

//       const importData = {
//         importRagFilesConfig: {
//           gcsSource: {
//             uris: [`gs://${this.bucketName}/${filePath}`],
//           },
//           ragFileChunkingConfig: {
//             chunkSize: 1024,
//             chunkOverlap: 200,
//           },
//         },
//       };

//       console.log(`Importing file to RAG: ${corpusName}`);
//       console.log(`Import URL: ${importUrl}`);
//       console.log(`File URI: gs://${this.bucketName}/${filePath}`);
//       console.log("Import request data:", JSON.stringify(importData, null, 2));

//       const response = await axios.post(importUrl, importData, {
//         headers: {
//           Authorization: `Bearer ${accessToken.token}`,
//           "Content-Type": "application/json",
//         },
//       });

//       console.log("Import response:", JSON.stringify(response.data, null, 2));

//       return {
//         success: true,
//         operationName: response.data.name,
//         operationId: response.data.name?.split("/").pop() || "unknown",
//       };
//     } catch (error) {
//       console.error("Import to RAG error:", {
//         message: error.message,
//         response: error.response?.data,
//         status: error.response?.status,
//         corpusName: corpusName,
//       });

//       return {
//         success: false,
//         error: error.response?.data || error.message,
//       };
//     }
//   }

//   // 💬 用戶專屬 RAG 查詢（修正版 - 使用資料庫權限檢查）
//   async queryUserRAG(userId, question, ragId = null) {
//     try {
//       let targetRag = null;

//       if (ragId) {
//         // 檢查用戶是否有權限訪問指定的 RAG Engine
//         const hasAccess = await this.canUserAccessRAG(userId, ragId);
//         if (!hasAccess) {
//           return {
//             success: false,
//             error: "您沒有權限查詢此 RAG Engine",
//           };
//         }

//         const dbInfo = await this.getRAGEngineFromDB(ragId);
//         if (dbInfo) {
//           targetRag = {
//             fullName: `projects/${this.projectId}/locations/${this.location}/ragCorpora/${ragId}`,
//             displayName: dbInfo.ragname || userId,
//             ragId: ragId,
//           };
//         }
//       } else {
//         // 如果沒有指定 ragId，使用用戶的默認 RAG Engine
//         const accessibleRags = await this.getUserAccessibleRAGEngines(userId);
//         if (accessibleRags.success && accessibleRags.ownRags.length > 0) {
//           const defaultRag = accessibleRags.ownRags[0];
//           targetRag = {
//             fullName: `projects/${this.projectId}/locations/${this.location}/ragCorpora/${defaultRag.ragid}`,
//             displayName: defaultRag.ragname || userId,
//             ragId: defaultRag.ragid,
//           };
//         }
//       }

//       if (!targetRag) {
//         return {
//           success: false,
//           error: "找不到可查詢的 RAG Engine，請先上傳一些文檔",
//         };
//       }

//       const generativeModel = this.vertexAI.getGenerativeModel({
//         model: "gemini-2.5-flash-preview-05-20",
//       });

//       const request = {
//         contents: [
//           {
//             role: "user",
//             parts: [
//               {
//                 text: `基於我的個人知識庫，請回答以下問題：

// ${question}

// 請確保回答基於我上傳的文檔內容，如果找不到相關信息，請誠實說明。`,
//               },
//             ],
//           },
//         ],
//         tools: [
//           {
//             retrieval: {
//               vertexRagStore: {
//                 ragCorpora: [targetRag.fullName],
//                 similarityTopK: 10,
//                 vectorDistanceThreshold: 0.5,
//               },
//             },
//           },
//         ],
//         generationConfig: {
//           temperature: 0.7,
//           maxOutputTokens: 8192,
//           topP: 0.95,
//         },
//       };

//       const result = await generativeModel.generateContent(request);
//       const answer = this.extractResponseText(result.response);

//       return {
//         success: true,
//         answer: answer,
//         question: question,
//         userId: userId,
//         ragEngine: targetRag.displayName,
//         ragId: targetRag.ragId,
//       };
//     } catch (error) {
//       return {
//         success: false,
//         error: error.message,
//       };
//     }
//   }

//   // 🗑️ 刪除整個 RAG Engine（修正版 - 同步刪除資料庫記錄）
//   async deleteUserRAGEngine(corpusName, userId) {
//     try {
//       const corpusId = corpusName.split("/").pop();

//       // 檢查用戶權限
//       const hasAccess = await this.canUserAccessRAG(userId, corpusId);
//       if (!hasAccess) {
//         return {
//           success: false,
//           error: "您沒有權限刪除此 RAG Engine",
//         };
//       }

//       const authClient = await this.auth.getClient();
//       const accessToken = await authClient.getAccessToken();

//       const deleteUrl = `https://${this.location}-aiplatform.googleapis.com/v1beta1/${corpusName}`;

//       console.log(`Deleting RAG Engine: ${deleteUrl}`);

//       await axios.delete(deleteUrl, {
//         headers: {
//           Authorization: `Bearer ${accessToken.token}`,
//           "Content-Type": "application/json",
//         },
//       });

//       // 從資料庫中刪除記錄
//       try {
//         const deleteQuery = "DELETE FROM rag WHERE ragid = ?";
//         await this.db.execute(deleteQuery, [corpusId]);
//         console.log(`✅ RAG Engine removed from database: ${corpusId}`);
//       } catch (dbError) {
//         console.error("❌ Failed to remove from database:", dbError.message);
//         // 即使資料庫刪除失敗，Google 端已經刪除了，所以仍然返回成功
//       }

//       return {
//         success: true,
//         message: "RAG Engine deleted successfully",
//         corpusId: corpusId,
//       };
//     } catch (error) {
//       console.error(
//         `Error deleting RAG Engine ${corpusName}:`,
//         error.response?.data || error.message
//       );
//       return {
//         success: false,
//         error: error.response?.data || error.message,
//       };
//     }
//   }

//   // 🤝 添加好友
//   async addFriend(userId, friendUsername) {
//     try {
//       // 查找好友的 userid
//       const findFriendQuery = "SELECT userid FROM users WHERE username = ?";
//       const [friendResults] = await this.db.execute(findFriendQuery, [
//         friendUsername,
//       ]);

//       if (friendResults.length === 0) {
//         return {
//           success: false,
//           error: "用戶不存在",
//         };
//       }

//       const friendId = friendResults[0].userid;

//       // 檢查是否已經是好友或已發送好友邀請
//       const checkQuery = `
//         SELECT * FROM friendship 
//         WHERE (userid = ? AND friendid = ?) OR (userid = ? AND friendid = ?)
//       `;
//       const [existing] = await this.db.execute(checkQuery, [
//         userId,
//         friendId,
//         friendId,
//         userId,
//       ]);

//       if (existing.length > 0) {
//         return {
//           success: false,
//           error: "已經是好友或已發送邀請",
//         };
//       }

//       // 添加好友關係
//       const addQuery = `
//         INSERT INTO friendship (userid, friendid, created_at) 
//         VALUES (?, ?, NOW())
//       `;
//       await this.db.execute(addQuery, [userId, friendId]);

//       return {
//         success: true,
//         message: "好友邀請已發送",
//         friendId: friendId,
//       };
//     } catch (error) {
//       console.error("Error adding friend:", error);
//       return {
//         success: false,
//         error: error.message,
//       };
//     }
//   }

//   // 🤝 接受好友邀請
//   async acceptFriendRequest(userId, friendId) {
//     try {
//       const updateQuery = `
//         UPDATE friendship 
//         SET accepted_at = NOW() 
//         WHERE userid = ? AND friendid = ? AND accepted_at IS NULL
//       `;
//       const [result] = await this.db.execute(updateQuery, [friendId, userId]);

//       if (result.affectedRows === 0) {
//         return {
//           success: false,
//           error: "找不到待處理的好友邀請",
//         };
//       }

//       return {
//         success: true,
//         message: "好友邀請已接受",
//       };
//     } catch (error) {
//       console.error("Error accepting friend request:", error);
//       return {
//         success: false,
//         error: error.message,
//       };
//     }
//   }

//   // 🔗 分享 RAG Engine 給特定用戶
//   async shareRAGEngineToUser(ownerId, ragId, targetUserId) {
//     try {
//       // 檢查是否有權限分享此 RAG Engine
//       const hasAccess = await this.canUserAccessRAG(ownerId, ragId);
//       if (!hasAccess) {
//         return {
//           success: false,
//           error: "您沒有權限分享此 RAG Engine",
//         };
//       }

//       // 檢查是否已經分享過
//       const checkQuery =
//         "SELECT * FROM private_rag WHERE ragid = ? AND userid = ?";
//       const [existing] = await this.db.execute(checkQuery, [
//         ragId,
//         targetUserId,
//       ]);

//       if (existing.length > 0) {
//         return {
//           success: false,
//           error: "已經分享給此用戶",
//         };
//       }

//       // 添加私人分享記錄
//       const shareQuery = `
//         INSERT INTO private_rag (ragid, userid, granted_at) 
//         VALUES (?, ?, NOW())
//       `;
//       await this.db.execute(shareQuery, [ragId, targetUserId]);

//       return {
//         success: true,
//         message: "RAG Engine 已成功分享",
//         ragId: ragId,
//         targetUserId: targetUserId,
//       };
//     } catch (error) {
//       console.error("Error sharing RAG engine:", error);
//       return {
//         success: false,
//         error: error.message,
//       };
//     }
//   }

//   // 🔍 獲取用戶可訪問的 RAG Engines（包含分享的）
//   async getUserAccessibleRAGEngines(userId) {
//     try {
//       // 查詢用戶自己的 RAG Engines
//       const ownRagsQuery = `
//         SELECT r.*, u.username as owner_username
//         FROM rag r 
//         JOIN users u ON r.userid = u.userid 
//         WHERE r.userid = ?
//       `;
//       const [ownRags] = await this.db.execute(ownRagsQuery, [userId]);

//       // 查詢通過好友關係分享的 RAG Engines
//       const friendSharedQuery = `
//         SELECT r.*, u.username as owner_username
//         FROM rag r 
//         JOIN users u ON r.userid = u.userid
//         JOIN friendship f ON (f.userid = r.userid AND f.friendid = ? AND f.accepted_at IS NOT NULL)
//         WHERE r.visibility = 'friends'
//       `;
//       const [friendSharedRags] = await this.db.execute(friendSharedQuery, [
//         userId,
//       ]);

//       // 查詢私人分享的 RAG Engines
//       const privateSharedQuery = `
//         SELECT r.*, u.username as owner_username
//         FROM rag r 
//         JOIN users u ON r.userid = u.userid
//         JOIN private_rag pr ON (pr.ragid = r.ragid AND pr.userid = ?)
//       `;
//       const [privateSharedRags] = await this.db.execute(privateSharedQuery, [
//         userId,
//       ]);

//       return {
//         success: true,
//         ownRags: ownRags,
//         friendSharedRags: friendSharedRags,
//         privateSharedRags: privateSharedRags,
//         totalAccessible:
//           ownRags.length + friendSharedRags.length + privateSharedRags.length,
//       };
//     } catch (error) {
//       console.error("Error getting user accessible RAG engines:", error);
//       return {
//         success: false,
//         error: error.message,
//       };
//     }
//   }

//   // 🔍 檢查用戶是否可以訪問特定的 RAG Engine
//   async canUserAccessRAG(userId, ragId) {
//     try {
//       const accessibleRags = await this.getUserAccessibleRAGEngines(userId);
//       if (!accessibleRags.success) return false;

//       const allAccessibleRags = [
//         ...accessibleRags.ownRags,
//         ...accessibleRags.friendSharedRags,
//         ...accessibleRags.privateSharedRags,
//       ];

//       return allAccessibleRags.some((rag) => rag.ragid === ragId);
//     } catch (error) {
//       console.error("Error checking user access:", error);
//       return false;
//     }
//   }

//   // 🔍 從資料庫獲取 RAG Engine 信息
//   async getRAGEngineFromDB(ragId) {
//     try {
//       const query = `
//         SELECT r.*, u.username as owner_username
//         FROM rag r 
//         JOIN users u ON r.userid = u.userid 
//         WHERE r.ragid = ?
//       `;
//       const [results] = await this.db.execute(query, [ragId]);
//       return results.length > 0 ? results[0] : null;
//     } catch (error) {
//       console.error("Error getting RAG engine from database:", error);
//       return null;
//     }
//   }

//   // 📝 提取回應文本
//   extractResponseText(response) {
//     try {
//       if (response && response.candidates && response.candidates.length > 0) {
//         const candidate = response.candidates[0];
//         if (
//           candidate.content &&
//           candidate.content.parts &&
//           candidate.content.parts.length > 0
//         ) {
//           return candidate.content.parts[0].text || "No response generated";
//         }
//       }

//       if (typeof response.text === "function") {
//         return response.text();
//       }

//       if (response.text) {
//         return response.text;
//       }

//       return "No response generated";
//     } catch (error) {
//       console.error("Error extracting response text:", error);
//       return "Error extracting response";
//     }
//   }

//   // 💬 查詢特定 RAG Engine
//   async querySpecificRAG(corpusName, question, userId, fileName) {
//     try {
//       const generativeModel = this.vertexAI.getGenerativeModel({
//         model: "gemini-2.5-flash-preview-05-20",
//       });

//       const request = {
//         contents: [
//           {
//             role: "user",
//             parts: [
//               {
//                 text: `基於我上傳的文檔 "${fileName}"，請回答以下問題：

// ${question}

// 請確保回答基於文檔內容，如果找不到相關信息，請誠實說明。`,
//               },
//             ],
//           },
//         ],
//         tools: [
//           {
//             retrieval: {
//               vertexRagStore: {
//                 ragCorpora: [corpusName],
//                 similarityTopK: 10,
//                 vectorDistanceThreshold: 0.5,
//               },
//             },
//           },
//         ],
//         generationConfig: {
//           temperature: 0.7,
//           maxOutputTokens: 8192,
//           topP: 0.95,
//         },
//       };

//       const result = await generativeModel.generateContent(request);
//       const answer = this.extractResponseText(result.response);

//       return {
//         success: true,
//         answer: answer,
//         question: question,
//         userId: userId,
//         fileName: fileName,
//         ragEngine: fileName,
//       };
//     } catch (error) {
//       return {
//         success: false,
//         error: error.message,
//       };
//     }
//   }
// }

// // 認證中間件
// const authenticateToken = (req, res, next) => {
//   const authHeader = req.headers["authorization"];
//   const token = authHeader && authHeader.split(" ")[1];

//   if (!token) {
//     return res.status(401).json({
//       success: false,
//       message: "Access token required",
//     });
//   }

//   jwt.verify(
//     token,
//     process.env.JWT_SECRET || "fheisbwfiwghbtjdkwajedfegrjefujhub41354trhj",
//     (err, user) => {
//       if (err) {
//         return res.status(403).json({
//           success: false,
//           message: "Invalid or expired token",
//         });
//       }
//       req.user = user;
//       next();
//     }
//   );
// };

// const ragSystem = new MultiUserRAGSystem();

// // 📋 獲取所有 RAG Engines 概覽
// router.get("/engines/overview", async (req, res) => {
//   try {
//     const result = await ragSystem.listAllRAGEngines();
//     if (result.success) {
//       res.json({
//         success: true,
//         totalEngines: result.totalEngines,
//         userEngines: result.userEngines,
//         systemEngines: result.systemEngines,
//         pagesProcessed: result.pagesProcessed,
//         stats: {
//           totalCount: result.totalEngines,
//           userCount: result.userEngines.length,
//           systemCount: result.systemEngines.length,
//           activeEngines: result.allEngines.filter((e) => e.status === "active")
//             .length,
//         },
//       });
//     } else {
//       res.status(500).json({
//         success: false,
//         error: result.error,
//       });
//     }
//   } catch (error) {
//     console.error("Get engines overview error:", error);
//     res.status(500).json({
//       success: false,
//       error: error.message,
//     });
//   }
// });

// // 👤 用戶專屬文檔上傳 - 修正路由（支持指定 ragId）
// router.post(
//   "/users/:userId/upload",
//   authenticateToken,
//   upload.single("file"),
//   async (req, res) => {
//     try {
//       const userId = req.params.userId || req.user.userId;
//       const file = req.file;
//       const { ragId } = req.body; // 可選的 ragId 參數

//       if (!file) {
//         return res.status(400).json({
//           success: false,
//           message: "No file uploaded",
//         });
//       }

//       console.log(
//         `📤 User ${userId} uploading file: ${file.originalname} (${file.size} bytes)`
//       );
//       if (ragId) console.log(`Target RAG ID: ${ragId}`);

//       const result = await ragSystem.uploadToUserRAG(
//         userId,
//         file.buffer,
//         file.originalname,
//         ragId
//       );

//       if (result.success) {
//         res.json({
//           success: true,
//           message: `文檔 "${result.displayName}" 已成功上傳到您的個人知識庫`,
//           data: {
//             userId: result.userId,
//             fileName: result.displayName, // 原始文件名
//             newFileName: result.newFileName, // 🆕 新生成的文件名
//             generatedFileId: result.generatedFileId, // 🆕 生成的文件ID
//             bucketPath: result.bucketPath,
//             ragEngine: result.ragEngine,
//             operationId: result.importResult?.operationId,
//             note: "Document is being processed. It will be available for queries in a few minutes.",
//           },
//         });
//       } else {
//         console.error("Upload failed:", result);
//         res.status(500).json({
//           success: false,
//           message: "Upload failed",
//           error: result.error,
//           details: result.stack,
//         });
//       }
//     } catch (error) {
//       console.error("User upload error:", error);
//       res.status(500).json({
//         success: false,
//         error: error.message,
//         stack: error.stack,
//       });
//     }
//   }
// );

// router.get("/users/engines/:engineId/file-mapping", authenticateToken, async (req, res) => {
//   try {
//     const userId = req.user.userId;
//     const { engineId } = req.params;

//     // 檢查用戶權限
//     const hasAccess = await ragSystem.canUserAccessRAG(userId, engineId);
//     if (!hasAccess) {
//       return res.status(403).json({
//         success: false,
//         error: "您沒有權限訪問此 RAG Engine",
//       });
//     }

//     const result = await ragSystem.getFileNameMapping(engineId);

//     if (result.success) {
//       res.json({
//         success: true,
//         mapping: result.mapping,
//         engineId: engineId,
//       });
//     } else {
//       res.status(500).json({
//         success: false,
//         error: result.error,
//       });
//     }
//   } catch (error) {
//     console.error("Get file mapping error:", error);
//     res.status(500).json({
//       success: false,
//       error: error.message,
//     });
//   }
// });

// // 📊 獲取用戶的 RAG Engines - 修正版（使用資料庫）
// router.get("/users/:userId/engines", authenticateToken, async (req, res) => {
//   try {
//     const userId = req.params.userId || req.user.userId;

//     console.log(`Getting RAG engines for user: ${userId}`);

//     const accessibleRags = await ragSystem.getUserAccessibleRAGEngines(userId);

//     if (!accessibleRags.success) {
//       throw new Error(accessibleRags.error);
//     }

//     // 格式化 Engine 列表
//     const formattedEngines = accessibleRags.ownRags.map((rag) => ({
//       id: rag.ragid,
//       name: rag.ragname,
//       displayName: rag.ragname,
//       visibility: rag.visibility,
//       fileCount: 0, // 需要額外查詢
//       status: "active",
//       createdAt: rag.created_at,
//       updatedAt: rag.updated_at,
//       isOwner: true,
//     }));

//     const sharedEngines = [
//       ...accessibleRags.friendSharedRags.map((rag) => ({
//         id: rag.ragid,
//         name: rag.ragname,
//         displayName: rag.ragname,
//         visibility: rag.visibility,
//         fileCount: 0,
//         status: "active",
//         createdAt: rag.created_at,
//         updatedAt: rag.updated_at,
//         isOwner: false,
//         ownerUsername: rag.owner_username,
//         shareType: "friend",
//       })),
//       ...accessibleRags.privateSharedRags.map((rag) => ({
//         id: rag.ragid,
//         name: rag.ragname,
//         displayName: rag.ragname,
//         visibility: rag.visibility,
//         fileCount: 0,
//         status: "active",
//         createdAt: rag.created_at,
//         updatedAt: rag.updated_at,
//         isOwner: false,
//         ownerUsername: rag.owner_username,
//         shareType: "private",
//       })),
//     ];

//     res.json({
//       success: true,
//       hasRAGEngine: formattedEngines.length > 0,
//       userId: userId,
//       engines: formattedEngines,
//       sharedEngines: sharedEngines,
//       totalEngines: formattedEngines.length,
//       totalSharedEngines: sharedEngines.length,
//       totalAccessible: accessibleRags.totalAccessible,
//     });
//   } catch (error) {
//     const userId = req.params.userId || req.user.userId;
//     console.error(`Error getting engines for user ${userId}:`, error);
//     res.status(500).json({
//       success: false,
//       error: error.message,
//       engines: [],
//       userId: userId,
//     });
//   }
// });

// // 🏗️ 創建新的 RAG Engine（修正版）
// router.post("/users/engines", authenticateToken, async (req, res) => {
//   try {
//     const userId = req.user.userId;
//     const { engineName, name, description, visibility = "private" } = req.body;

//     const finalEngineName = engineName || name;

//     if (!finalEngineName) {
//       return res.status(400).json({
//         success: false,
//         message: "Engine name is required",
//       });
//     }

//     console.log(`🏗️ User ${userId} creating new engine: ${finalEngineName}`);

//     // 檢查用戶是否已經有同名的 Engine
//     const checkQuery = "SELECT * FROM rag WHERE userid = ? AND ragname = ?";
//     const [existing] = await ragSystem.db.execute(checkQuery, [
//       userId,
//       finalEngineName,
//     ]);

//     if (existing.length > 0) {
//       return res.status(400).json({
//         success: false,
//         message: `您已經有一個名為 "${finalEngineName}" 的 Engine`,
//       });
//     }

//     const result = await ragSystem.createUserRAGEngine(
//       userId,
//       finalEngineName,
//       description,
//       visibility
//     );

//     if (result.success) {
//       res.json({
//         success: true,
//         message: `Engine "${finalEngineName}" 創建成功`,
//         engine: {
//           id: result.corpusId,
//           name: finalEngineName,
//           displayName: finalEngineName,
//           ragName: result.ragName,
//           visibility: result.visibility,
//           description: description,
//           createdAt: result.createdAt,
//         },
//       });
//     } else {
//       const statusCode = result.isQuotaError ? 429 : 500;
//       const userMessage = result.userMessage || "Engine 創建失敗";

//       res.status(statusCode).json({
//         success: false,
//         message: userMessage,
//         error: result.error,
//         isQuotaError: result.isQuotaError,
//         quotaInfo: result.details?.quotaInfo,
//         retryAfter: result.isQuotaError ? 60 : null,
//       });
//     }
//   } catch (error) {
//     console.error(`Create engine error for user ${req.user.userId}:`, error);
//     res.status(500).json({
//       success: false,
//       error: error.message,
//     });
//   }
// });

// // 💬 Engine 內全域查詢 - 修正版（使用資料庫）
// router.post(
//   "/users/:userId/engines/:engineId/query",
//   authenticateToken,
//   async (req, res) => {
//     try {
//       const userId = req.params.userId || req.user.userId;
//       const { engineId } = req.params;
//       const { question } = req.body;

//       if (!question) {
//         return res.status(400).json({
//           success: false,
//           message: "Question is required",
//         });
//       }

//       console.log(
//         `💬 User ${userId} querying engine ${engineId}: ${question.substring(
//           0,
//           50
//         )}...`
//       );

//       const result = await ragSystem.queryUserRAG(userId, question, engineId);

//       if (result.success) {
//         res.json({
//           success: true,
//           answer: result.answer,
//           question: question,
//           userId: userId,
//           engineId: engineId,
//           ragEngine: result.ragEngine,
//           sources: `來源：${result.ragEngine}`,
//         });
//       } else {
//         res.status(500).json({
//           success: false,
//           error: result.error,
//         });
//       }
//     } catch (error) {
//       console.error(
//         `Engine query error for user ${userId}, engine ${engineId}:`,
//         error
//       );
//       res.status(500).json({
//         success: false,
//         error: error.message,
//       });
//     }
//   }
// );

// // 🗑️ 刪除整個 RAG Engine - 修正版
// router.delete(
//   "/users/:userId/engines/:engineId",
//   authenticateToken,
//   async (req, res) => {
//     try {
//       const userId = req.params.userId || req.user.userId;
//       const { engineId } = req.params;

//       console.log(`🗑️ User ${userId} deleting engine: ${engineId}`);

//       const corpusName = `projects/${ragSystem.projectId}/locations/${ragSystem.location}/ragCorpora/${engineId}`;
//       const result = await ragSystem.deleteUserRAGEngine(corpusName, userId);

//       if (result.success) {
//         res.json({
//           success: true,
//           message: `Engine 已成功刪除`,
//           engineId: engineId,
//           userId: userId,
//         });
//       } else {
//         res.status(500).json({
//           success: false,
//           message: "Failed to delete engine",
//           error: result.error,
//         });
//       }
//     } catch (error) {
//       console.error(
//         `Delete engine error for user ${userId}, engine ${engineId}:`,
//         error
//       );
//       res.status(500).json({
//         success: false,
//         error: error.message,
//       });
//     }
//   }
// );

// // 🤝 好友管理路由
// router.post("/users/friends/add", authenticateToken, async (req, res) => {
//   try {
//     const userId = req.user.userId;
//     const { friendUsername } = req.body;

//     if (!friendUsername) {
//       return res.status(400).json({
//         success: false,
//         message: "Friend username is required",
//       });
//     }

//     const result = await ragSystem.addFriend(userId, friendUsername);

//     if (result.success) {
//       res.json(result);
//     } else {
//       res.status(400).json(result);
//     }
//   } catch (error) {
//     console.error("Add friend error:", error);
//     res.status(500).json({
//       success: false,
//       error: error.message,
//     });
//   }
// });

// router.post("/users/friends/accept", authenticateToken, async (req, res) => {
//   try {
//     const userId = req.user.userId;
//     const { friendId } = req.body;

//     if (!friendId) {
//       return res.status(400).json({
//         success: false,
//         message: "Friend ID is required",
//       });
//     }

//     const result = await ragSystem.acceptFriendRequest(userId, friendId);

//     if (result.success) {
//       res.json(result);
//     } else {
//       res.status(400).json(result);
//     }
//   } catch (error) {
//     console.error("Accept friend error:", error);
//     res.status(500).json({
//       success: false,
//       error: error.message,
//     });
//   }
// });

// // 🔗 RAG Engine 分享路由
// router.post(
//   "/users/engines/:engineId/share",
//   authenticateToken,
//   async (req, res) => {
//     try {
//       const userId = req.user.userId;
//       const { engineId } = req.params;
//       const { targetUserId, targetUsername } = req.body;

//       let finalTargetUserId = targetUserId;

//       // 如果提供的是用戶名，查找對應的 userId
//       if (targetUsername && !finalTargetUserId) {
//         const findUserQuery = "SELECT userid FROM users WHERE username = ?";
//         const [userResults] = await ragSystem.db.execute(findUserQuery, [
//           targetUsername,
//         ]);

//         if (userResults.length === 0) {
//           return res.status(404).json({
//             success: false,
//             message: "目標用戶不存在",
//           });
//         }

//         finalTargetUserId = userResults[0].userid;
//       }

//       if (!finalTargetUserId) {
//         return res.status(400).json({
//           success: false,
//           message: "Target user ID or username is required",
//         });
//       }

//       const result = await ragSystem.shareRAGEngineToUser(
//         userId,
//         engineId,
//         finalTargetUserId
//       );

//       if (result.success) {
//         res.json(result);
//       } else {
//         res.status(400).json(result);
//       }
//     } catch (error) {
//       console.error("Share engine error:", error);
//       res.status(500).json({
//         success: false,
//         error: error.message,
//       });
//     }
//   }
// );

// // 🔍 操作狀態檢查
// router.get("/operation-status/:operationId", async (req, res) => {
//   try {
//     const { operationId } = req.params;
//     const authClient = await auth.getClient();
//     const accessToken = await authClient.getAccessToken();

//     const statusUrl = `https://${LOCATION}-aiplatform.googleapis.com/v1beta1/projects/${PROJECT_ID}/locations/${LOCATION}/operations/${operationId}`;

//     const response = await axios.get(statusUrl, {
//       headers: {
//         Authorization: `Bearer ${accessToken.token}`,
//         "Content-Type": "application/json",
//       },
//     });

//     const operation = response.data;
//     let status = operation.done ? "completed" : "running";

//     if (operation.done && operation.error) {
//       status = "failed";
//     }

//     res.json({
//       success: true,
//       operationId: operationId,
//       status: status,
//       done: operation.done || false,
//       error: operation.error || null,
//       result: operation.response || null,
//       metadata: operation.metadata || null,
//       recommendations: operation.done
//         ? operation.error
//           ? ["❌ 操作失敗，請檢查錯誤信息", "🔄 嘗試重新上傳文件"]
//           : ["✅ 處理完成！", "🧪 可以開始測試查詢功能"]
//         : ["⏳ 操作進行中，請稍候", "🕐 通常需要1-3分鐘完成"],
//     });
//   } catch (error) {
//     res.status(500).json({
//       success: false,
//       error: error.response?.data || error.message,
//     });
//   }
// });

// // 🔍 用戶 RAG 狀態查詢
// router.get("/users/status", authenticateToken, async (req, res) => {
//   try {
//     const userId = req.user.userId;

//     console.log(`Getting RAG status for user: ${userId}`);

//     const accessibleRags = await ragSystem.getUserAccessibleRAGEngines(userId);

//     if (!accessibleRags.success) {
//       throw new Error(accessibleRags.error);
//     }

//     let hasRAGEngine = false;
//     let engineInfo = null;

//     if (accessibleRags.ownRags.length > 0) {
//       hasRAGEngine = true;
//       const firstEngine = accessibleRags.ownRags[0];
//       engineInfo = {
//         id: firstEngine.ragid,
//         name: firstEngine.ragname,
//         status: "active",
//         fileCount: 0,
//         createdAt: firstEngine.created_at,
//       };
//     }

//     res.json({
//       success: true,
//       hasRAGEngine: hasRAGEngine,
//       userId: userId,
//       engine: engineInfo,
//       message: hasRAGEngine
//         ? `您有 ${accessibleRags.ownRags.length} 個 RAG Engine`
//         : "您還沒有 RAG Engine，上傳文件時會自動建立",
//     });
//   } catch (error) {
//     console.error(`Error getting RAG status for user:`, error);
//     res.status(500).json({
//       success: false,
//       error: error.message,
//     });
//   }
// });

// // 🗑️ 刪除用戶的特定文檔
// router.delete(
//   "/users/documents/:documentId",
//   authenticateToken,
//   async (req, res) => {
//     try {
//       const userId = req.user.userId;
//       const { documentId } = req.params;

//       console.log(`🗑️ User ${userId} deleting document: ${documentId}`);

//       const result = await ragSystem.deleteUserDocument(userId, documentId);

//       if (result.success) {
//         res.json({
//           success: true,
//           message: `文檔已成功刪除`,
//           documentId: documentId,
//           deletedDocument: {
//             id: result.documentId,
//             ragId: result.ragId,
//           },
//         });
//       } else {
//         res.status(500).json({
//           success: false,
//           message: "刪除文檔失敗",
//           error: result.error,
//         });
//       }
//     } catch (error) {
//       console.error(
//         `Delete document error for user ${req.user.userId}:`,
//         error
//       );
//       res.status(500).json({
//         success: false,
//         error: error.message,
//       });
//     }
//   }
// );

// // 📋 用戶所有文檔列表（支援多 Engine，前端與測試專用）
// router.get("/users/documents", authenticateToken, async (req, res) => {
//   try {
//     const userId = req.user.userId;
//     // 取得用戶可訪問的所有 RAG Engine
//     const accessibleRags = await ragSystem.getUserAccessibleRAGEngines(userId);
//     if (!accessibleRags.success) {
//       return res.status(500).json({
//         success: false,
//         error: accessibleRags.error || "無法獲取用戶 Engine",
//       });
//     }
//     // 合併所有可訪問的 Engine
//     const allRags = [
//       ...accessibleRags.ownRags,
//       ...accessibleRags.friendSharedRags,
//       ...accessibleRags.privateSharedRags,
//     ];

//     let allFiles = [];
//     for (const rag of allRags) {
//       const corpusName = `projects/${ragSystem.projectId}/locations/${ragSystem.location}/ragCorpora/${rag.ragid}`;
//       const filesResult = await ragSystem.getUserDocuments(corpusName);
//       if (filesResult.success && filesResult.files.length > 0) {
//         // 標記來源 Engine
//         filesResult.files.forEach((f) => {
//           f.engineId = rag.ragid;
//           f.engineName = rag.ragname;
//         });
//         allFiles = allFiles.concat(filesResult.files);
//       }
//     }

//     res.json({
//       success: true,
//       documents: allFiles,
//       total: allFiles.length,
//     });
//   } catch (error) {
//     res.status(500).json({
//       success: false,
//       error: error.message,
//     });
//   }
// });

// // 🧪 測試端點
// router.get("/test", (req, res) => {
//   res.json({
//     success: true,
//     message:
//       "Multi-User Multi-Engine RAG System with Database Integration is running",
//     version: "4.0.0",
//     features: [
//       "✅ 資料庫整合 (MySQL)",
//       "✅ 統一 RAG Engine 命名 (只使用 userId)",
//       "✅ Google RAG Corpus ID 保存為 ragid",
//       "✅ 用戶權限檢查",
//       "✅ 好友系統和 RAG 分享",
//       "✅ 私人 RAG Engine 分享",
//       "✅ 多文檔上傳到同一 Engine",
//       "✅ 分頁查詢所有 Engine",
//       "✅ 完整的錯誤處理",
//       "✅ 用戶隔離保護",
//     ],
//     endpoints: {
//       createEngine: "POST /api/rag/users/engines",
//       listEngines: "GET /api/rag/users/engines",
//       userStatus: "GET /api/rag/users/status",
//       userUpload: "POST /api/rag/users/upload",
//       userQuery: "POST /api/rag/users/query",
//       userDocuments: "GET /api/rag/users/documents",
//       deleteDocument: "DELETE /api/rag/users/documents/:documentId",
//       enginesOverview: "GET /api/rag/engines/overview",
//       operationStatus: "GET /api/rag/operation-status/:operationId",
//       addFriend: "POST /api/rag/users/friends/add",
//       acceptFriend: "POST /api/rag/users/friends/accept",
//       shareEngine: "POST /api/rag/users/engines/:engineId/share",
//     },
//     database: {
//       tables: ["users", "rag", "friendship", "private_rag"],
//       features: ["用戶管理", "RAG Engine 管理", "好友關係", "私人分享"],
//     },
//   });
// });

// module.exports = router;
