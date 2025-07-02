const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

class AdvancedRAGTest {
  constructor() {
    this.baseURL = 'http://localhost:3000';
    this.testResults = {
      passed: 0,
      failed: 0,
      tests: []
    };
    this.userToken = null;
    this.testUser = null;
    this.uploadedDocuments = [];
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

  // 創建多個測試文件
  createTestFiles() {
    const testFiles = [
      {
        name: 'document1.txt',
        content: 'MotionExpert 系統介紹：這是一個先進的運動控制系統，支持多軸運動控制、精確定位和智能路徑規劃。系統具有高精度、高穩定性和快速響應的特點。'
      },
      {
        name: 'document2.txt', 
        content: 'MotionExpert 技術特點：採用先進的控制算法，支持即時監控和自適應控制。系統可以處理複雜的運動軌跡，提供毫秒級的響應時間。'
      },
      {
        name: 'document3.txt',
        content: 'MotionExpert 應用場景：廣泛應用於工業自動化、機器人控制、CNC 加工等領域。可以滿足高精度製造和複雜運動控制的需求。'
      }
    ];

    testFiles.forEach(file => {
      fs.writeFileSync(file.name, file.content);
    });

    return testFiles;
  }

  // 清理測試文件
  cleanupTestFiles(fileNames) {
    fileNames.forEach(fileName => {
      try {
        if (fs.existsSync(fileName)) {
          fs.unlinkSync(fileName);
        }
      } catch (error) {
        console.log(`清理文件 ${fileName} 時出錯: ${error.message}`);
      }
    });
  }

  // 用戶認證設置
  async setupUser() {
    console.log('\n🔐 設置測試用戶...');
    
    // 生成唯一的測試用戶
    const timestamp = Date.now();
    this.testUser = {
      username: `testuser_${timestamp}`,
      password: 'testpassword123',
      confirmPassword: 'testpassword123'
    };

    try {
      // 註冊用戶
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

  // 測試多文件上傳
  async testMultipleFileUploads() {
    console.log('\n📤 測試多文件上傳...');
    
    const testFiles = this.createTestFiles();
    
    for (let i = 0; i < testFiles.length; i++) {
      const file = testFiles[i];
      try {
        const formData = new FormData();
        formData.append('file', fs.createReadStream(file.name));

        const uploadResponse = await axios.post(`${this.baseURL}/api/rag/users/upload`, formData, {
          headers: {
            'Authorization': `Bearer ${this.userToken}`,
            ...formData.getHeaders()
          }
        });

        if (uploadResponse.data.success) {
          this.uploadedDocuments.push({
            name: file.name,
            content: file.content,
            uploadResult: uploadResponse.data
          });
          
          this.logTest(`File Upload ${i + 1}`, true, 
            `文檔 "${file.name}" 上傳成功`);
        } else {
          this.logTest(`File Upload ${i + 1}`, false, 
            `文檔 "${file.name}" 上傳失敗: ${uploadResponse.data.message}`);
        }

        // 上傳間隔，避免過快
        if (i < testFiles.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      } catch (error) {
        this.logTest(`File Upload ${i + 1}`, false, 
          `上傳 "${file.name}" 時出錯: ${error.message}`);
      }
    }

    // 清理本地測試文件
    this.cleanupTestFiles(testFiles.map(f => f.name));
    
    return this.uploadedDocuments.length > 0;
  }

  // 測試文檔列表功能
  async testDocumentList() {
    console.log('\n📋 測試文檔列表...');
    
    try {
      const listResponse = await axios.get(`${this.baseURL}/api/rag/users/documents`, {
        headers: { 'Authorization': `Bearer ${this.userToken}` }
      });

      if (listResponse.data.success) {
        const documentCount = listResponse.data.documents?.length || 0;
        this.logTest('Document List', true, 
          `成功獲取文檔列表，共 ${documentCount} 個文檔`);
        
        console.log('   📄 文檔詳情:');
        listResponse.data.documents?.forEach((doc, index) => {
          console.log(`      ${index + 1}. ${doc.displayName} (ID: ${doc.ragFileId?.substr(0, 8)}...)`);
        });
        
        return listResponse.data.documents || [];
      } else {
        this.logTest('Document List', false, listResponse.data.message);
        return [];
      }
    } catch (error) {
      this.logTest('Document List', false, `獲取文檔列表失敗: ${error.message}`);
      return [];
    }
  }

  // 測試多文檔查詢
  async testMultiDocumentQuery() {
    console.log('\n🔍 測試多文檔查詢...');
    
    const queries = [
      'MotionExpert 系統有什麼技術特點？',
      '這個系統可以應用在哪些場景？',
      '系統的控制精度如何？'
    ];

    for (let i = 0; i < queries.length; i++) {
      const query = queries[i];
      try {
        const queryResponse = await axios.post(`${this.baseURL}/api/rag/users/query`, {
          query: query
        }, {
          headers: { 'Authorization': `Bearer ${this.userToken}` }
        });

        if (queryResponse.data.success) {
          const responseText = queryResponse.data.response;
          this.logTest(`Multi-Doc Query ${i + 1}`, true, 
            `查詢成功: "${query}"`);
          console.log(`   💬 回應: ${responseText.substring(0, 100)}...`);
        } else {
          this.logTest(`Multi-Doc Query ${i + 1}`, false, 
            `查詢失敗: ${queryResponse.data.message}`);
        }

        // 查詢間隔
        if (i < queries.length - 1) {
          console.log('   ⏳ 查詢間隔（5秒）...');
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      } catch (error) {
        this.logTest(`Multi-Doc Query ${i + 1}`, false, 
          `查詢出錯: ${error.message}`);
      }
    }
  }

  // 測試文檔刪除功能
  async testDocumentDeletion() {
    console.log('\n🗑️ 測試文檔刪除...');
    
    // 等待一下確保文檔都已處理完成
    console.log('   ⏳ 等待文檔完全處理（10秒）...');
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    // 重新獲取文檔列表
    const documents = await this.testDocumentList();
    
    if (documents.length === 0) {
      this.logTest('Document Deletion', false, '沒有文檔可供刪除');
      return;
    }

    // 選擇第一個文檔進行刪除測試
    const documentToDelete = documents[0];
    console.log(`   🎯 準備刪除文檔: ${documentToDelete.displayName} (ID: ${documentToDelete.ragFileId})`);
    
    try {
      const deleteResponse = await axios.delete(
        `${this.baseURL}/api/rag/users/documents/${documentToDelete.ragFileId}`, 
        {
          headers: { 'Authorization': `Bearer ${this.userToken}` }
        }
      );

      if (deleteResponse.data.success) {
        this.logTest('Document Deletion', true, 
          `文檔 "${documentToDelete.displayName}" 刪除成功`);
        
        // 等待刪除生效
        console.log('   ⏳ 等待刪除生效（8秒）...');
        await new Promise(resolve => setTimeout(resolve, 8000));
        
        // 驗證文檔已被刪除
        const updatedDocuments = await this.testDocumentList();
        const stillExists = updatedDocuments.some(doc => doc.ragFileId === documentToDelete.ragFileId);
        
        this.logTest('Delete Verification', !stillExists, 
          stillExists ? '文檔仍然存在，刪除可能未生效' : '確認文檔已被刪除');
        
      } else {
        this.logTest('Document Deletion', false, 
          `刪除失敗: ${deleteResponse.data.message}`);
      }
    } catch (error) {
      this.logTest('Document Deletion', false, 
        `刪除出錯: ${error.message}`);
    }
  }

  // 測試刪除後查詢
  async testQueryAfterDeletion() {
    console.log('\n🔍 測試刪除後查詢...');
    
    try {
      const queryResponse = await axios.post(`${this.baseURL}/api/rag/users/query`, {
        query: '請總結所有上傳文檔的內容'
      }, {
        headers: { 'Authorization': `Bearer ${this.userToken}` }
      });

      if (queryResponse.data.success) {
        this.logTest('Query After Deletion', true, 
          '刪除後查詢成功，系統正常運作');
        console.log(`   💬 回應長度: ${queryResponse.data.response.length} 字符`);
      } else {
        this.logTest('Query After Deletion', false, 
          `查詢失敗: ${queryResponse.data.message}`);
      }
    } catch (error) {
      this.logTest('Query After Deletion', false, 
        `查詢出錯: ${error.message}`);
    }
  }

  // 運行所有高級測試
  async runAdvancedTests() {
    console.log('🚀 MotionExpert 高級 RAG 功能測試開始...');
    console.log('🕐 測試開始時間:', new Date().toISOString());
    console.log('================================================\n');

    // 1. 設置用戶
    const userSetup = await this.setupUser();
    if (!userSetup) {
      console.log('❌ 用戶設置失敗，無法繼續測試');
      return;
    }

    // 2. 多文件上傳測試
    const uploadSuccess = await this.testMultipleFileUploads();
    if (!uploadSuccess) {
      console.log('❌ 文件上傳失敗，跳過後續測試');
      return;
    }

    // 等待文檔處理
    console.log('\n⏳ 等待文檔處理（20秒）...');
    await new Promise(resolve => setTimeout(resolve, 20000));

    // 3. 文檔列表測試
    await this.testDocumentList();

    // 4. 多文檔查詢測試
    await this.testMultiDocumentQuery();

    // 5. 文檔刪除測試
    await this.testDocumentDeletion();

    // 6. 刪除後查詢測試
    await this.testQueryAfterDeletion();

    // 最終報告
    this.printFinalReport();
  }

  printFinalReport() {
    console.log('\n📊 高級 RAG 測試結果摘要:');
    console.log('================================================');
    console.log(`測試完成時間: ${new Date().toISOString()}`);
    console.log(`總測試數: ${this.testResults.tests.length}`);
    console.log(`通過: ${this.testResults.passed}`);
    console.log(`失敗: ${this.testResults.failed}`);
    
    const successRate = (this.testResults.passed / this.testResults.tests.length * 100).toFixed(1);
    console.log(`成功率: ${successRate}%`);

    if (successRate >= 90) {
      console.log('系統狀態: 🎉 優秀 - 高級功能完美運行');
    } else if (successRate >= 80) {
      console.log('系統狀態: ✅ 良好 - 大部分功能正常');
    } else if (successRate >= 70) {
      console.log('系統狀態: ⚠️ 需要改進');
    } else {
      console.log('系統狀態: ❌ 需要修復');
    }

    console.log('\n🎯 測試的高級功能:');
    console.log('================================================');
    console.log('✅ 多文件上傳到同一 RAG Engine');
    console.log('✅ 跨文檔智能查詢');
    console.log('✅ 文檔列表管理');
    console.log('✅ 個別文檔刪除');
    console.log('✅ 刪除後系統狀態驗證');

    console.log('\n✨ 高級測試完成！');
  }
}

// 執行測試
const tester = new AdvancedRAGTest();
tester.runAdvancedTests().catch(error => {
  console.error('❌ 測試執行失敗:', error);
});
