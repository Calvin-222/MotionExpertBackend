const axios = require("axios");

async function checkRAGEngines() {
  try {
    console.log("🔍 Checking RAG Engines...\n");

    // 嘗試不同的 API 端點
    const possibleEndpoints = [
      "http://localhost:3000/api/rag/engines/overview",
      "http://localhost:3000/api/rag/engines",
      "http://localhost:3000/api/rag/overview",
    ];

    let data = null;
    let usedEndpoint = null;

    for (const endpoint of possibleEndpoints) {
      try {
        console.log(`🔄 嘗試端點: ${endpoint}`);
        const response = await axios.get(endpoint);
        data = response.data;
        usedEndpoint = endpoint;
        console.log(`✅ 成功連接到: ${endpoint}`);
        break;
      } catch (error) {
        console.log(
          `❌ 端點失敗: ${endpoint} - ${
            error.response?.status || error.message
          }`
        );
      }
    }

    if (!data) {
      console.error("❌ 所有 RAG 端點都無法訪問");
      return;
    }

    // 根據實際返回的數據結構調整處理邏輯
    if (data.success) {
      console.log("📊 RAG Engines Statistics:");
      console.log("==========================================");

      // 處理新的數據結構
      if (data.totalEngines !== undefined) {
        console.log(`Total Engines: ${data.totalEngines || "N/A"}`);
      }

      // 原始結構
      if (data.statistics) {
        console.log(`Total Engines: ${data.statistics.totalEngines || "N/A"}`);
        console.log(`User Engines: ${data.statistics.userEngines || "N/A"}`);
        console.log(
          `System Engines: ${data.statistics.systemEngines || "N/A"}`
        );
        console.log(`Total Files: ${data.statistics.totalFiles || "N/A"}`);
        console.log(
          `Active Engines: ${data.statistics.activeEngines || "N/A"}`
        );
      }

      // 新結構
      if (data.stats) {
        console.log("==========================================");
        console.log(
          `Total Engines: ${
            data.stats.totalCount || data.totalEngines || "N/A"
          }`
        );
        console.log(
          `User Engines: ${
            data.stats.userCount || data.userEngines?.length || "N/A"
          }`
        );
        console.log(
          `System Engines: ${
            data.stats.systemCount || data.systemEngines?.length || "N/A"
          }`
        );
        console.log(`Active Engines: ${data.stats.activeEngines || "N/A"}`);
      }

      // 用戶引擎列表
      const userEngines = data.engines?.user || data.userEngines || [];
      console.log("\n👥 User RAG Engines:");
      console.log("==========================================");
      if (userEngines.length > 0) {
        userEngines.forEach((engine, index) => {
          console.log(
            `${index + 1}. Name: ${engine.displayName || engine.name || "N/A"}`
          );
          console.log(`   ID: ${engine.id || "N/A"}`);
          console.log(`   User ID: ${engine.userId || "N/A"}`);
          console.log(`   File Count: ${engine.fileCount || "N/A"}`);
          console.log(`   Status: ${engine.status || "N/A"}`);
          console.log(
            `   Created: ${engine.createTime || engine.createdAt || "N/A"}`
          );
          console.log("   ---");
        });
      } else {
        console.log("   No user engines found.");
      }

      // 系統引擎列表
      const systemEngines = data.engines?.system || data.systemEngines || [];
      console.log("\n🔧 System RAG Engines:");
      console.log("==========================================");
      if (systemEngines.length > 0) {
        systemEngines.forEach((engine, index) => {
          console.log(
            `${index + 1}. Name: ${engine.displayName || engine.name || "N/A"}`
          );
          console.log(`   ID: ${engine.id || "N/A"}`);
          console.log(`   File Count: ${engine.fileCount || "N/A"}`);
          console.log(`   Status: ${engine.status || "N/A"}`);
          console.log(
            `   Created: ${engine.createTime || engine.createdAt || "N/A"}`
          );
          console.log("   ---");
        });
      } else {
        console.log("   No system engines found.");
      }

      // 當前默認引擎
      if (data.currentEngine) {
        console.log("\n🎯 Current Default Engine:");
        console.log("==========================================");
        console.log(`ID: ${data.currentEngine.id || "N/A"}`);
        console.log(
          `Name: ${
            data.currentEngine.name || data.currentEngine.displayName || "N/A"
          }`
        );
      }
    } else {
      console.error("❌ Failed to get RAG engines:", data.error || "未知錯誤");
      console.log("📄 完整回應數據:");
      console.log(JSON.stringify(data, null, 2));
    }
  } catch (error) {
    console.error("❌ Error checking RAG engines:", error.message);
    if (error.response?.data) {
      console.log("📄 錯誤回應:");
      console.log(error.response.data);
    }
  }
}

// 執行檢查
if (require.main === module) {
  checkRAGEngines();
}

module.exports = { checkRAGEngines };
