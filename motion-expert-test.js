const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

class MotionExpertTest {
  constructor() {
    this.baseURL = 'http://localhost:3000';
    this.testResults = {
      passed: 0,
      failed: 0,
      tests: []
    };
    this.userToken = null;
    this.testUser = null;
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

  // 1. 基礎系統測試
  async testBasicSystem() {
    console.log('\n🏥 基礎系統測試...');
    console.log('==========================================');

    try {
      // 主頁
      const homeResponse = await axios.get(`${this.baseURL}/`);
      this.logTest('Home Page', homeResponse.status === 200, `主頁正常 (${homeResponse.status})`);
      
      // 健康檢查
      const healthResponse = await axios.get(`${this.baseURL}/api/health`);
      this.logTest('Health Check', healthResponse.status === 200, `健康檢查正常 (${healthResponse.status})`);
      
      // 狀態檢查
      const statusResponse = await axios.get(`${this.baseURL}/api/status`);
      this.logTest('Status Check', statusResponse.status === 200, `狀態檢查正常 (${statusResponse.status})`);

    } catch (error) {
      this.logTest('Basic System', false, `基礎系統檢查失敗: ${error.response?.status || error.message}`);
    }
  }

  // 2. RAG 系統測試
  async testRAGSystem() {
    console.log('\n📚 RAG 系統測試...');
    console.log('==========================================');

    try {
      // RAG 測試端點
      const ragTestResponse = await axios.get(`${this.baseURL}/api/rag/test`);
      this.logTest('RAG Test Endpoint', ragTestResponse.data.success, `RAG 測試端點正常: v${ragTestResponse.data.version}`);
      
      // RAG 引擎概覽
      const overviewResponse = await axios.get(`${this.baseURL}/api/rag/engines/overview`);
      
      if (overviewResponse.data.success) {
        this.logTest('RAG Overview', true, `RAG 系統正常，總引擎數: ${overviewResponse.data.totalEngines}`);
        console.log(`   📊 統計信息:`);
        console.log(`      - 總引擎數: ${overviewResponse.data.stats.totalCount}`);
        console.log(`      - 用戶引擎: ${overviewResponse.data.stats.userCount}`);
        console.log(`      - 活躍引擎: ${overviewResponse.data.stats.activeEngines}`);
      } else {
        this.logTest('RAG Overview', false, 'RAG 系統回應異常');
      }
    } catch (error) {
      this.logTest('RAG System', false, `RAG 系統檢查失敗: ${error.response?.status || error.message}`);
    }
  }

  // 3. 用戶認證測試
  async testUserAuthentication() {
    console.log('\n🔐 用戶認證測試...');
    console.log('==========================================');

    this.testUser = {
      username: `testuser_final_${Date.now()}`,
      email: `finaltest${Date.now()}@example.com`,
      password: 'TestPassword123!',
      confirmPassword: 'TestPassword123!'
    };

    try {
      // 註冊測試
      const registerResponse = await axios.post(`${this.baseURL}/api/auth/register`, this.testUser);
      
      if (registerResponse.data.success && registerResponse.data.token) {
        this.logTest('User Registration', true, '用戶註冊成功');
        this.userToken = registerResponse.data.token;
        
        // Token 驗證測試
        try {
          const verifyResponse = await axios.get(`${this.baseURL}/api/auth/verify`, {
            headers: {
              'Authorization': `Bearer ${this.userToken}`
            }
          });
          this.logTest('Token Verification', verifyResponse.data.success, 'Token 驗證成功');
        } catch (error) {
          this.logTest('Token Verification', false, `Token 驗證失敗: ${error.response?.status || error.message}`);
        }

        // 登入測試
        try {
          const loginResponse = await axios.post(`${this.baseURL}/api/auth/login`, {
            username: this.testUser.username,
            password: this.testUser.password
          });
          
          if (loginResponse.data.success) {
            this.logTest('User Login', true, '用戶登入成功');
          } else {
            this.logTest('User Login', false, '用戶登入失敗');
          }
        } catch (loginError) {
          this.logTest('User Login', false, `登入錯誤: ${loginError.response?.status || loginError.message}`);
        }

      } else {
        this.logTest('User Registration', false, '用戶註冊失敗');
      }
    } catch (error) {
      this.logTest('User Authentication', false, `認證測試失敗: ${error.response?.status || error.message}`);
    }
  }

  // 4. 用戶 RAG 功能測試
  async testUserRAGFunctionality() {
    console.log('\n📖 用戶 RAG 功能測試...');
    console.log('==========================================');

    if (!this.userToken) {
      this.logTest('User RAG', false, '沒有有效的用戶 token，跳過 RAG 測試');
      return;
    }

    try {
      // 檢查用戶 RAG 狀態
      const statusResponse = await axios.get(`${this.baseURL}/api/rag/users/status`, {
        headers: {
          'Authorization': `Bearer ${this.userToken}`
        }
      });
      
      this.logTest('User RAG Status', statusResponse.data.success, `用戶 RAG 狀態查詢成功`);
      console.log(`   📊 RAG 狀態: ${statusResponse.data.message}`);

      // 測試文檔上傳
      const testContent = `
# MotionExpert 測試文檔

這是一個用於測試 MotionExpert RAG 系統的文檔。

## 功能特點
- **多文件支援**: 一個用戶一個 Engine，可以上傳多個文件
- **智能查詢**: 基於 Vertex AI 的檢索增強生成
- **用戶隔離**: 每個用戶的資料完全隔離

## 技術架構
- **前端**: 現代化 Web 界面
- **後端**: Node.js + Express
- **AI**: Google Vertex AI
- **存儲**: Google Cloud Storage

這個系統能夠提供專業的 AI 輔助內容生成和知識檢索服務。
      `;

      fs.writeFileSync('motionexpert-test.txt', testContent);

      const formData = new FormData();
      formData.append('file', fs.createReadStream('motionexpert-test.txt'));

      const uploadResponse = await axios.post(`${this.baseURL}/api/rag/users/upload`, formData, {
        headers: {
          ...formData.getHeaders(),
          'Authorization': `Bearer ${this.userToken}`
        }
      });

      if (uploadResponse.data.success) {
        this.logTest('Document Upload', true, '文檔上傳成功');
        console.log(`   📄 上傳結果: ${uploadResponse.data.message}`);
        
        // 等待處理
        console.log('   ⏳ 等待文檔處理（15秒）...');
        await new Promise(resolve => setTimeout(resolve, 15000));

        // 測試查詢
        const queryResponse = await axios.post(`${this.baseURL}/api/rag/users/query`, {
          question: 'MotionExpert 系統有什麼功能特點？'
        }, {
          headers: {
            'Authorization': `Bearer ${this.userToken}`
          }
        });

        if (queryResponse.data.success) {
          this.logTest('Document Query', true, 'RAG 查詢成功');
          console.log(`   💬 查詢回應: ${queryResponse.data.answer.substring(0, 200)}...`);
        } else {
          this.logTest('Document Query', false, 'RAG 查詢失敗');
        }

        // 測試文檔列表
        const documentsResponse = await axios.get(`${this.baseURL}/api/rag/users/documents`, {
          headers: {
            'Authorization': `Bearer ${this.userToken}`
          }
        });

        if (documentsResponse.data.success) {
          this.logTest('Document List', true, `文檔列表獲取成功，共 ${documentsResponse.data.totalDocuments} 個文檔`);
        } else {
          this.logTest('Document List', false, '文檔列表獲取失敗');
        }

      } else {
        this.logTest('Document Upload', false, '文檔上傳失敗');
      }

      // 清理測試文件
      try {
        fs.unlinkSync('motionexpert-test.txt');
      } catch (e) {
        // 忽略清理錯誤
      }

    } catch (error) {
      this.logTest('User RAG Functionality', false, `用戶 RAG 功能測試失敗: ${error.response?.status || error.message}`);
      
      // 清理測試文件
      try {
        fs.unlinkSync('motionexpert-test.txt');
      } catch (e) {
        // 忽略清理錯誤
      }
    }
  }

  // 5. Vertex AI 功能測試
  async testVertexAI() {
    console.log('\n🤖 Vertex AI 功能測試...');
    console.log('==========================================');

    try {
      // 測試基礎生成
      const generateResponse = await axios.post(`${this.baseURL}/api/generate`, {
        prompt: '請用一句話介紹 MotionExpert 系統'
      });
      
      if (generateResponse.data.success) {
        this.logTest('Basic Generation', true, 'Vertex AI 基礎生成成功');
        console.log(`   💬 生成結果: ${generateResponse.data.text.substring(0, 100)}...`);
      } else {
        this.logTest('Basic Generation', false, 'Vertex AI 基礎生成失敗');
      }

      // 測試劇本生成
      const synopsisResponse = await axios.post(`${this.baseURL}/api/synopsis`, {
        synopsisString: '一個關於 AI 助手幫助電影製作團隊創作劇本的科技故事'
      });
      
      if (synopsisResponse.data.success) {
        this.logTest('Synopsis Generation', true, '劇本生成成功');
        console.log(`   🎬 劇本長度: ${synopsisResponse.data.aiProcessedOutput.length} 字符`);
      } else {
        this.logTest('Synopsis Generation', false, '劇本生成失敗');
      }

    } catch (error) {
      this.logTest('Vertex AI', false, `Vertex AI 測試失敗: ${error.response?.status || error.message}`);
    }
  }

  // 6. 執行完整測試
  async runCompleteTest() {
    console.log('🚀 MotionExpert Backend 完整測試開始...');
    console.log(`🕐 測試開始時間: ${new Date().toISOString()}\n`);
    console.log('================================================');

    await this.testBasicSystem();
    await this.testRAGSystem();
    await this.testUserAuthentication();
    await this.testUserRAGFunctionality();
    await this.testVertexAI();

    // 測試結果摘要
    console.log('\n📊 測試結果摘要:');
    console.log('================================================');
    console.log(`測試完成時間: ${new Date().toISOString()}`);
    console.log(`總測試數: ${this.testResults.tests.length}`);
    console.log(`通過: ${this.testResults.passed}`);
    console.log(`失敗: ${this.testResults.failed}`);
    console.log(`成功率: ${((this.testResults.passed / this.testResults.tests.length) * 100).toFixed(1)}%`);

    // 系統狀態評估
    const successRate = this.testResults.passed / this.testResults.tests.length;
    let systemStatus = '';
    if (successRate >= 0.9) {
      systemStatus = '🎉 優秀 - 系統運行完美';
    } else if (successRate >= 0.8) {
      systemStatus = '✅ 良好 - 系統基本正常';
    } else if (successRate >= 0.7) {
      systemStatus = '⚠️ 一般 - 需要關注';
    } else {
      systemStatus = '❌ 不佳 - 需要修復';
    }
    
    console.log(`系統狀態: ${systemStatus}`);

    if (this.testResults.failed > 0) {
      console.log('\n❌ 失敗的測試:');
      this.testResults.tests
        .filter(test => test.status === 'FAIL')
        .forEach((test, index) => {
          console.log(`   ${index + 1}. ${test.test}: ${test.message}`);
        });
    }

    console.log('\n🎯 MotionExpert 系統功能狀態:');
    console.log('================================================');
    console.log('✅ 核心功能:');
    console.log('  - 基礎 API 系統');
    console.log('  - RAG 引擎管理');
    console.log('  - 用戶認證系統');
    console.log('  - Vertex AI 生成');
    console.log('  - 一用戶一 Engine 多文件上傳');
    console.log('  - 智能文檔查詢');
    
    console.log('\n📝 使用說明:');
    console.log('  1. 重新啟動伺服器使所有功能生效');
    console.log('  2. 運行測試: node motion-expert-test.js');
    console.log('  3. 檢查 RAG: node check-engines.js');
    
    console.log('\n✨ 測試完成！');
    return this.testResults;
  }
}

// 執行測試
if (require.main === module) {
  const tester = new MotionExpertTest();
  tester.runCompleteTest().catch(error => {
    console.error('❌ 測試執行失敗:', error.message);
    process.exit(1);
  });
}

module.exports = { MotionExpertTest };
