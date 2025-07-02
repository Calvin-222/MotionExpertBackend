const axios = require('axios');
const FormData = require('form-data');

const BASE_URL = 'http://localhost:3000';

// 全面的多 Engine 系統測試
class MultiEngineSystemTest {
  constructor() {
    this.testResults = [];
    this.authToken = null;
    this.userId = null;
    this.createdEngines = [];
  }

  log(type, test, message, details = null) {
    const result = { type, test, message, details, timestamp: new Date().toISOString() };
    this.testResults.push(result);
    
    const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
    console.log(`${icon} ${test}: ${message}`);
    if (details && typeof details === 'object') {
      console.log(`   詳情: ${JSON.stringify(details, null, 2)}`);
    } else if (details) {
      console.log(`   詳情: ${details}`);
    }
  }

  async makeRequest(method, endpoint, data = null, headers = {}) {
    try {
      const config = {
        method,
        url: `${BASE_URL}${endpoint}`,
        headers: {
          'Content-Type': 'application/json',
          ...headers
        }
      };
      
      if (data) {
        config.data = data;
      }
      
      const response = await axios(config);
      return { success: true, data: response.data, status: response.status };
    } catch (error) {
      return { 
        success: false, 
        error: error.response?.data?.message || error.message,
        status: error.response?.status,
        details: error.response?.data
      };
    }
  }

  async runFullTest() {
    console.log('🚀 MotionExpert 多 Engine 系統完整測試');
    console.log('================================================');
    console.log(`開始時間: ${new Date().toISOString()}\n`);

    // 1. 用戶註冊和認證
    await this.testUserAuthentication();

    // 2. 初始狀態檢查
    await this.testInitialState();

    // 3. Engine 管理功能
    await this.testEngineManagement();

    // 4. 文件上傳功能
    await this.testFileUpload();

    // 5. 查詢功能
    await this.testQueryFunctionality();

    // 6. Engine 列表和管理
    await this.testEngineListAndManagement();

    // 7. 清理和總結
    await this.cleanup();
    this.generateReport();
  }

  async testUserAuthentication() {
    console.log('\n🔐 測試用戶認證系統...');
    
    const testUser = {
      username: `multitest${Date.now()}`,
      password: 'password123',
      confirmPassword: 'password123'
    };

    const result = await this.makeRequest('POST', '/api/auth/register', testUser);
    
    if (result.success) {
      this.authToken = result.data.token;
      this.userId = result.data.user.userid;
      this.log('success', '用戶註冊', `用戶 ${this.userId} 註冊成功`);
    } else {
      this.log('error', '用戶註冊', '註冊失敗', result.error);
      throw new Error('用戶註冊失敗，無法繼續測試');
    }
  }

  async testInitialState() {
    console.log('\n📋 檢查用戶初始狀態...');
    
    const result = await this.makeRequest('GET', '/api/rag/users/engines', null, {
      'Authorization': `Bearer ${this.authToken}`
    });

    if (result.success) {
      const engineCount = result.data.totalEngines;
      this.log('success', '初始 Engine 檢查', `用戶初始有 ${engineCount} 個 Engine`);
      
      if (engineCount === 0) {
        this.log('info', '初始狀態', '符合預期：新用戶沒有 Engine');
      }
    } else {
      this.log('error', '初始 Engine 檢查', '獲取初始狀態失敗', result.error);
    }
  }

  async testEngineManagement() {
    console.log('\n🏗️ 測試 Engine 管理功能...');
    
    const engines = [
      { name: '技術文檔庫', description: '存儲技術相關文檔' },
      { name: '業務資料庫', description: '存儲業務相關資料' }
    ];

    for (let i = 0; i < engines.length; i++) {
      const engine = engines[i];
      
      const result = await this.makeRequest('POST', '/api/rag/users/engines', {
        engineName: engine.name,
        description: engine.description
      }, {
        'Authorization': `Bearer ${this.authToken}`
      });

      if (result.success) {
        this.createdEngines.push({
          id: result.data.engine.id,
          name: engine.name,
          displayName: result.data.engine.displayName
        });
        this.log('success', `創建 Engine ${i + 1}`, `Engine "${engine.name}" 創建成功`, {
          id: result.data.engine.id,
          displayName: result.data.engine.displayName
        });
      } else {
        this.log('error', `創建 Engine ${i + 1}`, `創建 "${engine.name}" 失敗`, result.error);
      }

      // 避免 API 速率限制
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }

  async testFileUpload() {
    console.log('\n📤 測試文件上傳功能...');
    
    if (this.createdEngines.length === 0) {
      this.log('error', '文件上傳', '沒有可用的 Engine 進行測試');
      return;
    }

    // 等待 Engine 創建完成
    console.log('⏳ 等待 Engine 創建完成（30秒）...');
    await new Promise(resolve => setTimeout(resolve, 30000));

    const testContent = `這是測試文檔 - ${Date.now()}\n這是一個多 Engine 系統的測試文件。\n創建時間: ${new Date().toISOString()}`;
    
    for (let i = 0; i < Math.min(this.createdEngines.length, 2); i++) {
      const engine = this.createdEngines[i];
      
      try {
        const formData = new FormData();
        formData.append('file', Buffer.from(testContent), `test-doc-${i + 1}.txt`);
        formData.append('engineName', engine.name);

        const response = await axios.post(`${BASE_URL}/api/rag/users/upload`, formData, {
          headers: {
            'Authorization': `Bearer ${this.authToken}`,
            ...formData.getHeaders()
          }
        });

        this.log('success', `上傳到 ${engine.name}`, '文件上傳成功');
      } catch (error) {
        this.log('error', `上傳到 ${engine.name}`, '文件上傳失敗', error.response?.data?.message || error.message);
      }
    }
  }

  async testQueryFunctionality() {
    console.log('\n🔍 測試查詢功能...');
    
    if (this.createdEngines.length === 0) {
      this.log('error', '查詢功能', '沒有可用的 Engine 進行測試');
      return;
    }

    const testQuery = '這個文檔包含什麼內容？';
    
    for (const engine of this.createdEngines) {
      const result = await this.makeRequest('POST', '/api/rag/users/query', {
        query: testQuery,
        engineName: engine.name
      }, {
        'Authorization': `Bearer ${this.authToken}`
      });

      if (result.success) {
        this.log('success', `查詢 ${engine.name}`, '查詢執行成功');
      } else {
        this.log('error', `查詢 ${engine.name}`, '查詢失敗', result.error);
      }
    }
  }

  async testEngineListAndManagement() {
    console.log('\n📊 測試 Engine 列表和管理...');
    
    // 檢查 Engine 列表
    const result = await this.makeRequest('GET', '/api/rag/users/engines', null, {
      'Authorization': `Bearer ${this.authToken}`
    });

    if (result.success) {
      const engines = result.data.engines || [];
      this.log('success', 'Engine 列表', `獲取到 ${engines.length} 個 Engine`, engines);
      
      // 檢查文檔列表
      for (const engine of engines) {
        const docsResult = await this.makeRequest('GET', `/api/rag/users/documents?engineName=${engine.name}`, null, {
          'Authorization': `Bearer ${this.authToken}`
        });

        if (docsResult.success) {
          const docCount = docsResult.data.documents?.length || 0;
          this.log('success', `${engine.name} 文檔`, `${engine.name} 有 ${docCount} 個文檔`);
        } else {
          this.log('error', `${engine.name} 文檔`, '獲取文檔列表失敗', docsResult.error);
        }
      }
    } else {
      this.log('error', 'Engine 列表', '獲取 Engine 列表失敗', result.error);
    }
  }

  async cleanup() {
    console.log('\n🧹 清理測試數據...');
    // 注意：由於 RAG Engine 刪除可能需要特殊權限，這裡只是記錄
    this.log('info', '清理', `測試創建了 ${this.createdEngines.length} 個 Engine，需要手動清理`);
  }

  generateReport() {
    console.log('\n📊 測試報告');
    console.log('================================================');
    
    const total = this.testResults.length;
    const success = this.testResults.filter(r => r.type === 'success').length;
    const errors = this.testResults.filter(r => r.type === 'error').length;
    const info = this.testResults.filter(r => r.type === 'info').length;

    console.log(`總測試項目: ${total}`);
    console.log(`成功: ${success}`);
    console.log(`失敗: ${errors}`);
    console.log(`信息: ${info}`);
    console.log(`成功率: ${((success / (total - info)) * 100).toFixed(1)}%`);

    const status = errors === 0 ? '✅ 完全成功' : 
                   success > errors ? '⚠️ 基本成功' : '❌ 需要修復';
    console.log(`系統狀態: ${status}`);

    console.log('\n📋 詳細結果:');
    this.testResults.forEach((result, index) => {
      const icon = result.type === 'success' ? '✅' : result.type === 'error' ? '❌' : 'ℹ️';
      console.log(`${index + 1}. ${icon} ${result.test}: ${result.message}`);
    });

    console.log(`\n🎯 創建的 Engine: ${this.createdEngines.length} 個`);
    this.createdEngines.forEach((engine, index) => {
      console.log(`   ${index + 1}. ${engine.name} (${engine.id})`);
    });

    console.log(`\n✨ 測試完成時間: ${new Date().toISOString()}`);
  }
}

// 運行測試
const tester = new MultiEngineSystemTest();
tester.runFullTest().catch(console.error);
