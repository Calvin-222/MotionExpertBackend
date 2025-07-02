const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

class MultiEngineRAGTest {
  constructor() {
    this.baseURL = 'http://localhost:3000';
    this.testResults = {
      passed: 0,
      failed: 0,
      tests: []
    };
    this.userToken = null;
    this.testUser = null;
    this.createdEngines = [];
  }

  logTest(testName, passed, message, details = null) {
    const result = {
      test: testName,
      status: passed ? 'PASS' : 'FAIL',
      message: message,
      details: details,
      timestamp: new Date().toISOString()
    };
    this.testResults.tests.push(result);
    
    if (passed) {
      this.testResults.passed++;
      console.log(`✅ ${testName}: ${message}`);
    } else {
      this.testResults.failed++;
      console.log(`❌ ${testName}: ${message}`);
      if (details) {
        console.log(`   📄 詳細: ${JSON.stringify(details, null, 2)}`);
      }
    }
  }

  // 設置測試用戶
  async setupUser() {
    console.log('\n🔐 設置測試用戶...');
    
    const timestamp = Date.now();
    this.testUser = {
      username: `multiengineuser_${timestamp}`,
      password: 'testpassword123',
      confirmPassword: 'testpassword123'
    };

    try {
      const registerResponse = await axios.post(`${this.baseURL}/api/auth/register`, this.testUser);
      this.logTest('User Registration', registerResponse.data.success, 
        registerResponse.data.success ? '用戶註冊成功' : registerResponse.data.message);
      
      if (registerResponse.data.success) {
        this.userToken = registerResponse.data.token;
        return true;
      }
      return false;
    } catch (error) {
      this.logTest('User Registration', false, `註冊失敗: ${error.message}`);
      return false;
    }
  }

  // 測試創建多個 Engine
  async testCreateMultipleEngines() {
    console.log('\n🏗️ 測試創建多個 RAG Engine...');
    
    const engines = [
      { name: '技術文檔', description: '存儲技術相關文檔' },
      { name: '商業計劃', description: '存儲商業計劃和策略文檔' },
      { name: '研究資料', description: '存儲研究和分析資料' }
    ];

    for (let i = 0; i < engines.length; i++) {
      const engine = engines[i];
      try {
        const createResponse = await axios.post(`${this.baseURL}/api/rag/users/engines`, engine, {
          headers: { 'Authorization': `Bearer ${this.userToken}` }
        });

        if (createResponse.data.success) {
          this.createdEngines.push({
            ...engine,
            id: createResponse.data.engine.id,
            displayName: createResponse.data.engine.displayName
          });
          
          this.logTest(`Create Engine ${i + 1}`, true, 
            `Engine "${engine.name}" 創建成功`);
        } else {
          this.logTest(`Create Engine ${i + 1}`, false, 
            `Engine "${engine.name}" 創建失敗: ${createResponse.data.message}`);
        }

        // 創建間隔
        if (i < engines.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      } catch (error) {
        this.logTest(`Create Engine ${i + 1}`, false, 
          `創建 "${engine.name}" 時出錯: ${error.message}`);
      }
    }

    return this.createdEngines.length > 0;
  }

  // 測試列出所有 Engine
  async testListEngines() {
    console.log('\n📋 測試列出用戶所有 Engine...');
    
    try {
      const listResponse = await axios.get(`${this.baseURL}/api/rag/users/engines`, {
        headers: { 'Authorization': `Bearer ${this.userToken}` }
      });

      if (listResponse.data.success) {
        const engineCount = listResponse.data.engines?.length || 0;
        this.logTest('List Engines', true, 
          `成功獲取 Engine 列表，共 ${engineCount} 個 Engine`);
        
        console.log('   🏗️ Engine 詳情:');
        listResponse.data.engines?.forEach((engine, index) => {
          console.log(`      ${index + 1}. ${engine.name} (${engine.status}) - ${engine.fileCount} 個文檔`);
        });
        
        return listResponse.data.engines || [];
      } else {
        this.logTest('List Engines', false, listResponse.data.message);
        return [];
      }
    } catch (error) {
      this.logTest('List Engines', false, `獲取 Engine 列表失敗: ${error.message}`);
      return [];
    }
  }

  // 創建測試文件
  createTestFiles() {
    const testFiles = [
      {
        name: 'tech-doc.txt',
        content: '技術文檔：這是關於 MotionExpert 系統的技術規格。系統採用模組化設計，支持多種運動控制協議。',
        targetEngine: '技術文檔'
      },
      {
        name: 'business-plan.txt',
        content: '商業計劃：MotionExpert 產品的市場定位是高端工業自動化市場。目標客戶是大型製造企業。',
        targetEngine: '商業計劃'
      },
      {
        name: 'research-data.txt',
        content: '研究資料：根據市場調研，工業4.0趨勢推動了對智能運動控制系統的需求增長。',
        targetEngine: '研究資料'
      }
    ];

    testFiles.forEach(file => {
      fs.writeFileSync(file.name, file.content);
    });

    return testFiles;
  }

  // 測試上傳文件到不同 Engine
  async testUploadToSpecificEngines() {
    console.log('\n📤 測試上傳文件到指定 Engine...');
    
    const testFiles = this.createTestFiles();
    
    for (let i = 0; i < testFiles.length; i++) {
      const file = testFiles[i];
      const targetEngine = this.createdEngines.find(e => e.name === file.targetEngine);
      
      if (!targetEngine) {
        this.logTest(`Upload to ${file.targetEngine}`, false, 
          `找不到目標 Engine: ${file.targetEngine}`);
        continue;
      }

      try {
        const formData = new FormData();
        formData.append('file', fs.createReadStream(file.name));
        formData.append('engineName', targetEngine.name);

        const uploadResponse = await axios.post(`${this.baseURL}/api/rag/users/upload`, formData, {
          headers: {
            'Authorization': `Bearer ${this.userToken}`,
            ...formData.getHeaders()
          }
        });

        if (uploadResponse.data.success) {
          this.logTest(`Upload to ${file.targetEngine}`, true, 
            `文檔 "${file.name}" 成功上傳到 "${file.targetEngine}"`);
        } else {
          this.logTest(`Upload to ${file.targetEngine}`, false, 
            `上傳失敗: ${uploadResponse.data.message}`);
        }

        // 上傳間隔
        if (i < testFiles.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      } catch (error) {
        this.logTest(`Upload to ${file.targetEngine}`, false, 
          `上傳 "${file.name}" 時出錯: ${error.message}`);
      }
    }

    // 清理本地測試文件
    testFiles.forEach(file => {
      try {
        if (fs.existsSync(file.name)) {
          fs.unlinkSync(file.name);
        }
      } catch (error) {
        console.log(`清理文件 ${file.name} 時出錯: ${error.message}`);
      }
    });
  }

  // 測試查詢特定 Engine
  async testQuerySpecificEngines() {
    console.log('\n🔍 測試查詢特定 Engine...');
    
    // 等待文檔處理
    console.log('   ⏳ 等待文檔處理（20秒）...');
    await new Promise(resolve => setTimeout(resolve, 20000));

    const queries = [
      { question: 'MotionExpert 的技術規格是什麼？', engineName: '技術文檔' },
      { question: 'MotionExpert 的目標客戶是誰？', engineName: '商業計劃' },
      { question: '工業4.0對運動控制系統有什麼影響？', engineName: '研究資料' }
    ];

    for (let i = 0; i < queries.length; i++) {
      const { question, engineName } = queries[i];
      
      try {
        const queryResponse = await axios.post(`${this.baseURL}/api/rag/users/query`, {
          query: question,
          engineName: engineName
        }, {
          headers: { 'Authorization': `Bearer ${this.userToken}` }
        });

        if (queryResponse.data.success) {
          this.logTest(`Query ${engineName}`, true, 
            `成功查詢 "${engineName}": "${question}"`);
          console.log(`   💬 回應: ${queryResponse.data.response.substring(0, 100)}...`);
          console.log(`   🎯 來源: ${queryResponse.data.engine.name}`);
        } else {
          this.logTest(`Query ${engineName}`, false, 
            `查詢失敗: ${queryResponse.data.message}`);
        }

        // 查詢間隔
        if (i < queries.length - 1) {
          console.log('   ⏳ 查詢間隔（5秒）...');
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      } catch (error) {
        this.logTest(`Query ${engineName}`, false, 
          `查詢出錯: ${error.message}`);
      }
    }
  }

  // 測試獲取不同 Engine 的文檔列表
  async testDocumentsByEngine() {
    console.log('\n📄 測試獲取不同 Engine 的文檔...');
    
    for (let i = 0; i < this.createdEngines.length; i++) {
      const engine = this.createdEngines[i];
      
      try {
        const docsResponse = await axios.get(`${this.baseURL}/api/rag/users/documents?engineName=${engine.name}`, {
          headers: { 'Authorization': `Bearer ${this.userToken}` }
        });

        if (docsResponse.data.success) {
          const docCount = docsResponse.data.documents?.length || 0;
          this.logTest(`Documents in ${engine.name}`, true, 
            `"${engine.name}" 有 ${docCount} 個文檔`);
          
          if (docCount > 0) {
            console.log(`   📄 "${engine.name}" 文檔:`);
            docsResponse.data.documents?.forEach((doc, index) => {
              console.log(`      ${index + 1}. ${doc.displayName}`);
            });
          }
        } else {
          this.logTest(`Documents in ${engine.name}`, false, 
            `獲取文檔列表失敗: ${docsResponse.data.message}`);
        }

        if (i < this.createdEngines.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch (error) {
        this.logTest(`Documents in ${engine.name}`, false, 
          `獲取文檔出錯: ${error.message}`);
      }
    }
  }

  // 運行所有多 Engine 測試
  async runMultiEngineTests() {
    console.log('🚀 MotionExpert 多 Engine RAG 系統測試開始...');
    console.log('🕐 測試開始時間:', new Date().toISOString());
    console.log('================================================\n');

    // 1. 設置用戶
    const userSetup = await this.setupUser();
    if (!userSetup) {
      console.log('❌ 用戶設置失敗，無法繼續測試');
      return;
    }

    // 2. 創建多個 Engine
    const createSuccess = await this.testCreateMultipleEngines();
    if (!createSuccess) {
      console.log('❌ Engine 創建失敗，跳過後續測試');
      return;
    }

    // 3. 列出所有 Engine
    await this.testListEngines();

    // 4. 上傳文件到不同 Engine
    await this.testUploadToSpecificEngines();

    // 5. 查詢特定 Engine
    await this.testQuerySpecificEngines();

    // 6. 獲取不同 Engine 的文檔
    await this.testDocumentsByEngine();

    // 最終報告
    this.printFinalReport();
  }

  printFinalReport() {
    console.log('\n📊 多 Engine RAG 測試結果摘要:');
    console.log('================================================');
    console.log(`測試完成時間: ${new Date().toISOString()}`);
    console.log(`總測試數: ${this.testResults.tests.length}`);
    console.log(`通過: ${this.testResults.passed}`);
    console.log(`失敗: ${this.testResults.failed}`);
    
    const successRate = (this.testResults.passed / this.testResults.tests.length * 100).toFixed(1);
    console.log(`成功率: ${successRate}%`);

    if (successRate >= 90) {
      console.log('系統狀態: 🎉 優秀 - 多 Engine 功能完美運行');
    } else if (successRate >= 80) {
      console.log('系統狀態: ✅ 良好 - 大部分功能正常');
    } else if (successRate >= 70) {
      console.log('系統狀態: ⚠️ 需要改進');
    } else {
      console.log('系統狀態: ❌ 需要修復');
    }

    console.log('\n🎯 測試的多 Engine 功能:');
    console.log('================================================');
    console.log('✅ 創建多個自定義 RAG Engine');
    console.log('✅ 列出用戶所有 Engine');
    console.log('✅ 上傳文件到指定 Engine');
    console.log('✅ 查詢特定 Engine 的內容');
    console.log('✅ 分別管理不同 Engine 的文檔');

    console.log(`\n📈 創建的 Engine: ${this.createdEngines.length} 個`);
    this.createdEngines.forEach((engine, index) => {
      console.log(`   ${index + 1}. ${engine.name} - ${engine.description}`);
    });

    console.log('\n✨ 多 Engine 測試完成！');
  }
}

// 執行測試
const tester = new MultiEngineRAGTest();
tester.runMultiEngineTests().catch(error => {
  console.error('❌ 測試執行失敗:', error);
});
