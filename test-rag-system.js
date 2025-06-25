const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

class RAGSystemTester {
  constructor(baseUrl = 'http://localhost:3000') {
    this.baseUrl = baseUrl;
    this.testUserId = 'test-user-' + Date.now();
    this.testResults = [];
  }

  // 🔍 測試系統狀態
  async testSystemStatus() {
    console.log('🔍 Testing system status...');
    try {
      const response = await axios.get(`${this.baseUrl}/api/rag/test`);
      
      this.logResult('System Status', response.status === 200, {
        status: response.status,
        version: response.data.version,
        features: response.data.features?.length || 0
      });

      return response.data;
    } catch (error) {
      this.logResult('System Status', false, { error: error.message });
      throw error;
    }
  }

  // 📊 測試 RAG Engines 概覽
  async testEnginesOverview() {
    console.log('📊 Testing engines overview...');
    try {
      const response = await axios.get(`${this.baseUrl}/api/rag/engines/overview`);
      
      this.logResult('Engines Overview', response.status === 200, {
        totalEngines: response.data.statistics?.totalEngines,
        userEngines: response.data.statistics?.userEngines,
        systemEngines: response.data.statistics?.systemEngines
      });

      return response.data;
    } catch (error) {
      this.logResult('Engines Overview', false, { error: error.message });
      throw error;
    }
  }

  // 👤 測試用戶狀態檢查
  async testUserStatus() {
    console.log(`👤 Testing user status for ${this.testUserId}...`);
    try {
      const response = await axios.get(`${this.baseUrl}/api/rag/users/${this.testUserId}/status`);
      
      this.logResult('User Status Check', response.status === 200, {
        userId: this.testUserId,
        hasRAGEngine: response.data.hasRAGEngine,
        message: response.data.message
      });

      return response.data;
    } catch (error) {
      this.logResult('User Status Check', false, { error: error.message });
      throw error;
    }
  }

  // 📤 測試用戶文檔上傳
  async testUserDocumentUpload() {
    console.log(`📤 Testing document upload for ${this.testUserId}...`);
    try {
      // 創建測試文件
      const testContent = `
測試文檔 - ${new Date().toISOString()}

這是一個測試文檔，用於驗證 RAG 系統的文檔上傳功能。

內容包括：
1. 測試用戶：${this.testUserId}
2. 測試時間：${new Date().toLocaleString()}
3. 測試目的：驗證多用戶 RAG 系統
4. 功能特色：
   - 自動創建用戶專屬 RAG Engine
   - 文檔隔離和安全性
   - 智能查詢和回答

這個文檔將被用來測試 RAG 查詢功能。
      `;

      const testFileName = `test-document-${Date.now()}.txt`;
      
      // 創建 FormData
      const formData = new FormData();
      formData.append('file', Buffer.from(testContent), {
        filename: testFileName,
        contentType: 'text/plain'
      });

      const response = await axios.post(
        `${this.baseUrl}/api/rag/users/${this.testUserId}/upload`,
        formData,
        {
          headers: {
            ...formData.getHeaders()
          }
        }
      );

      this.logResult('Document Upload', response.status === 200, {
        userId: response.data.data?.userId,
        fileName: response.data.data?.fileName,
        ragEngine: response.data.data?.ragEngine?.displayName,
        operationId: response.data.data?.operationId
      });

      return response.data;
    } catch (error) {
      this.logResult('Document Upload', false, { error: error.message });
      throw error;
    }
  }

  // ⏳ 等待文檔處理完成
  async waitForDocumentProcessing(operationId, maxWaitTime = 300000) {
    console.log(`⏳ Waiting for document processing (Operation: ${operationId})...`);
    
    const startTime = Date.now();
    let attemptCount = 0;
    
    while (Date.now() - startTime < maxWaitTime) {
      attemptCount++;
      try {
        const response = await axios.get(`${this.baseUrl}/api/rag/operation-status/${operationId}`);
        
        console.log(`  Attempt ${attemptCount}: ${response.data.status} - ${response.data.recommendations?.[0] || 'Processing...'}`);
        
        if (response.data.done) {
          this.logResult('Document Processing', !response.data.error, {
            operationId,
            status: response.data.status,
            processingTime: Math.round((Date.now() - startTime) / 1000) + 's',
            attempts: attemptCount
          });
          
          return response.data;
        }
        
        // 逐漸增加等待時間：前 3 次等 5 秒，然後 10 秒，最後 15 秒
        const waitTime = attemptCount <= 3 ? 5000 : attemptCount <= 10 ? 10000 : 15000;
        await this.sleep(waitTime);
        
      } catch (error) {
        console.error(`  Error checking operation status (attempt ${attemptCount}):`, error.message);
        await this.sleep(5000);
      }
    }
    
    throw new Error(`Document processing timeout after ${Math.round(maxWaitTime/1000)} seconds and ${attemptCount} attempts`);
  }

  // 💬 測試用戶 RAG 查詢
  async testUserQuery() {
    console.log(`💬 Testing RAG query for ${this.testUserId}...`);
    try {
      const testQuestions = [
        '我上傳的文檔包含什麼內容？',
        '測試用戶是誰？',
        '這個文檔的測試目的是什麼？',
        'RAG 系統有什麼功能特色？'
      ];

      const results = [];

      for (const question of testQuestions) {
        console.log(`  🤔 Asking: ${question}`);
        
        const response = await axios.post(`${this.baseUrl}/api/rag/users/${this.testUserId}/query`, {
          question: question
        });

        results.push({
          question,
          success: response.status === 200,
          hasAnswer: response.data.answer && response.data.answer.length > 0,
          answerLength: response.data.answer?.length || 0,
          ragEngine: response.data.ragEngine
        });

        console.log(`  ✅ Answer (${response.data.answer?.length || 0} chars): ${response.data.answer?.substring(0, 100) || 'No answer'}...`);
        
        await this.sleep(2000); // 避免請求過快
      }

      const successfulQueries = results.filter(r => r.success && r.hasAnswer).length;
      
      this.logResult('RAG Queries', successfulQueries === testQuestions.length, {
        totalQuestions: testQuestions.length,
        successfulQueries,
        userId: this.testUserId
      });

      return results;
    } catch (error) {
      this.logResult('RAG Queries', false, { error: error.message });
      throw error;
    }
  }

  // 📊 測試用戶狀態更新
  async testUserStatusAfterUpload() {
    console.log(`📊 Testing user status after upload for ${this.testUserId}...`);
    try {
      const response = await axios.get(`${this.baseUrl}/api/rag/users/${this.testUserId}/status`);
      
      const hasEngine = response.data.hasRAGEngine;
      const fileCount = response.data.ragEngine?.fileCount || 0;
      
      this.logResult('User Status After Upload', hasEngine && fileCount > 0, {
        userId: this.testUserId,
        hasRAGEngine: hasEngine,
        fileCount: fileCount,
        engineName: response.data.ragEngine?.displayName
      });

      return response.data;
    } catch (error) {
      this.logResult('User Status After Upload', false, { error: error.message });
      throw error;
    }
  }

  // 📋 測試獲取用戶文檔列表
  async testGetUserDocuments() {
    console.log(`📋 Testing get user documents for ${this.testUserId}...`);
    try {
      const response = await axios.get(`${this.baseUrl}/api/rag/users/${this.testUserId}/documents`);
      
      const documents = response.data.documents || [];
      const hasDocuments = documents.length > 0;
      
      this.logResult('Get User Documents', response.status === 200, {
        userId: this.testUserId,
        totalDocuments: documents.length,
        hasDocuments: hasDocuments,
        firstDocument: documents[0]?.name || 'None'
      });

      return response.data;
    } catch (error) {
      this.logResult('Get User Documents', false, { error: error.message });
      throw error;
    }
  }

  // 📤 測試添加第二個文檔
  async testAddSecondDocument() {
    console.log(`📤 Testing add second document for ${this.testUserId}...`);
    try {
      // 創建第二個測試文件
      const testContent = `
第二個測試文檔 - ${new Date().toISOString()}

這是第二個測試文檔，用於測試多文檔功能。

內容包括：
1. 用戶：${this.testUserId}
2. 文檔編號：2
3. 創建時間：${new Date().toLocaleString()}
4. 額外功能測試：
   - 多文檔管理
   - 文檔添加功能
   - 文檔刪除功能
   - 智能搜索跨文檔內容

這是用來測試文檔管理功能的第二份文檔。
包含不同的關鍵詞：產品規格、技術文檔、API 說明。
      `;

      const testFileName = `second-document-${Date.now()}.txt`;
      
      // 創建 FormData
      const formData = new FormData();
      formData.append('file', Buffer.from(testContent), {
        filename: testFileName,
        contentType: 'text/plain'
      });

      const response = await axios.post(
        `${this.baseUrl}/api/rag/users/${this.testUserId}/upload`,
        formData,
        {
          headers: {
            ...formData.getHeaders()
          }
        }
      );

      this.logResult('Add Second Document', response.status === 200, {
        userId: response.data.data?.userId,
        fileName: response.data.data?.fileName,
        ragEngine: response.data.data?.ragEngine?.displayName,
        operationId: response.data.data?.operationId
      });

      return response.data;
    } catch (error) {
      this.logResult('Add Second Document', false, { error: error.message });
      throw error;
    }
  }

  // 🗑️ 測試刪除文檔
  async testDeleteDocument(documentId) {
    console.log(`🗑️ Testing delete document ${documentId} for ${this.testUserId}...`);
    try {
      const response = await axios.delete(`${this.baseUrl}/api/rag/users/${this.testUserId}/documents/${documentId}`);
      
      this.logResult('Delete Document', response.status === 200, {
        userId: this.testUserId,
        documentId: documentId,
        success: response.data.success
      });

      return response.data;
    } catch (error) {
      this.logResult('Delete Document', false, { 
        error: error.message,
        status: error.response?.status 
      });
      throw error;
    }
  }

  // 💬 測試多文檔查詢
  async testMultiDocumentQuery() {
    console.log(`💬 Testing multi-document query for ${this.testUserId}...`);
    try {
      const testQuestions = [
        '我總共上傳了幾個文檔？',
        '第二個文檔包含什麼內容？',
        '兩個文檔的主要差異是什麼？',
        '關於 API 說明，文檔中提到了什麼？'
      ];

      const results = [];

      for (const question of testQuestions) {
        console.log(`  🤔 Multi-doc asking: ${question}`);
        
        const response = await axios.post(`${this.baseUrl}/api/rag/users/${this.testUserId}/query`, {
          question: question
        });

        results.push({
          question,
          success: response.status === 200,
          hasAnswer: response.data.answer && response.data.answer.length > 0,
          answerLength: response.data.answer?.length || 0,
          ragEngine: response.data.ragEngine
        });

        console.log(`  ✅ Multi-doc answer (${response.data.answer?.length || 0} chars): ${response.data.answer?.substring(0, 80) || 'No answer'}...`);
        
        await this.sleep(2000); // 避免請求過快
      }

      const successfulQueries = results.filter(r => r.success && r.hasAnswer).length;
      
      this.logResult('Multi-Document Queries', successfulQueries === testQuestions.length, {
        totalQuestions: testQuestions.length,
        successfulQueries,
        userId: this.testUserId
      });

      return results;
    } catch (error) {
      this.logResult('Multi-Document Queries', false, { error: error.message });
      throw error;
    }
  }

  // 🧪 執行完整文檔管理測試套件
  async runDocumentManagementTest() {
    console.log('📁 Starting Document Management Test Suite...\n');
    
    try {
      // 1. 獲取當前文檔列表
      const initialDocs = await this.testGetUserDocuments();
      const initialCount = initialDocs.documents?.length || 0;
      console.log(`  📊 Initial document count: ${initialCount}`);
      await this.sleep(2000);
      
      // 2. 添加第二個文檔
      const uploadResult = await this.testAddSecondDocument();
      const operationId = uploadResult.data?.operationId;
      
      if (operationId) {
        // 3. 等待第二個文檔處理完成
        await this.waitForDocumentProcessing(operationId);
        await this.sleep(3000);

        // 4. 再次獲取文檔列表（應該有2個文檔）
        const updatedDocs = await this.testGetUserDocuments();
        const updatedCount = updatedDocs.documents?.length || 0;
        console.log(`  📊 Updated document count: ${updatedCount}`);
        await this.sleep(2000);

        // 5. 測試多文檔查詢
        await this.testMultiDocumentQuery();
        await this.sleep(2000);

        // 6. 測試刪除文檔（刪除第一個文檔）
        if (updatedDocs.documents && updatedDocs.documents.length > 0) {
          const firstDocId = updatedDocs.documents[0].id;
          console.log(`  🗑️ Attempting to delete document: ${firstDocId}`);
          
          try {
            await this.testDeleteDocument(firstDocId);
            await this.sleep(3000);

            // 7. 驗證刪除後的文檔列表
            const finalDocs = await this.testGetUserDocuments();
            const finalCount = finalDocs.documents?.length || 0;
            
            this.logResult('Document Count After Deletion', finalCount === updatedCount - 1, {
              beforeDeletion: updatedCount,
              afterDeletion: finalCount,
              expectedAfterDeletion: updatedCount - 1
            });
            
            console.log(`  📊 Final document count: ${finalCount}`);
            
          } catch (deleteError) {
            console.log(`  ⚠️ Delete test failed (this might be expected): ${deleteError.message}`);
          }
        }
      }

      console.log('\n✅ Document Management Test Suite completed!');
      
    } catch (error) {
      console.error('\n❌ Document Management Test Suite failed:', error.message);
    }
  }

  // 🧪 執行完整測試套件（更新版）
  async runFullTest() {
    console.log('🚀 Starting RAG System Full Test Suite...\n');
    
    try {
      // === 基本功能測試 ===
      await this.testSystemStatus();
      await this.sleep(1000);

      await this.testEnginesOverview();
      await this.sleep(1000);

      await this.testUserStatus();
      await this.sleep(1000);

      // === 第一個文檔上傳測試 ===
      const uploadResult = await this.testUserDocumentUpload();
      const operationId = uploadResult.data?.operationId;
      
      if (operationId) {
        await this.waitForDocumentProcessing(operationId);
        await this.sleep(5000);

        await this.testUserStatusAfterUpload();
        await this.sleep(2000);

        await this.testUserQuery();
        await this.sleep(3000);

        // === 文檔管理功能測試 ===
        console.log('\n🔄 Starting Document Management Tests...');
        await this.runDocumentManagementTest();
      }

      this.printTestSummary();
      
    } catch (error) {
      console.error('\n❌ Test suite failed:', error.message);
      this.printTestSummary();
    }
  }

  // 🛠️ 輔助函數
  logResult(testName, success, details = {}) {
    this.testResults.push({
      testName,
      success,
      details,
      timestamp: new Date().toISOString()
    });

    const status = success ? '✅' : '❌';
    console.log(`${status} ${testName}:`, details);
  }

  printTestSummary() {
    console.log('\n📋 Test Summary:');
    console.log('==========================================');
    
    const passed = this.testResults.filter(r => r.success).length;
    const total = this.testResults.length;
    
    console.log(`Total Tests: ${total}`);
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${total - passed}`);
    console.log(`Success Rate: ${Math.round((passed / total) * 100)}%`);
    
    console.log('\nDetailed Results:');
    this.testResults.forEach(result => {
      const status = result.success ? '✅' : '❌';
      console.log(`${status} ${result.testName}`);
    });
    
    if (passed === total) {
      console.log('\n🎉 All tests passed! Your RAG system is working correctly.');
    } else {
      console.log('\n⚠️  Some tests failed. Please check the logs above.');
    }
    
    console.log('\n✨ Test suite completed!');
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// 執行測試
async function runTests() {
  console.log('🔧 Testing RAG System at: http://localhost:3000');
  
  const tester = new RAGSystemTester();
  console.log(`🧪 Test User ID: ${tester.testUserId}\n`);
  
  await tester.runFullTest();
}

// 如果直接運行此文件，則執行測試
if (require.main === module) {
  runTests().catch(console.error);
}

module.exports = RAGSystemTester;