const axios = require("axios");
const { auth, PROJECT_ID, LOCATION, dbPool } = require("./config");

class EngineManagement {
  constructor() {
    this.auth = auth;
    this.projectId = PROJECT_ID;
    this.location = LOCATION;
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

  // 🏗️ 為用戶創建專屬的 RAG Engine（修正版 - 統一命名並保存到資料庫）
  async createUserRAGEngine(
    userId,
    engineName = null,
    description = null,
    visibility = "private"
  ) {
    try {
      const authClient = await this.auth.getClient();
      const accessToken = await authClient.getAccessToken();

      const createUrl = `https://${this.location}-aiplatform.googleapis.com/v1beta1/projects/${this.projectId}/locations/${this.location}/ragCorpora`;

      // 統一命名：只使用 userId 作為 displayName
      const engineDisplayName = userId;
      const finalRagName = engineName || `${userId}_default_rag`;

      const engineDescription =
        description ||
        `RAG corpus for user ${userId}${
          engineName ? ` - ${engineName}` : ""
        } - Created ${new Date().toISOString()}`;

      const corpusData = {
        displayName: engineDisplayName,
        description: engineDescription,
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

      let corpusId, corpusName, finalDisplayName;

      // 檢查是否是異步操作
      if (response.data.name && response.data.name.includes("/operations/")) {
        console.log("⏳ Async operation detected, waiting for completion...");
        const waitResult = await this.waitForOperation(response.data.name);

        if (waitResult.success) {
          corpusName = waitResult.result.name;
          corpusId = corpusName.split("/").pop();
          finalDisplayName = waitResult.result.displayName;
        } else {
          throw new Error(`Operation failed: ${waitResult.error}`);
        }
      } else {
        // 同步響應
        corpusName = response.data.name;
        corpusId = corpusName.split("/").pop();
        finalDisplayName = response.data.displayName;
      }

      // 保存到資料庫
      try {
        const insertQuery = `
          INSERT INTO rag (ragid, userid, ragname, visibility) 
          VALUES (?, ?, ?, ?)
        `;
        await this.db.execute(insertQuery, [
          corpusId,
          userId,
          finalRagName,
          visibility,
        ]);

        console.log("✅ RAG Engine saved to database");
      } catch (dbError) {
        console.error("❌ Failed to save RAG Engine to database:", dbError);
        console.error("❌ Database error details:", {
          message: dbError.message,
          code: dbError.code,
          errno: dbError.errno,
          sqlState: dbError.sqlState,
          sqlMessage: dbError.sqlMessage,
        });

        // 🔧 如果資料庫保存失敗，回滾 Google Cloud 創建的 RAG Engine
        try {
          console.log("🔄 Attempting to rollback Google Cloud RAG Engine...");
          const deleteUrl = `https://${this.location}-aiplatform.googleapis.com/v1beta1/${corpusName}`;
          await axios.delete(deleteUrl, {
            headers: {
              Authorization: `Bearer ${accessToken.token}`,
              "Content-Type": "application/json",
            },
          });
          console.log("✅ Google Cloud RAG Engine rollback successful");
        } catch (rollbackError) {
          console.error("❌ Rollback failed:", rollbackError.message);
        }

        // 拋出錯誤，停止後續操作
        throw new Error(`Database save failed: ${dbError.message}`);
      }

      console.log(`✅ RAG Engine created for user ${userId}`);
      console.log("Full corpus name:", corpusName);
      console.log("Corpus ID:", corpusId);

      return {
        success: true,
        userId: userId,
        corpusId: corpusId,
        corpusName: corpusName,
        displayName: finalDisplayName,
        ragName: finalRagName,
        visibility: visibility,
        bucketPath: `user-data/${userId}`,
        createdAt: new Date().toISOString(),
      };
    } catch (error) {
      console.error(`❌ Failed to create RAG Engine for user ${userId}:`);
      console.error("Error details:", {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
      });

      // 檢查是否為配額限制錯誤
      const isQuotaError =
        error.response?.data?.error?.code === 429 ||
        error.response?.data?.error?.status === "RESOURCE_EXHAUSTED" ||
        error.response?.data?.error?.message?.includes("Quota exceeded");

      let userFriendlyMessage = "Engine 創建失敗";

      if (isQuotaError) {
        userFriendlyMessage = "系統繁忙，請稍後再試";
      }

      return {
        success: false,
        error: error.response?.data || error.message,
        userMessage: userFriendlyMessage,
        isQuotaError: isQuotaError,
        details: {
          status: error.response?.status,
          message: error.message,
          quotaInfo: isQuotaError
            ? {
                limit: "60 requests per minute per region",
                suggestion: "請等待1-2分鐘後重試，或聯繫管理員申請提高配額",
              }
            : null,
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
            return {
              success: false,
              error: operation.error,
            };
          }

          return {
            success: true,
            result: operation.response,
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
}

module.exports = EngineManagement;
