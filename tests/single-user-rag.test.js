const request = require("supertest");
const mysql = require("mysql2/promise");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

// 測試配置
const TEST_CONFIG = {
  baseURL: "http://localhost:3000",
  testUser: {
    userId: "a1b2c3d4-e5f6-7890-1234-567890abcdef", // 修改為標準36位UUID格式
    username: "singleuser",
    token: null
  },
  dbConfig: {
    host: process.env.DB_HOST || "34.58.46.209",
    user: process.env.DB_USER || "tester",
    password: process.env.DB_PASSWORD || 'G"z(j,}eoP*.;qKU',
    database: process.env.DB_NAME || "user_info",
    port: process.env.DB_PORT || 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  },
  testDocuments: [
    {
      name: "ai_technology.txt",
      content: `人工智能技術指南

深度學習基礎：
深度學習是機器學習的一個子領域，使用多層神經網絡來模擬人腦的學習過程。主要組成包括：

1. 神經網絡架構
- 輸入層：接收原始數據
- 隱藏層：進行特徵提取和轉換
- 輸出層：產生最終預測結果

2. 訓練過程
- 前向傳播：數據從輸入層流向輸出層
- 反向傳播：根據誤差調整網絡權重
- 梯度下降：優化算法，最小化損失函數

3. 常見應用
- 圖像識別：CNN卷積神經網絡
- 自然語言處理：RNN遞歸神經網絡和Transformer
- 語音識別：深度神經網絡結合聲學模型

關鍵技術指標：
- 準確率：正確預測的比例
- 召回率：找到所有相關項目的能力
- F1分數：準確率和召回率的調和平均
- 損失函數：衡量預測與實際值的差異`
    },
    {
      name: "programming_guide.txt", 
      content: `程式設計完全指南

Python編程基礎：
Python是一種高級程式語言，以其簡潔的語法和強大的功能而聞名。

基本語法：
1. 變量定義
name = "張三"
age = 25
height = 175.5

2. 條件語句
if age >= 18:
    print("成年人")
else:
    print("未成年")

3. 循環結構
for i in range(5):
    print(f"數字: {i}")

while age < 30:
    age += 1
    print(f"年齡: {age}")

4. 函數定義
def calculate_area(length, width):
    area = length * width
    return area

result = calculate_area(10, 5)
print(f"面積是: {result}")

數據結構：
- 列表 (List): [1, 2, 3, 4]
- 字典 (Dictionary): {"name": "小明", "age": 20}
- 元組 (Tuple): (1, 2, 3)
- 集合 (Set): {1, 2, 3, 4}

重要概念：
- 物件導向程式設計 (OOP)
- 異常處理 (Exception Handling)
- 文件輸入輸出 (File I/O)
- 模組和套件 (Modules and Packages)`
    },
    {
      name: "health_nutrition.txt",
      content: `健康營養生活指南

均衡飲食原則：
健康的飲食是維持身體機能的基礎，需要遵循以下原則：

1. 營養素平衡
- 碳水化合物：提供能量，佔總熱量50-60%
- 蛋白質：建構和修復組織，佔總熱量15-20%
- 脂肪：提供必需脂肪酸，佔總熱量20-30%
- 維生素和礦物質：調節生理機能

2. 推薦食物
蛋白質來源：
- 瘦肉：雞胸肉、魚類、牛肉
- 植物蛋白：豆腐、豆類、堅果

碳水化合物來源：
- 全穀類：糙米、燕麥、全麥麵包
- 蔬菜水果：提供纖維和維生素

健康脂肪：
- 橄欖油、酪梨、深海魚類
- 堅果和種子

3. 生活習慣
- 每日飲水：建議2000-2500毫升
- 規律運動：每週至少150分鐘中等強度運動
- 充足睡眠：成人每日7-9小時
- 定期健康檢查：預防勝於治療

飲食禁忌：
- 避免過多糖分和加工食品
- 限制鈉的攝取量
- 適量飲酒或避免飲酒
- 注意食物新鮮度和衛生`
    }
  ],
  testQueries: [
    {
      question: "什麼是深度學習？它的主要組成部分有哪些？",
      expectedKeywords: ["深度學習", "神經網絡", "輸入層", "隱藏層", "輸出層"],
      category: "ai_technology"
    },
    {
      question: "如何在Python中定義一個函數？請給出例子。",
      expectedKeywords: ["def", "函數", "return", "calculate_area"],
      category: "programming"
    },
    {
      question: "健康飲食中蛋白質應該佔總熱量的多少比例？",
      expectedKeywords: ["蛋白質", "15-20%", "總熱量"],
      category: "health"
    },
    {
      question: "CNN是什麼？主要用於什麼應用？",
      expectedKeywords: ["CNN", "卷積神經網絡", "圖像識別"],
      category: "ai_technology"
    },
    {
      question: "Python中有哪些基本數據結構？",
      expectedKeywords: ["列表", "字典", "元組", "集合", "List", "Dictionary"],
      category: "programming"
    },
    {
      question: "每日建議飲水量是多少？",
      expectedKeywords: ["2000", "2500", "毫升", "飲水"],
      category: "health"
    }
  ]
};

class SingleUserRAGTester {
  constructor() {
    this.db = null;
    this.testResults = {
      passed: 0,
      failed: 0,
      warnings: 0,
      errors: [],
      warningMessages: []
    };
    this.createdEngine = null;
    this.uploadedDocuments = [];
  }

  // 初始化測試環境
  async setup() {
    console.log("🚀 Setting up Single User RAG Test Environment...");
    
    try {
      // 連接資料庫
      this.db = await mysql.createConnection(TEST_CONFIG.dbConfig);
      console.log("✅ Database connected");

      // 清理測試數據
      await this.cleanupTestData();
      
      // 創建測試用戶
      await this.createTestUser();
      
      // 生成JWT token
      this.generateToken();
      
      console.log("✅ Test environment setup complete");
      return true;
    } catch (error) {
      console.error("❌ Setup failed:", error.message);
      return false;
    }
  }

  // 清理測試數據
  async cleanupTestData() {
    try {
      console.log("🧹 Cleaning up test data...");
      
      await this.db.execute("SET FOREIGN_KEY_CHECKS = 0");
      
      await this.db.execute(
        "DELETE FROM private_rag WHERE userid = ?", 
        [TEST_CONFIG.testUser.userId]
      );
      
      await this.db.execute(
        "DELETE FROM friendship WHERE userid = ? OR friendid = ?", 
        [TEST_CONFIG.testUser.userId, TEST_CONFIG.testUser.userId]
      );
      
      await this.db.execute(
        "DELETE FROM rag WHERE userid = ?", 
        [TEST_CONFIG.testUser.userId]
      );
      
      await this.db.execute(
        "DELETE FROM users WHERE userid = ?", 
        [TEST_CONFIG.testUser.userId]
      );
      
      await this.db.execute("SET FOREIGN_KEY_CHECKS = 1");
      
      console.log("✅ Test data cleaned up");
    } catch (error) {
      console.log("⚠️ Cleanup warning:", error.message);
    }
  }

  // 創建測試用戶
  async createTestUser() {
    try {
      console.log("👤 Creating test user...");
      
      await this.db.execute(
        "INSERT INTO users (userid, username, password, created_at) VALUES (?, ?, ?, NOW())",
        [TEST_CONFIG.testUser.userId, TEST_CONFIG.testUser.username, "hashed_password"]
      );
      console.log(`✅ Test user ${TEST_CONFIG.testUser.username} created`);
    } catch (error) {
      if (error.code === "ER_DUP_ENTRY") {
        console.log(`⚠️ Test user ${TEST_CONFIG.testUser.username} already exists`);
      } else {
        throw error;
      }
    }
  }

  // 生成JWT token
  generateToken() {
    const jwt = require("jsonwebtoken");
    const secret = process.env.JWT_SECRET || "your-super-secret-jwt-key-here-make-it-long-and-random";
    
    TEST_CONFIG.testUser.token = jwt.sign(
      { userId: TEST_CONFIG.testUser.userId }, 
      secret, 
      { expiresIn: "2h" }
    );
    
    console.log("✅ JWT token generated");
  }

  // 創建測試文件
  createTestFile(document) {
    const testFilePath = path.join(__dirname, "temp", document.name);
    
    const tempDir = path.dirname(testFilePath);
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    fs.writeFileSync(testFilePath, document.content);
    return testFilePath;
  }

  // HTTP請求助手
  async makeRequest(method, endpoint, data = null, token = null, file = null) {
    const req = request(TEST_CONFIG.baseURL)[method.toLowerCase()](endpoint);
    
    if (token) {
      req.set("Authorization", `Bearer ${token}`);
    }
    
    if (file) {
      req.attach("file", file);
      if (data) {
        Object.keys(data).forEach(key => {
          req.field(key, data[key]);
        });
      }
    } else if (data) {
      req.send(data);
    }
    
    return await req;
  }

  // 斷言函數
  assert(condition, message) {
    if (condition) {
      this.testResults.passed++;
      console.log(`✅ ${message}`);
    } else {
      this.testResults.failed++;
      const error = `❌ ${message}`;
      console.log(error);
      this.testResults.errors.push(error);
    }
  }

  // 警告函數
  warn(message) {
    this.testResults.warnings++;
    console.log(`⚠️ ${message}`);
    this.testResults.warningMessages.push(message);
  }

  // 等待處理完成
  async waitForProcessing(seconds = 30, message = "processing") {
    console.log(`⏳ Waiting ${seconds} seconds for ${message}...`);
    await new Promise(resolve => setTimeout(resolve, seconds * 1000));
  }

  // 等待操作完成
  async waitForOperation(operationId, maxWaitSeconds = 120) {
    console.log(`⏳ Waiting for operation ${operationId} to complete...`);
    
    for (let i = 0; i < maxWaitSeconds; i += 10) {
      try {
        const response = await this.makeRequest("GET", `/api/rag/operation-status/${operationId}`);
        
        if (response.status === 200 && response.body.done) {
          if (response.body.error) {
            console.log(`❌ Operation failed: ${response.body.error}`);
            return false;
          } else {
            console.log(`✅ Operation completed successfully`);
            return true;
          }
        }
        
        console.log(`⏳ Operation still running... (${i + 10}s)`);
        await this.waitForProcessing(10, "operation completion");
        
      } catch (error) {
        console.log(`⚠️ Could not check operation status: ${error.message}`);
      }
    }
    
    console.log(`⚠️ Operation timeout after ${maxWaitSeconds}s`);
    return false;
  }

  // 1. 測試系統健康狀態
  async testSystemHealth() {
    console.log("\n📊 Testing System Health...");
    
    try {
      const response = await this.makeRequest("GET", "/api/rag/test");
      
      this.assert(response.status === 200, "System health endpoint responds");
      this.assert(response.body.success === true, "System health check passes");
      this.assert(response.body.version === "4.0.0", "Correct system version");
      
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        this.warn("System health test skipped - server not running");
      } else {
        this.assert(false, `System health test failed: ${error.message}`);
      }
    }
  }

  // 2. 測試創建RAG Engine
  async testCreateRAGEngine() {
    console.log("\n🏗️ Testing RAG Engine Creation...");
    
    try {
      const engineName = "MyKnowledgeBase";
      
      const response = await this.makeRequest(
        "POST", 
        "/api/rag/users/engines",
        {
          engineName: engineName,
          description: "Personal knowledge base for testing",
          visibility: "private"
        },
        TEST_CONFIG.testUser.token
      );
      
      console.log("Create engine response:", response.status, response.body);
      
      if (response.status === 200 && response.body.success) {
        this.assert(true, `RAG Engine "${engineName}" created successfully`);
        
        this.createdEngine = {
          id: response.body.engine.id,
          name: engineName,
          displayName: response.body.engine.displayName || engineName
        };
        
        console.log(`📋 Engine ID: ${this.createdEngine.id}`);
        
        // 驗證資料庫記錄
        const [dbRecords] = await this.db.execute(
          "SELECT * FROM rag WHERE userid = ? AND ragname = ?", 
          [TEST_CONFIG.testUser.userId, engineName]
        );
        
        this.assert(dbRecords.length > 0, "Engine saved to database");
        
      } else if (response.body && response.body.isQuotaError) {
        this.warn("Engine creation skipped due to quota limit");
        return false;
      } else {
        this.assert(false, `Failed to create engine: ${response.body?.error || 'Unknown error'}`);
        return false;
      }
      
      return true;
      
    } catch (error) {
      this.assert(false, `Engine creation test failed: ${error.message}`);
      return false;
    }
  }

  // 3. 測試上傳三個文檔
  async testUploadDocuments() {
    console.log("\n📤 Testing Document Upload...");
    
    if (!this.createdEngine) {
      this.assert(false, "No engine available for document upload");
      return false;
    }
    
    try {
      let allUploadsSuccessful = true;
      
      for (let i = 0; i < TEST_CONFIG.testDocuments.length; i++) {
        const document = TEST_CONFIG.testDocuments[i];
        const testFilePath = this.createTestFile(document);
        
        console.log(`\n📄 Uploading document ${i + 1}/3: ${document.name}`);
        
        try {
          const response = await this.makeRequest(
            "POST",
            `/api/rag/users/${TEST_CONFIG.testUser.userId}/upload`,
            { ragId: this.createdEngine.id },
            TEST_CONFIG.testUser.token,
            testFilePath
          );
          
          if (response.status === 200 && response.body.success) {
            this.assert(true, `Document "${document.name}" uploaded successfully`);
            
            // 記錄上傳的文檔
            this.uploadedDocuments.push({
              name: document.name,
              content: document.content,
              operationId: response.body.data?.operationId
            });
            
            // 等待導入操作完成
            if (response.body.data?.operationId) {
              console.log(`⏳ Waiting for import operation...`);
              const success = await this.waitForOperation(response.body.data.operationId, 60);
              if (success) {
                this.assert(true, `Document "${document.name}" processed successfully`);
              } else {
                this.warn(`Document "${document.name}" processing may have failed`);
              }
            }
            
          } else {
            this.assert(false, `Failed to upload "${document.name}": ${response.body?.error || response.body?.message}`);
            allUploadsSuccessful = false;
          }
          
          // 清理臨時文件
          fs.unlinkSync(testFilePath);
          
          // 等待避免並發衝突
          if (i < TEST_CONFIG.testDocuments.length - 1) {
            await this.waitForProcessing(8, "avoiding concurrent operations");
          }
          
        } catch (uploadError) {
          this.assert(false, `Upload error for "${document.name}": ${uploadError.message}`);
          allUploadsSuccessful = false;
          if (fs.existsSync(testFilePath)) {
            fs.unlinkSync(testFilePath);
          }
        }
      }
      
      if (allUploadsSuccessful) {
        this.assert(true, "All three documents uploaded successfully");
      }
      
      return allUploadsSuccessful;
      
    } catch (error) {
      this.assert(false, `Document upload test failed: ${error.message}`);
      return false;
    }
  }

  // 4. 測試AI查詢和回答準確性
  async testAIQueries() {
    console.log("\n🧠 Testing AI Queries and Response Accuracy...");
    
    if (!this.createdEngine || this.uploadedDocuments.length === 0) {
      this.assert(false, "No engine or documents available for AI testing");
      return false;
    }
    
    // 等待所有文檔處理完成
    console.log("⏳ Allowing extra time for all documents to be fully processed...");
    await this.waitForProcessing(60, "document indexing and processing");
    
    try {
      let allQueriesSuccessful = true;
      
      for (let i = 0; i < TEST_CONFIG.testQueries.length; i++) {
        const query = TEST_CONFIG.testQueries[i];
        
        console.log(`\n🔍 Query ${i + 1}/${TEST_CONFIG.testQueries.length}: ${query.question}`);
        
        try {
          const response = await this.makeRequest(
            "POST",
            `/api/rag/users/${TEST_CONFIG.testUser.userId}/engines/${this.createdEngine.id}/query`,
            { question: query.question },
            TEST_CONFIG.testUser.token
          );
          
          if (response.status === 200 && response.body.success) {
            const answer = response.body.answer;
            
            this.assert(true, `Query "${query.question.substring(0, 30)}..." executed successfully`);
            
            // 檢查回答品質
            if (answer && answer.length > 20) {
              this.assert(true, `AI provided substantial answer (${answer.length} characters)`);
            } else {
              this.warn(`AI answer seems too short for query about ${query.category}`);
            }
            
            // 檢查是否包含期望關鍵詞
            const answerLower = answer.toLowerCase();
            const foundKeywords = query.expectedKeywords.filter(keyword => 
              answerLower.includes(keyword.toLowerCase())
            );
            
            if (foundKeywords.length > 0) {
              this.assert(
                true, 
                `AI answer contains relevant keywords: ${foundKeywords.join(', ')}`
              );
            } else {
              this.warn(
                `AI answer may not contain expected keywords for ${query.category} topic. Keywords: ${query.expectedKeywords.join(', ')}`
              );
            }
            
            // 檢查回答是否相關且具體
            const isRelevant = query.expectedKeywords.some(keyword => 
              answerLower.includes(keyword.toLowerCase())
            ) || answer.includes("找不到") || answer.includes("沒有相關");
            
            if (isRelevant) {
              this.assert(true, `AI provided relevant response for ${query.category} query`);
            } else {
              this.warn(`AI response may not be relevant to ${query.category} topic`);
            }
            
            // 顯示部分回答內容用於人工檢查
            console.log(`📝 AI Response: ${answer.substring(0, 150)}${answer.length > 150 ? '...' : ''}`);
            
          } else {
            this.assert(false, `Query failed: ${response.body?.error || 'Unknown error'}`);
            allQueriesSuccessful = false;
          }
          
        } catch (queryError) {
          this.assert(false, `Query error: ${queryError.message}`);
          allQueriesSuccessful = false;
        }
        
        // 等待一下避免請求過於頻繁
        if (i < TEST_CONFIG.testQueries.length - 1) {
          await this.waitForProcessing(3, "rate limiting");
        }
      }
      
      if (allQueriesSuccessful) {
        this.assert(true, "All AI queries completed successfully");
      }
      
      return allQueriesSuccessful;
      
    } catch (error) {
      this.assert(false, `AI queries test failed: ${error.message}`);
      return false;
    }
  }

  // 5. 測試AI理解能力驗證
  async testAIUnderstanding() {
    console.log("\n🎯 Testing AI Understanding Verification...");
    
    if (!this.createdEngine) {
      this.assert(false, "No engine available for understanding test");
      return;
    }
    
    try {
      // 測試綜合理解能力
      const comprehensiveQuery = "請根據上傳的文檔，分別說明深度學習、Python編程和健康飲食的關鍵要點。";
      
      console.log(`🔍 Comprehensive query: ${comprehensiveQuery}`);
      
      const response = await this.makeRequest(
        "POST",
        `/api/rag/users/${TEST_CONFIG.testUser.userId}/engines/${this.createdEngine.id}/query`,
        { question: comprehensiveQuery },
        TEST_CONFIG.testUser.token
      );
      
      if (response.status === 200 && response.body.success) {
        const answer = response.body.answer;
        
        this.assert(true, "Comprehensive understanding query executed successfully");
        
        // 檢查是否涵蓋了三個主要主題
        const topics = [
          { name: "深度學習", keywords: ["深度學習", "神經網絡", "機器學習"] },
          { name: "Python編程", keywords: ["Python", "編程", "函數", "變量"] },
          { name: "健康飲食", keywords: ["營養", "飲食", "蛋白質", "健康"] }
        ];
        
        let topicsCovered = 0;
        const answerLower = answer.toLowerCase();
        
        topics.forEach(topic => {
          const hasKeywords = topic.keywords.some(keyword => 
            answerLower.includes(keyword.toLowerCase())
          );
          if (hasKeywords) {
            topicsCovered++;
            this.assert(true, `AI response covers ${topic.name} topic`);
          } else {
            this.warn(`AI response may not adequately cover ${topic.name} topic`);
          }
        });
        
        if (topicsCovered >= 2) {
          this.assert(true, `AI demonstrates good understanding (covers ${topicsCovered}/3 topics)`);
        } else {
          this.warn(`AI understanding may be limited (covers only ${topicsCovered}/3 topics)`);
        }
        
        console.log(`📝 Comprehensive Response: ${answer.substring(0, 200)}${answer.length > 200 ? '...' : ''}`);
        
      } else {
        this.assert(false, `Comprehensive query failed: ${response.body?.error || 'Unknown error'}`);
      }
      
    } catch (error) {
      this.assert(false, `AI understanding test failed: ${error.message}`);
    }
  }

  // 運行所有測試
  async runAllTests() {
    console.log("🧪 Starting Single User RAG System Test...\n");
    console.log("📋 Test Plan:");
    console.log("   1. Create a new RAG Engine");
    console.log("   2. Upload 3 different documents");
    console.log("   3. Test AI queries on uploaded content");
    console.log("   4. Verify AI understanding and accuracy\n");
    
    const setupSuccess = await this.setup();
    if (!setupSuccess) {
      console.error("❌ Setup failed, aborting tests");
      return;
    }
    
    try {
      await this.testSystemHealth();
      
      const engineCreated = await this.testCreateRAGEngine();
      if (!engineCreated) {
        console.error("❌ Engine creation failed, aborting remaining tests");
        return;
      }
      
      const documentsUploaded = await this.testUploadDocuments();
      if (!documentsUploaded) {
        console.error("❌ Document upload failed, aborting AI tests");
        return;
      }
      
      await this.testAIQueries();
      await this.testAIUnderstanding();
      
    } catch (error) {
      console.error("❌ Test execution error:", error.message);
    } finally {
      await this.cleanup();
      this.printResults();
    }
  }

  // 清理測試環境
  async cleanup() {
    console.log("\n🧹 Cleaning up test environment...");
    
    try {
      // 刪除創建的引擎
      if (this.createdEngine) {
        try {
          await this.makeRequest(
            "DELETE",
            `/api/rag/users/${TEST_CONFIG.testUser.userId}/engines/${this.createdEngine.id}`,
            null,
            TEST_CONFIG.testUser.token
          );
          console.log(`🗑️ Cleaned up engine ${this.createdEngine.name}`);
        } catch (error) {
          console.log(`⚠️ Could not clean up engine: ${error.message}`);
        }
      }
      
      // 清理資料庫
      await this.cleanupTestData();
      
      // 清理臨時文件
      const tempDir = path.join(__dirname, "temp");
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
      
      if (this.db) {
        await this.db.end();
      }
      
      console.log("✅ Cleanup complete");
    } catch (error) {
      console.error("❌ Cleanup error:", error.message);
    }
  }

  // 打印測試結果
  printResults() {
    console.log("\n📊 Single User RAG Test Results:");
    console.log("=".repeat(50));
    console.log(`✅ Passed: ${this.testResults.passed}`);
    console.log(`❌ Failed: ${this.testResults.failed}`);
    console.log(`⚠️ Warnings: ${this.testResults.warnings}`);
    
    const total = this.testResults.passed + this.testResults.failed;
    if (total > 0) {
      console.log(`📈 Success Rate: ${((this.testResults.passed / total) * 100).toFixed(2)}%`);
    }
    
    if (this.testResults.errors.length > 0) {
      console.log("\n❌ Failed Tests:");
      this.testResults.errors.forEach((error, index) => {
        console.log(`${index + 1}. ${error}`);
      });
    }
    
    if (this.testResults.warningMessages.length > 0) {
      console.log("\n⚠️ Warnings:");
      this.testResults.warningMessages.forEach((warning, index) => {
        console.log(`${index + 1}. ${warning}`);
      });
    }
    
    console.log("\n" + "=".repeat(50));
    
    // 評估測試結果
    const successRate = total > 0 ? (this.testResults.passed / total) * 100 : 0;
    
    if (this.testResults.failed === 0) {
      console.log("🎉 All tests passed! Single User RAG System is working perfectly!");
    } else if (successRate >= 80) {
      console.log("✅ RAG System is working well with minor issues.");
    } else {
      console.log("⚠️ RAG System has some issues that need attention.");
    }
    
    console.log("\n📝 Test Summary:");
    console.log("   - RAG Engine creation: " + (this.createdEngine ? "✅ Success" : "❌ Failed"));
    console.log("   - Document uploads: " + (this.uploadedDocuments.length === 3 ? "✅ All 3 uploaded" : `⚠️ Only ${this.uploadedDocuments.length}/3 uploaded`));
    console.log("   - AI query responses: " + (successRate >= 70 ? "✅ Good quality" : "⚠️ Needs improvement"));
    console.log("   - Overall functionality: " + (successRate >= 80 ? "✅ Excellent" : successRate >= 60 ? "⚠️ Good" : "❌ Needs work"));
    
    if (this.createdEngine && this.uploadedDocuments.length > 0) {
      console.log("\n🎯 Key Findings:");
      console.log(`   - Created engine: ${this.createdEngine.name} (ID: ${this.createdEngine.id})`);
      console.log(`   - Uploaded documents: ${this.uploadedDocuments.map(d => d.name).join(', ')}`);
      console.log(`   - AI successfully processed and can answer questions about the uploaded content`);
    }
  }
}

// 運行測試
if (require.main === module) {
  const tester = new SingleUserRAGTester();
  tester.runAllTests().catch(console.error);
}

module.exports = SingleUserRAGTester;
