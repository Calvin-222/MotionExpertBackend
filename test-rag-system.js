const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

const BASE_URL = 'http://localhost:3000/api/rag';
const TEST_USER_1 = 'test-user-detailed-001';
const TEST_USER_2 = 'test-user-detailed-002';

class RAGSystemTester {
  async runAllTests() {
    console.log('🧪 開始 RAG 系統完整測試...\n');

    try {
      await this.testBasicConnection();
      await this.testUserStatusNew();
      await this.testDocumentUpload();
      await this.testDocumentQuery();
      await this.testMultiUserIsolation();
      await this.testErrorHandling();
      await this.testSystemOverview();
      
      console.log('✅ 所有測試完成！');
    } catch (error) {
      console.error('❌ 測試失敗:', error.message);
    }
  }

  async testBasicConnection() {
    console.log('1. 🔗 測試基礎連接...');
    const response = await axios.get(`${BASE_URL}/test`);
    console.log(`   ✅ 狀態: ${response.status}`);
    console.log(`   📊 版本: ${response.data.version}`);
    console.log('');
  }

  async testUserStatusNew() {
    console.log('2. 👤 測試新用戶狀態...');
    const response = await axios.get(`${BASE_URL}/users/${TEST_USER_1}/status`);
    console.log(`   📊 有 RAG 引擎: ${response.data.hasRAGEngine}`);
    console.log('');
  }

  async testDocumentUpload() {
    console.log('3. 📤 測試文檔上傳...');
    
    // 創建測試文檔
    const testContent = '這是一個詳細的測試文檔。包含人工智能、機器學習、深度學習的相關內容。AI技術正在改變世界。';
    fs.writeFileSync('test-doc.txt', testContent);

    const formData = new FormData();
    formData.append('file', fs.createReadStream('test-doc.txt'));

    const response = await axios.post(
      `${BASE_URL}/users/${TEST_USER_1}/upload`,
      formData,
      { headers: formData.getHeaders() }
    );

    console.log(`   ✅ 上傳成功: ${response.data.success}`);
    console.log(`   🔧 操作ID: ${response.data.data.operationId}`);
    
    // 清理測試文件
    fs.unlinkSync('test-doc.txt');
    console.log('');
  }

  async testDocumentQuery() {
    console.log('4. 💬 測試文檔查詢...');
    
    // 等待文檔處理完成
    console.log('   ⏳ 等待文檔處理（30秒）...');
    await new Promise(resolve => setTimeout(resolve, 30000));

    const response = await axios.post(`${BASE_URL}/users/${TEST_USER_1}/query`, {
      question: '什麼是人工智能？請根據我的文檔回答。'
    });

    console.log(`   ✅ 查詢成功: ${response.data.success}`);
    console.log(`   📝 回答長度: ${response.data.answer?.length || 0} 字符`);
    console.log('');
  }

  async testMultiUserIsolation() {
    console.log('5. 👥 測試多用戶隔離...');
    
    // 為第二個用戶上傳不同內容
    const testContent2 = '這是第二個用戶的專屬文檔。內容關於數據科學、統計分析、數據可視化。';
    fs.writeFileSync('test-doc-2.txt', testContent2);

    const formData = new FormData();
    formData.append('file', fs.createReadStream('test-doc-2.txt'));

    await axios.post(
      `${BASE_URL}/users/${TEST_USER_2}/upload`,
      formData,
      { headers: formData.getHeaders() }
    );

    // 測試隔離性
    const response1 = await axios.post(`${BASE_URL}/users/${TEST_USER_1}/query`, {
      question: '文檔中提到數據科學嗎？'
    });

    const response2 = await axios.post(`${BASE_URL}/users/${TEST_USER_2}/query`, {
      question: '文檔中提到人工智能嗎？'
    });

    console.log(`   👤 用戶1查詢成功: ${response1.data.success}`);
    console.log(`   👤 用戶2查詢成功: ${response2.data.success}`);
    
    fs.unlinkSync('test-doc-2.txt');
    console.log('');
  }

  async testErrorHandling() {
    console.log('6. ⚠️ 測試錯誤處理...');
    
    try {
      await axios.post(`${BASE_URL}/users/non-existent-user/query`, {
        question: '測試問題'
      });
    } catch (error) {
      console.log(`   ✅ 正確處理不存在用戶: ${error.response?.status}`);
    }

    try {
      await axios.post(`${BASE_URL}/users/${TEST_USER_1}/query`, {});
    } catch (error) {
      console.log(`   ✅ 正確處理空查詢: ${error.response?.status}`);
    }
    console.log('');
  }

  async testSystemOverview() {
    console.log('7. 📊 測試系統概覽...');
    const response = await axios.get(`${BASE_URL}/engines/overview`);
    
    console.log(`   📈 總引擎數: ${response.data.statistics.totalEngines}`);
    console.log(`   👥 用戶引擎數: ${response.data.statistics.userEngines}`);
    console.log(`   🏢 系統引擎數: ${response.data.statistics.systemEngines}`);
    console.log('');
  }
}

// 執行測試
const tester = new RAGSystemTester();
tester.runAllTests();