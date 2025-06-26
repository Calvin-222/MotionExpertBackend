const axios = require("axios");
const FormData = require("form-data");
const fs = require("fs");

const BASE_URL = "http://localhost:3000/api";
const RAG_URL = `${BASE_URL}/rag`;
const AUTH_URL = `${BASE_URL}/auth`;

class RAGSystemTester {
  constructor() {
    this.testUsers = {
      user1: {
        username: "testuser1",
        password: "test123456",
        token: null,
        userId: null,
      },
      user2: {
        username: "testuser2",
        password: "test123456",
        token: null,
        userId: null,
      },
    };
  }

  async runAllTests() {
    console.log("🧪 開始 RAG 系統完整測試（JWT 認證版本）...\n");

    try {
      // 1. 基礎連接測試
      await this.testBasicConnection();

      // 2. 用戶認證測試
      await this.testUserAuthentication();

      // 3. 用戶 RAG 狀態測試
      await this.testUserRAGStatus();

      // 4. 文檔上傳測試
      await this.testDocumentUpload();

      // 5. 文檔查詢測試
      await this.testDocumentQuery();

      // 6. 多用戶隔離測試
      await this.testMultiUserIsolation();

      // 7. 文檔管理測試
      await this.testDocumentManagement();

      // 8. 錯誤處理測試
      await this.testErrorHandling();

      // 9. 系統概覽測試
      await this.testSystemOverview();

      console.log("✅ 所有測試完成！");
    } catch (error) {
      console.error("❌ 測試失敗:", error.message);
      console.error("詳細錯誤:", error.response?.data || error.stack);
    }
  }

  async testBasicConnection() {
    console.log("1. 🔗 測試基礎連接...");
    try {
      const response = await axios.get(`${RAG_URL}/test`);
      console.log(`   ✅ 狀態: ${response.status}`);
      console.log(`   📊 版本: ${response.data.version}`);
      console.log(`   🚀 功能數量: ${response.data.features.length}`);
      console.log("");
    } catch (error) {
      console.log(`   ❌ 連接失敗: ${error.message}`);
      throw error;
    }
  }

  async testUserAuthentication() {
    console.log("2. 🔐 測試用戶認證...");

    // 測試用戶註冊
    for (const [key, user] of Object.entries(this.testUsers)) {
      try {
        console.log(`   🔄 正在處理 ${key}...`);

        const registerResponse = await axios.post(`${AUTH_URL}/register`, {
          username: user.username,
          password: user.password,
          confirmPassword: user.password,
        });

        console.log(`   📝 ${key} 註冊回應:`, registerResponse.data);

        if (registerResponse.data.success) {
          user.token = registerResponse.data.token;
          user.userId = registerResponse.data.user.userid;

          // 檢查 token 有效性
          console.log(`   🔍 檢查 ${key} token 結構...`);
          try {
            const tokenParts = user.token.split(".");
            const payload = JSON.parse(
              Buffer.from(tokenParts[1], "base64").toString()
            );
            console.log(`   📊 Token payload:`, payload);
            console.log(
              `   ⏰ Token 過期時間: ${new Date(
                payload.exp * 1000
              ).toISOString()}`
            );
          } catch (e) {
            console.log(`   ⚠️ Token 解析失敗:`, e.message);
          }

          // 檢查 userId 是否存在且為字串
          if (user.userId && typeof user.userId === "string") {
            console.log(
              `   ✅ ${key} 註冊成功, UserID: ${user.userId.substring(0, 8)}...`
            );
          } else {
            console.log(
              `   ⚠️ ${key} 註冊成功但 UserID 異常: ${
                user.userId
              } (${typeof user.userId})`
            );
          }
        } else {
          console.log(`   ⚠️ ${key} 註冊失敗，嘗試登錄...`);

          // 如果註冊失敗，嘗試登錄（可能已存在）
          const loginResponse = await axios.post(`${AUTH_URL}/login`, {
            username: user.username,
            password: user.password,
          });

          console.log(`   📝 ${key} 登錄回應:`, loginResponse.data);

          if (loginResponse.data.success) {
            user.token = loginResponse.data.token;
            user.userId = loginResponse.data.user.userid;

            // 檢查 token 有效性
            console.log(`   🔍 檢查 ${key} token 結構...`);
            try {
              const tokenParts = user.token.split(".");
              const payload = JSON.parse(
                Buffer.from(tokenParts[1], "base64").toString()
              );
              console.log(`   📊 Token payload:`, payload);
              console.log(
                `   ⏰ Token 過期時間: ${new Date(
                  payload.exp * 1000
                ).toISOString()}`
              );
              console.log(`   🕐 當前時間: ${new Date().toISOString()}`);
            } catch (e) {
              console.log(`   ⚠️ Token 解析失敗:`, e.message);
            }

            // 檢查 userId 是否存在且為字串
            if (user.userId && typeof user.userId === "string") {
              console.log(
                `   ✅ ${key} 登錄成功, UserID: ${user.userId.substring(
                  0,
                  8
                )}...`
              );
            } else {
              console.log(
                `   ⚠️ ${key} 登錄成功但 UserID 異常: ${
                  user.userId
                } (${typeof user.userId})`
              );
            }
          } else {
            throw new Error(`${key} 登錄失敗: ${loginResponse.data.message}`);
          }
        }
      } catch (error) {
        console.log(
          `   ❌ ${key} 認證失敗:`,
          error.response?.data || error.message
        );
        throw error;
      }
    }

    // 等待一秒確保 token 時間同步
    console.log("   ⏳ 等待 1 秒確保時間同步...");
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // 測試 token 驗證
    try {
      console.log(`   🔍 測試 user1 token 驗證...`);
      console.log(
        `   📝 使用 token: ${this.testUsers.user1.token.substring(0, 50)}...`
      );

      const meResponse = await axios.get(`${AUTH_URL}/me`, {
        headers: {
          Authorization: `Bearer ${this.testUsers.user1.token}`,
        },
      });

      console.log(`   ✅ Token 驗證成功: ${meResponse.data.user.username}`);
    } catch (error) {
      console.log(
        `   ❌ Token 驗證失敗:`,
        error.response?.data || error.message
      );
      console.log(
        `   🔍 錯誤詳情:`,
        error.response?.status,
        error.response?.statusText
      );
      throw error;
    }

    console.log("");
  }

  async testUserRAGStatus() {
    console.log("3. 👤 測試用戶 RAG 狀態...");

    try {
      const response = await axios.get(`${RAG_URL}/users/status`, {
        headers: {
          Authorization: `Bearer ${this.testUsers.user1.token}`,
        },
      });

      console.log(`   📊 有 RAG 引擎: ${response.data.hasRAGEngine}`);
      console.log(`   📁 文檔數量: ${response.data.engines?.length || 0}`);
    } catch (error) {
      console.log(
        `   ❌ RAG 狀態查詢失敗:`,
        error.response?.data || error.message
      );
    }

    console.log("");
  }

  async testDocumentUpload() {
    console.log("4. 📤 測試文檔上傳...");

    try {
      // 為用戶1創建測試文檔1
      const testContent1 = `
# AI 技術指南

這是一個關於人工智能的詳細文檔。

## 機器學習
機器學習是人工智能的核心技術，包括：
- 監督學習
- 無監督學習  
- 強化學習

## 深度學習
深度學習使用神經網路來模擬人腦的工作方式。

## 應用領域  
AI技術廣泛應用於：
- 圖像識別
- 自然語言處理
- 自動駕駛
      `;

      fs.writeFileSync("ai-guide.txt", testContent1);

      // 上傳文檔1
      const formData1 = new FormData();
      formData1.append("file", fs.createReadStream("ai-guide.txt"));

      const uploadResponse1 = await axios.post(
        `${RAG_URL}/users/upload`,
        formData1,
        {
          headers: {
            ...formData1.getHeaders(),
            Authorization: `Bearer ${this.testUsers.user1.token}`,
          },
        }
      );

      console.log(`   ✅ 文檔上傳回應:`, uploadResponse1.data);
      console.log(`   📄 上傳成功: ${uploadResponse1.data.success}`);

      // 清理測試文件
      fs.unlinkSync("ai-guide.txt");
    } catch (error) {
      console.log(`   ❌ 文檔上傳失敗:`, error.response?.data || error.message);
      // 確保清理文件
      try {
        fs.unlinkSync("ai-guide.txt");
      } catch (e) {
        // 忽略清理錯誤
      }
    }

    console.log("");
  }

  async testDocumentQuery() {
    console.log("5. 💬 測試文檔查詢...");

    // 等待文檔處理完成
    console.log("   ⏳ 等待文檔處理（30秒）...");
    await new Promise((resolve) => setTimeout(resolve, 30000));

    // 查詢 AI 文檔
    try {
      const queryResponse1 = await axios.post(
        `${RAG_URL}/users/query/ai-guide.txt`,
        {
          question: "什麼是機器學習？請根據我的文檔詳細說明。",
        },
        {
          headers: {
            Authorization: `Bearer ${this.testUsers.user1.token}`,
          },
        }
      );

      console.log(`   ✅ AI文檔查詢成功: ${queryResponse1.data.success}`);
      console.log(
        `   📝 回答長度: ${queryResponse1.data.answer?.length || 0} 字符`
      );
      console.log(`   📄 查詢文件: ${queryResponse1.data.fileName}`);
    } catch (error) {
      console.log(
        `   ⚠️ AI文檔查詢失敗:`,
        error.response?.data || error.message
      );
    }

    console.log("");
  }

  async testMultiUserIsolation() {
    console.log("6. 👥 測試多用戶隔離...");

    try {
      // 為用戶2上傳不同內容
      const user2Content = `
# 雲端計算指南

這是專屬於用戶2的雲端計算文檔。

## 雲端服務類型
- IaaS (基礎設施即服務)
- PaaS (平台即服務)  
- SaaS (軟件即服務)

## 主要雲端提供商
- Amazon AWS
- Microsoft Azure
- Google Cloud Platform

## 安全考量
雲端安全包括數據加密、身份驗證、網路安全等重要議題。
      `;

      fs.writeFileSync("cloud-computing.txt", user2Content);

      const formData = new FormData();
      formData.append("file", fs.createReadStream("cloud-computing.txt"));

      await axios.post(`${RAG_URL}/users/upload`, formData, {
        headers: {
          ...formData.getHeaders(),
          Authorization: `Bearer ${this.testUsers.user2.token}`,
        },
      });

      console.log("   ✅ 用戶2文檔上傳完成");

      // 等待處理
      await new Promise((resolve) => setTimeout(resolve, 15000));

      // 測試用戶2能否查詢自己的文檔
      try {
        const user2Query = await axios.post(
          `${RAG_URL}/users/query/cloud-computing.txt`,
          {
            question: "什麼是雲端計算？",
          },
          {
            headers: {
              Authorization: `Bearer ${this.testUsers.user2.token}`,
            },
          }
        );
        console.log(`   👤 用戶2查詢成功: ${user2Query.data.success}`);
      } catch (error) {
        console.log(
          `   ⚠️ 用戶2查詢失敗:`,
          error.response?.data?.error || error.message
        );
      }

      fs.unlinkSync("cloud-computing.txt");
    } catch (error) {
      console.log(
        `   ❌ 多用戶隔離測試失敗:`,
        error.response?.data || error.message
      );
      try {
        fs.unlinkSync("cloud-computing.txt");
      } catch (e) {
        // 忽略清理錯誤
      }
    }

    console.log("");
  }

  async testDocumentManagement() {
    console.log("7. 📁 測試文檔管理...");

    try {
      // 獲取用戶1的文檔列表
      const statusResponse = await axios.get(`${RAG_URL}/users/status`, {
        headers: {
          Authorization: `Bearer ${this.testUsers.user1.token}`,
        },
      });

      console.log(
        `   📊 用戶1文檔數量: ${statusResponse.data.engines?.length || 0}`
      );

      if (
        statusResponse.data.engines &&
        statusResponse.data.engines.length > 0
      ) {
        console.log("   📄 文檔列表:");
        statusResponse.data.engines.forEach((engine, index) => {
          console.log(
            `     ${index + 1}. ${engine.fileName} (${engine.status})`
          );
        });
      }
    } catch (error) {
      console.log(
        `   ❌ 文檔管理測試失敗:`,
        error.response?.data || error.message
      );
    }

    console.log("");
  }

  async testErrorHandling() {
    console.log("8. ⚠️ 測試錯誤處理...");

    // 測試無效 token
    try {
      await axios.get(`${RAG_URL}/users/status`, {
        headers: {
          Authorization: `Bearer invalid-token`,
        },
      });
    } catch (error) {
      console.log(`   ✅ 正確處理無效 token: ${error.response?.status}`);
    }

    // 測試查詢不存在的文件
    try {
      await axios.post(
        `${RAG_URL}/users/query/non-existent-file.txt`,
        {
          question: "測試問題",
        },
        {
          headers: {
            Authorization: `Bearer ${this.testUsers.user1.token}`,
          },
        }
      );
    } catch (error) {
      console.log(`   ✅ 正確處理不存在文件: ${error.response?.status}`);
    }

    // 測試空查詢
    try {
      await axios.post(
        `${RAG_URL}/users/query/ai-guide.txt`,
        {},
        {
          headers: {
            Authorization: `Bearer ${this.testUsers.user1.token}`,
          },
        }
      );
    } catch (error) {
      console.log(`   ✅ 正確處理空查詢: ${error.response?.status}`);
    }

    console.log("");
  }

  async testSystemOverview() {
    console.log("9. 📊 測試系統概覽...");

    try {
      const response = await axios.get(`${RAG_URL}/engines/overview`);

      console.log(`   ✅ 請求成功，狀態: ${response.status}`);
      console.log(
        `   📈 總引擎數: ${
          response.data.totalEngines || response.data.stats?.totalCount || "N/A"
        }`
      );
      console.log(
        `   👥 用戶引擎數: ${
          response.data.userEngines?.length ||
          response.data.stats?.userCount ||
          0
        }`
      );
      console.log(
        `   🏢 系統引擎數: ${
          response.data.systemEngines?.length ||
          response.data.stats?.systemCount ||
          0
        }`
      );

      // 顯示完整回應以便調試
      console.log(`   🔍 完整回應:`, JSON.stringify(response.data, null, 2));

      if (response.data.userEngines && response.data.userEngines.length > 0) {
        console.log("   👤 用戶引擎詳情:");
        response.data.userEngines.slice(0, 5).forEach((engine, index) => {
          const userIdDisplay =
            engine.userId && typeof engine.userId === "string"
              ? engine.userId.substring(0, 8) + "..."
              : engine.userId || "unknown";
          console.log(
            `     ${index + 1}. ${engine.displayName} (用戶: ${userIdDisplay})`
          );
        });
      }
    } catch (error) {
      console.log(`   ❌ 系統概覽獲取失敗: ${error.message}`);
      console.log(
        `   🔍 錯誤詳情:`,
        error.response?.data || "No response data"
      );
    }

    console.log("");
  }

  // 添加文檔刪除測試
  async testDocumentDeletion() {
    console.log("7.5. 🗑️ 測試文檔刪除...");

    try {
      // 獲取用戶1的文檔列表
      const statusResponse = await axios.get(`${RAG_URL}/users/status`, {
        headers: {
          Authorization: `Bearer ${this.testUsers.user1.token}`,
        },
      });

      if (
        statusResponse.data.engines &&
        statusResponse.data.engines.length > 0
      ) {
        const firstDoc = statusResponse.data.engines[0];
        console.log(`   🎯 嘗試刪除文檔: ${firstDoc.fileName}`);

        const deleteResponse = await axios.delete(
          `${RAG_URL}/users/documents/${firstDoc.fileName}`,
          {
            headers: {
              Authorization: `Bearer ${this.testUsers.user1.token}`,
            },
          }
        );

        console.log(`   ✅ 刪除成功: ${deleteResponse.data.success}`);
        console.log(`   📄 已刪除: ${deleteResponse.data.fileName}`);

        // 驗證刪除後的狀態
        const afterDeleteStatus = await axios.get(`${RAG_URL}/users/status`, {
          headers: {
            Authorization: `Bearer ${this.testUsers.user1.token}`,
          },
        });

        console.log(
          `   📊 刪除後文檔數量: ${afterDeleteStatus.data.engines?.length || 0}`
        );
      }
    } catch (error) {
      console.log(
        `   ❌ 文檔刪除測試失敗:`,
        error.response?.data || error.message
      );
    }

    console.log("");
  }
}

// 執行測試
const tester = new RAGSystemTester();
tester.runAllTests().catch(console.error);
