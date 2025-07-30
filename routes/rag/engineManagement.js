const axios = require("axios");
const { auth, PROJECT_ID, LOCATION, dbPool } = require("./config");

class EngineManagement {
  constructor() {
    this.auth = auth;
    this.projectId = PROJECT_ID;
    this.location = LOCATION;
    this.db = dbPool;
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

  // 🏗️ 為用戶創建專屬的 RAG Engine（修正版 - 統一命名並保存到資料庫）
  async createUserRAGEngine(
    userId,
    engineName = null,
    description = null,
    visibility = "private"
  ) {
    try {
      console.log(`🏗️ === COMPLETE RAG ENGINE CREATION WITH ASYNC SUPPORT ===`);
      console.log(`👤 User ID: ${userId}`);
      console.log(`📛 Engine Name: ${engineName}`);

      // Step 1: 認證
      const authClient = await this.auth.getClient();
      const accessToken = await authClient.getAccessToken();
      console.log(`✅ Authentication successful`);

      // Step 2: 準備數據
      const corpusId = `rag_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`;
      const finalDisplayName = `${userId}_${engineName || "default"}`;
      const finalRagName = engineName || `${userId}_default_rag`;
      
      // 初始化 corpusName 變數
      let corpusName = null;

      console.log(`🆔 Generated Corpus ID: ${corpusId}`);
      console.log(`📛 Display Name: ${finalDisplayName}`);

      const corpusData = {
        displayName: finalDisplayName,
        description:
          description ||
          `RAG corpus for user ${userId} - ${engineName} - Created ${new Date().toISOString()}`,
      };

      // Step 3: 發送創建請求
      const createUrl = `https://${this.location}-aiplatform.googleapis.com/v1beta1/projects/${this.projectId}/locations/${this.location}/ragCorpora`;

      console.log(`📤 Creating RAG Corpus...`);
      console.log(`🔗 URL: ${createUrl}`);
      console.log(`📦 Data:`, JSON.stringify(corpusData, null, 2));

      const response = await axios.post(createUrl, corpusData, {
        headers: {
          Authorization: `Bearer ${accessToken.token}`,
          "Content-Type": "application/json",
        },
        timeout: 60000, // 60秒超時
      });

      console.log(`📨 Creation Response Status: ${response.status}`);
      console.log(`📨 Response Data:`, JSON.stringify(response.data, null, 2));

      let finalCorpusId;

      // Step 4: 檢查是否為異步操作
      if (response.data.name && response.data.name.includes("/operations/")) {
        console.log(`⏳ Detected ASYNC operation: ${response.data.name}`);
        console.log(`⏳ Waiting for operation to complete...`);

        // 等待異步操作完成
        const operationResult = await this.waitForOperation(
          response.data.name,
          300000
        ); // 5分鐘超時

        if (!operationResult.success) {
          throw new Error(
            `Async operation failed: ${JSON.stringify(operationResult.error)}`
          );
        }

        console.log(`✅ Async operation completed successfully`);
        console.log(
          `✅ Operation result:`,
          JSON.stringify(operationResult.result, null, 2)
        );

        corpusName = operationResult.result?.name;
        if (!corpusName) {
          throw new Error("No corpus name found in async operation result");
        }

        finalCorpusId = corpusName.split("/").pop();
        console.log(`✅ Final Corpus Name from async: ${corpusName}`);
        console.log(`✅ Final Corpus ID from async: ${finalCorpusId}`);
      } else {
        // 同步操作
        console.log(`✅ Detected SYNC operation`);
        corpusName = response.data.name;
        finalCorpusId = corpusName.split("/").pop();
        console.log(`✅ Final Corpus Name from sync: ${corpusName}`);
        console.log(`✅ Final Corpus ID from sync: ${finalCorpusId}`);
      }

      // Step 5: 立即驗證創建結果
      console.log(`🔍 === IMMEDIATE VERIFICATION ===`);
      try {
        const verifyUrl = `https://${this.location}-aiplatform.googleapis.com/v1beta1/${corpusName}`;
        console.log(`🔍 Verification URL: ${verifyUrl}`);

        const verifyResponse = await axios.get(verifyUrl, {
          headers: {
            Authorization: `Bearer ${accessToken.token}`,
            "Content-Type": "application/json",
          },
          timeout: 30000,
        });

        console.log(`✅ RAG Corpus verification successful!`);
        console.log(`✅ Corpus State: ${verifyResponse.data.state}`);
        console.log(
          `✅ Corpus Display Name: ${verifyResponse.data.displayName}`
        );

        // 檢查狀態
        if (
          verifyResponse.data.state &&
          verifyResponse.data.state !== "ACTIVE"
        ) {
          console.log(
            `⚠️ Corpus state is: ${verifyResponse.data.state} (not ACTIVE yet)`
          );
          console.log(`⚠️ This is normal for newly created corpus`);
        }
      } catch (verifyError) {
        console.error(`❌ Immediate verification failed:`, {
          status: verifyError.response?.status,
          data: verifyError.response?.data,
          message: verifyError.message,
        });

        // 如果驗證失敗，等待一段時間後重試
        console.log(`⏳ Waiting 30 seconds before retry verification...`);
        await new Promise((resolve) => setTimeout(resolve, 30000));

        try {
          const retryVerifyResponse = await axios.get(verifyUrl, {
            headers: {
              Authorization: `Bearer ${accessToken.token}`,
              "Content-Type": "application/json",
            },
            timeout: 30000,
          });

          console.log(`✅ Retry verification successful!`);
          console.log(`✅ Corpus State: ${retryVerifyResponse.data.state}`);
        } catch (retryError) {
          console.error(
            `❌ Retry verification also failed:`,
            retryError.response?.data
          );
          console.warn(
            `⚠️ Continuing with database save despite verification failure...`
          );
        }
      }

      // Step 6: 保存到資料庫
      console.log(`💾 === DATABASE SAVE ===`);
      try {
        const insertQuery = `
          INSERT INTO rag (ragid, userid, ragname, visibility, created_at, updated_at) 
          VALUES (?, ?, ?, ?, NOW(), NOW())
        `;

        console.log(
          `💾 Saving to database: [${finalCorpusId}, ${userId}, ${finalRagName}, ${visibility}]`
        );

        await this.db.execute(insertQuery, [
          finalCorpusId,
          userId,
          finalRagName,
          visibility,
        ]);

        console.log(`✅ Successfully saved to database: ${finalCorpusId}`);
      } catch (dbError) {
        console.error("❌ Database save failed:", dbError);
        throw dbError;
      }

      return {
        success: true,
        userId: userId,
        engineId: finalCorpusId,
        corpusId: finalCorpusId,
        corpusName: corpusName,
        displayName: finalDisplayName,
        ragName: finalRagName,
        visibility: visibility,
        bucketPath: `user-data/${userId}`,
        createdAt: new Date().toISOString(),
        message: `RAG Engine "${finalRagName}" created successfully and ready for use`,
        engine: {
          ragid: finalCorpusId,
          ragname: finalRagName,
          visibility: visibility,
          created_at: new Date().toISOString(),
        },
        // 添加狀態信息
        isAsyncOperation:
          response.data.name && response.data.name.includes("/operations/"),
        readyForUse: true,
      };
    } catch (error) {
      console.error(`❌ === RAG ENGINE CREATION FAILED ===`);
      console.error(`❌ Error Details:`);
      console.error(`   - Type: ${error.constructor.name}`);
      console.error(`   - Message: ${error.message}`);
      console.error(`   - Status: ${error.response?.status}`);
      console.error(
        `   - Data: ${JSON.stringify(error.response?.data, null, 2)}`
      );
      console.error(`   - Stack: ${error.stack}`);

      return {
        success: false,
        error: error.message,
        details: error.response?.data,
        statusCode: error.response?.status,
        message: "Failed to create RAG Engine",
      };
    }
  }

  async waitForOperation(operationName, maxWaitTime = 300000) {
    try {
      const authClient = await this.auth.getClient();
      const startTime = Date.now();
      let attemptCount = 0;

      console.log(`⏳ === WAITING FOR ASYNC OPERATION ===`);
      console.log(`📛 Operation: ${operationName}`);
      console.log(`⏰ Max wait time: ${maxWaitTime / 1000} seconds`);

      while (Date.now() - startTime < maxWaitTime) {
        attemptCount++;
        console.log(`🔄 Attempt ${attemptCount}: Checking operation status...`);

        const accessToken = await authClient.getAccessToken();
        const statusUrl = `https://${this.location}-aiplatform.googleapis.com/v1beta1/${operationName}`;

        try {
          const response = await axios.get(statusUrl, {
            headers: {
              Authorization: `Bearer ${accessToken.token}`,
              "Content-Type": "application/json",
            },
            timeout: 30000,
          });

          const operation = response.data;
          console.log(
            `📊 Operation status: done=${operation.done}, name=${operation.name}`
          );

          if (operation.done) {
            if (operation.error) {
              console.error(
                `❌ Operation completed with error:`,
                operation.error
              );
              return {
                success: false,
                error: operation.error,
              };
            }

            console.log(`✅ Operation completed successfully!`);
            console.log(
              `✅ Result:`,
              JSON.stringify(operation.response, null, 2)
            );

            return {
              success: true,
              result: operation.response,
              metadata: operation.metadata,
              attemptCount: attemptCount,
              totalWaitTime: Date.now() - startTime,
            };
          }

          // 顯示進度
          const elapsedTime = Math.round((Date.now() - startTime) / 1000);
          console.log(`⏳ Still waiting... (${elapsedTime}s elapsed)`);

          // 等待 15 秒後重試
          await new Promise((resolve) => setTimeout(resolve, 15000));
        } catch (statusError) {
          console.error(
            `❌ Failed to check operation status (attempt ${attemptCount}):`,
            statusError.response?.data || statusError.message
          );

          // 如果是網絡錯誤，等待後重試
          if (
            statusError.code === "ECONNRESET" ||
            statusError.code === "ETIMEDOUT"
          ) {
            console.log(`🔄 Network error, retrying in 10 seconds...`);
            await new Promise((resolve) => setTimeout(resolve, 10000));
            continue;
          }

          // 其他錯誤，等待後重試
          await new Promise((resolve) => setTimeout(resolve, 10000));
        }
      }

      console.error(`❌ Operation timeout after ${maxWaitTime / 1000} seconds`);
      return {
        success: false,
        error: "Operation timeout",
        attemptCount: attemptCount,
        totalWaitTime: maxWaitTime,
      };
    } catch (error) {
      console.error("❌ Error waiting for operation:", error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  // 📋 列出所有 RAG Engines - 整合資料庫信息（支援分頁）
  async listAllRAGEngines(pageSize = 100) {
    try {
      return await this.rateLimitedCall(async () => {
        const authClient = await this.auth.getClient();
        const accessToken = await authClient.getAccessToken();

        let allRagCorpora = [];
        let nextPageToken = null;
        let totalPages = 0;

        do {
          const listUrl = `https://${this.location}-aiplatform.googleapis.com/v1beta1/projects/${this.projectId}/locations/${this.location}/ragCorpora`;

          // 構建查詢參數
          const params = new URLSearchParams();
          params.append("pageSize", pageSize.toString());
          if (nextPageToken) {
            params.append("pageToken", nextPageToken);
          }

          const fullUrl = `${listUrl}?${params.toString()}`;
          console.log(
            `Listing RAG engines from: ${fullUrl} (Page ${totalPages + 1})`
          );

          const response = await axios.get(fullUrl, {
            headers: {
              Authorization: `Bearer ${accessToken.token}`,
              "Content-Type": "application/json",
            },
          });

          const ragCorpora = response.data.ragCorpora || [];
          allRagCorpora = allRagCorpora.concat(ragCorpora);

          nextPageToken = response.data.nextPageToken;
          totalPages++;

          console.log(
            `Page ${totalPages}: Found ${ragCorpora.length} RAG corpora (Total so far: ${allRagCorpora.length})`
          );

          // 安全檢查：防止無限循環
          if (totalPages > 10) {
            console.warn(`停止分頁請求，已處理 ${totalPages} 頁`);
            break;
          }
        } while (nextPageToken);

        console.log(
          `✅ 分頁完成：共 ${totalPages} 頁，總計 ${allRagCorpora.length} 個 RAG Engines`
        );

        // 從資料庫獲取額外信息
        const [dbRags] = await this.db.execute("SELECT * FROM rag");
        const dbRagMap = {};
        dbRags.forEach((rag) => {
          dbRagMap[rag.ragid] = rag;
        });

        const engines = allRagCorpora.map((corpus) => {
          const corpusId = corpus.name
            ? corpus.name.split("/").pop()
            : "unknown";
          const dbInfo = dbRagMap[corpusId];

          const userId = this.extractUserIdFromEngine(corpus);

          return {
            id: corpusId,
            name: corpus.name || "Unknown",
            displayName: corpus.displayName || "Unknown",
            description: corpus.description || "",
            createTime: corpus.createTime || "Unknown",
            updateTime: corpus.updateTime || "Unknown",
            userId: userId,
            // 資料庫信息
            ragName: dbInfo?.ragname || corpus.displayName,
            visibility: dbInfo?.visibility || "unknown",
            dbCreatedAt: dbInfo?.created_at,
            dbUpdatedAt: dbInfo?.updated_at,
            hasDbRecord: !!dbInfo,
          };
        });

        return {
          success: true,
          engines: engines,
          totalEngines: engines.length,
          dbEngines: dbRags.length,
          totalPages: totalPages,
          timestamp: new Date().toISOString(),
          pagination: {
            requestedPageSize: pageSize,
            actualPages: totalPages,
            totalResults: engines.length,
            hasMultiplePages: totalPages > 1,
          },
        };
      });
    } catch (error) {
      console.error(
        "List RAG engines error:",
        error.response?.data || error.message
      );

      if (error.response?.data?.error?.code === 429) {
        return {
          success: false,
          error: "Rate limit exceeded",
          userMessage: "請求過於頻繁，請稍後再試",
          retryAfter: 60,
        };
      }

      return {
        success: false,
        error: error.response?.data || error.message,
      };
    }
  }

  // 🔍 從 Engine 中提取用戶 ID（改进版 - 支持數據庫 UUID 和舊格式用戶名）
  extractUserIdFromEngine(corpus) {
    // 嘗試從 displayName 中提取（新格式：userId - engineName）
    if (corpus.displayName) {
      // 匹配新格式 "userId - engineName"
      const newFormatMatch = corpus.displayName.match(
        /^([a-f0-9\-]{36}) - (.+)$/
      );
      if (newFormatMatch) {
        return newFormatMatch[1];
      }

      // 匹配舊格式 "userId-engineName"
      const oldFormatMatch = corpus.displayName.match(
        /^([a-f0-9\-]{36})-(.+)$/
      );
      if (oldFormatMatch) {
        return oldFormatMatch[1];
      }

      // 匹配 Knowledge Base 格式 "userId Knowledge Base"
      const kbFormatMatch = corpus.displayName.match(
        /^([a-f0-9\-]{36}) Knowledge Base$/
      );
      if (kbFormatMatch) {
        return kbFormatMatch[1];
      }

      // 🆕 匹配舊的用戶名格式 "username's Knowledge Base"
      const legacyKbFormatMatch = corpus.displayName.match(
        /^(.+)'s Knowledge Base$/
      );
      if (legacyKbFormatMatch) {
        return `legacy_user_${legacyKbFormatMatch[1]}`;
      }

      // 🆕 匹配其他舊格式 "username-engineName"
      const legacyFormatMatch = corpus.displayName.match(/^([^-]+)-(.+)$/);
      if (
        legacyFormatMatch &&
        !legacyFormatMatch[1].match(/^[a-f0-9\-]{36}$/)
      ) {
        return `legacy_user_${legacyFormatMatch[1]}`;
      }
    }

    // 嘗試從 description 中提取用戶 ID（UUID格式）
    if (corpus.description) {
      const uuidMatch = corpus.description.match(/user ([a-f0-9\-]{36})/i);
      if (uuidMatch) {
        return uuidMatch[1];
      }

      // 🆕 嘗試從 description 中提取舊格式用戶名
      const legacyUserMatch = corpus.description.match(/user ([^-\s]+)/i);
      if (legacyUserMatch) {
        return `legacy_user_${legacyUserMatch[1]}`;
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

  // 🗑️ 刪除整個 RAG Engine（修正版 - 同步刪除資料庫記錄）
  async deleteUserRAGEngine(corpusName, userId) {
    try {
      const ragId = corpusName.split("/").pop();

      // 檢查用戶權限
      const checkQuery = "SELECT * FROM rag WHERE ragid = ? AND userid = ?";
      const [ragResults] = await this.db.execute(checkQuery, [ragId, userId]);

      if (ragResults.length === 0) {
        return {
          success: false,
          error: "您沒有權限刪除此 RAG Engine",
        };
      }

      console.log(`🗑️ Deleting RAG Engine: ${corpusName}`);

      const authClient = await this.auth.getClient();
      const accessToken = await authClient.getAccessToken();

      const deleteUrl = `https://${this.location}-aiplatform.googleapis.com/v1beta1/${corpusName}`;

      const response = await axios.delete(deleteUrl, {
        headers: {
          Authorization: `Bearer ${accessToken.token}`,
          "Content-Type": "application/json",
        },
      });

      console.log("RAG Engine deletion response:", response.status);

      // 同步刪除資料庫記錄
      try {
        await this.db.execute("DELETE FROM rag WHERE ragid = ?", [ragId]);
        console.log("✅ RAG Engine removed from database");
      } catch (dbError) {
        console.error("❌ Failed to remove RAG Engine from database:", dbError);
        // 不拋出錯誤，因為 Google Cloud 中的 RAG Engine 已被刪除
      }

      return {
        success: true,
        message: "RAG Engine 已成功刪除",
        deletedEngine: corpusName,
      };
    } catch (error) {
      console.error(`❌ Failed to delete RAG Engine ${corpusName}:`);
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

  // 🔧 診斷 Google Cloud 設置
  async diagnoseGoogleCloudSetup() {
    try {
      console.log(`🔍 === GOOGLE CLOUD SETUP DIAGNOSIS ===`);

      // 檢查認證
      const authClient = await this.auth.getClient();
      const accessToken = await authClient.getAccessToken();
      console.log(`✅ Authentication: OK`);
      console.log(
        `🔑 Token length: ${accessToken.token ? accessToken.token.length : 0}`
      );

      // 檢查項目訪問權限
      const testUrl = `https://${this.location}-aiplatform.googleapis.com/v1beta1/projects/${this.projectId}/locations/${this.location}`;
      console.log(`🔍 Testing project access: ${testUrl}`);

      const testResponse = await axios.get(testUrl, {
        headers: {
          Authorization: `Bearer ${accessToken.token}`,
          "Content-Type": "application/json",
        },
        timeout: 30000,
      });

      console.log(`✅ Project access: OK`);
      console.log(`📊 Location info:`, testResponse.data);

      // 列出現有的 RAG Corpora
      const listUrl = `https://${this.location}-aiplatform.googleapis.com/v1beta1/projects/${this.projectId}/locations/${this.location}/ragCorpora`;
      console.log(`🔍 Listing existing RAG Corpora: ${listUrl}`);

      const listResponse = await axios.get(listUrl, {
        headers: {
          Authorization: `Bearer ${accessToken.token}`,
          "Content-Type": "application/json",
        },
        timeout: 30000,
      });

      console.log(`✅ RAG Corpora list: OK`);
      console.log(
        `📊 Existing corpora count:`,
        listResponse.data.ragCorpora?.length || 0
      );

      return {
        success: true,
        authentication: "OK",
        projectAccess: "OK",
        existingCorpora: listResponse.data.ragCorpora || [],
        corporaCount: listResponse.data.ragCorpora?.length || 0,
        projectId: this.projectId,
        location: this.location,
        message: "Google Cloud setup is working correctly",
      };
    } catch (error) {
      console.error(
        `❌ Google Cloud diagnosis failed:`,
        error.response?.data || error.message
      );
      return {
        success: false,
        error: error.response?.data || error.message,
        errorStatus: error.response?.status,
        projectId: this.projectId,
        location: this.location,
        message: "Google Cloud setup has issues",
      };
    }
  }

  // 🔧 簡化的 RAG Corpus 創建方法 - 用於調試
  async createSimpleRAGCorpus(userId, engineName = "test") {
    try {
      console.log(`🏗️ === SIMPLE RAG CORPUS CREATION FOR DEBUG ===`);
      console.log(`👤 User ID: ${userId}`);
      console.log(`📛 Engine Name: ${engineName}`);

      // Step 1: 認證
      const authClient = await this.auth.getClient();
      const accessToken = await authClient.getAccessToken();
      console.log(`✅ Authentication successful`);

      // Step 2: 準備最簡單的數據
      const corpusData = {
        displayName: `debug_${userId}_${Date.now()}`,
        description: `Debug RAG corpus for ${userId} created at ${new Date().toISOString()}`,
      };

      // Step 3: 發送創建請求
      const createUrl = `https://${this.location}-aiplatform.googleapis.com/v1beta1/projects/${this.projectId}/locations/${this.location}/ragCorpora`;

      console.log(`📤 Creating Simple RAG Corpus...`);
      console.log(`🔗 URL: ${createUrl}`);
      console.log(`📦 Data:`, JSON.stringify(corpusData, null, 2));

      const response = await axios.post(createUrl, corpusData, {
        headers: {
          Authorization: `Bearer ${accessToken.token}`,
          "Content-Type": "application/json",
        },
        timeout: 60000,
      });

      console.log(`📨 Creation Response Status: ${response.status}`);
      console.log(`📨 Response Data:`, JSON.stringify(response.data, null, 2));

      let corpusName, corpusId;

      // 🔧 修復：檢查是否是異步操作
      if (response.data.name && response.data.name.includes('/operations/')) {
        console.log(`⏳ Detected ASYNC operation: ${response.data.name}`);
        
        // 等待異步操作完成
        const operationResult = await this.waitForOperation(response.data.name, 120000); // 2分鐘超時
        
        if (!operationResult.success) {
          throw new Error(`Async operation failed: ${JSON.stringify(operationResult.error)}`);
        }
        
        console.log(`✅ Async operation completed successfully`);
        
        // 從 operation result 中獲取真正的 corpus 信息
        if (operationResult.result && operationResult.result.name) {
          corpusName = operationResult.result.name;
          corpusId = corpusName.split('/').pop();
          console.log(`✅ Corpus created via async: ${corpusName}`);
        } else {
          throw new Error('No corpus name found in async operation result');
        }
      } else {
        // 同步操作
        corpusName = response.data.name;
        corpusId = corpusName.split("/").pop();
        console.log(`✅ Corpus created synchronously: ${corpusName}`);
      }

      // 立即驗證
      const verifyUrl = `https://${this.location}-aiplatform.googleapis.com/v1beta1/${corpusName}`;
      console.log(`🔍 Verifying corpus: ${verifyUrl}`);

      const verifyResponse = await axios.get(verifyUrl, {
        headers: {
          Authorization: `Bearer ${accessToken.token}`,
          "Content-Type": "application/json",
        },
        timeout: 30000,
      });

      console.log(`✅ Verification successful!`);
      console.log(`✅ Corpus State: ${verifyResponse.data.state}`);

      return {
        success: true,
        corpusId: corpusId,
        corpusName: corpusName,
        displayName: corpusData.displayName,
        state: verifyResponse.data.state,
        message: "Simple RAG Corpus created successfully",
      };
    } catch (error) {
      console.error(`❌ Simple RAG creation failed:`, {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data,
      });

      return {
        success: false,
        error: error.message,
        details: error.response?.data,
        statusCode: error.response?.status,
      };
    }
  }
  async shareRAGEngineToUser(ownerId, ragId, targetUsername) {
    try {
      // 檢查 owner 是否真的擁有這個 engine
      const [rows] = await this.db.execute(
        "SELECT * FROM rag WHERE ragid = ? AND userid = ?",
        [ragId, ownerId]
      );
      if (rows.length === 0) {
        return { success: false, error: "您沒有權限分享此 RAG Engine" };
      }

      // 根據 username 查找目標用戶的 userid
      const [userRows] = await this.db.execute(
        "SELECT userid FROM users WHERE username = ?",
        [targetUsername]
      );
      if (userRows.length === 0) {
        return { success: false, error: "找不到指定的用戶名" };
      }
      const targetUserId = userRows[0].userid;

      // 檢查是否是好友關係 (支援 known 和 Known 字段)
      const [friendshipRows1] = await this.db.execute(
        "SELECT * FROM friendship WHERE (userid = ? AND friendid = ? AND known = 'true') OR (userid = ? AND friendid = ? AND known = 'true')",
        [ownerId, targetUserId, targetUserId, ownerId]
      );
      
      const [friendshipRows2] = await this.db.execute(
        "SELECT * FROM friendship WHERE (userid = ? AND friendid = ? AND Known = 'true') OR (userid = ? AND friendid = ? AND Known = 'true')",
        [ownerId, targetUserId, targetUserId, ownerId]
      );

      if (friendshipRows1.length === 0 && friendshipRows2.length === 0) {
        return { success: false, error: "只能分享給您的好友" };
      }

      // 檢查是否已經分享過
      const [existing] = await this.db.execute(
        "SELECT * FROM private_rag WHERE ragid = ? AND userid = ?",
        [ragId, targetUserId]
      );
      if (existing.length > 0) {
        return { success: false, error: "已經分享給此用戶" };
      }

      // 執行分享
      await this.db.execute(
        "INSERT INTO private_rag (ragid, userid) VALUES (?, ?)",
        [ragId, targetUserId]
      );
      
      return { 
        success: true, 
        message: `RAG Engine 已成功分享給 ${targetUsername}`,
        targetUsername: targetUsername,
        targetUserId: targetUserId
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

}

module.exports = EngineManagement;
