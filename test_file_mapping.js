const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');

// 檢查並加載環境變數
try {
  require('dotenv').config();
} catch (error) {
  console.warn('⚠️ dotenv 模組未安裝，使用默認配置');
}

// 生成有效的測試 token
function generateTestToken() {
  const JWT_SECRET = process.env.JWT_SECRET || 'fheisbwfiwghbtjdkwajedfegrjefujhub41354trhj';
  
  const payload = {
    userId: 'test-user-123',
    username: 'testuser',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24小時後過期
  };

  return jwt.sign(payload, JWT_SECRET);
}

// 從環境變數讀取配置
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000/api/rag';
const TEST_TOKEN = process.env.TEST_JWT_TOKEN || generateTestToken();

class FileMappingTester {
  constructor() {
    this.baseUrl = BASE_URL;
    this.token = TEST_TOKEN;
    this.testResults = [];
    
    console.log(`🔧 配置信息:`);
    console.log(`   Base URL: ${this.baseUrl}`);
    console.log(`   Token 前8位: ${this.token.substring(0, 8)}...`);
    
    // 驗證 token
    this.verifyToken();
  }

  // 驗證 JWT token
  verifyToken() {
    try {
      const JWT_SECRET = process.env.JWT_SECRET || 'fheisbwfiwghbtjdkwajedfegrjefujhub41354trhj';
      const decoded = jwt.verify(this.token, JWT_SECRET);
      console.log(`✅ JWT Token 驗證成功:`);
      console.log(`   用戶ID: ${decoded.userId}`);
      console.log(`   用戶名: ${decoded.username}`);
      console.log(`   過期時間: ${new Date(decoded.exp * 1000).toLocaleString()}`);
    } catch (error) {
      console.error(`❌ JWT Token 驗證失敗: ${error.message}`);
      console.log('🔄 生成新的測試 token...');
      this.token = generateTestToken();
      console.log(`✅ 新 token 生成成功: ${this.token.substring(0, 8)}...`);
    }
  }

  // 創建測試文件
  createTestFile(filename, content = '這是一個測試文件的內容\n測試中文文件名功能\nTest content for file mapping') {
    const testDir = path.join(process.cwd(), 'test_files');
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    
    const filePath = path.join(testDir, filename);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`📄 創建測試文件: ${filePath}`);
    return filePath;
  }

  // 測試系統健康狀態
  async testSystemHealth() {
    console.log(`\n🧪 測試系統健康狀態`);
    
    try {
      const response = await axios.get(`${this.baseUrl}/test`, {
        timeout: 10000
      });
      
      if (response.data.success) {
        console.log(`✅ 系統健康狀態良好`);
        console.log(`   版本: ${response.data.version}`);
        console.log(`   功能: ${response.data.features ? response.data.features.length : 0} 項`);
        return true;
      } else {
        throw new Error('System health check failed');
      }
    } catch (error) {
      console.error(`❌ 系統健康檢查失敗: ${error.message}`);
      if (error.code === 'ECONNREFUSED') {
        console.error(`   請確認服務器是否在 ${this.baseUrl} 運行`);
      }
      return false;
    }
  }

  // 測試認證
  async testAuthentication() {
    console.log(`\n🧪 測試認證狀態`);
    
    try {
      const response = await axios.get(`${this.baseUrl}/users/status`, {
        headers: {
          'Authorization': `Bearer ${this.token}`
        },
        timeout: 10000
      });
      
      if (response.data.success) {
        console.log(`✅ 認證測試成功`);
        return true;
      } else {
        throw new Error(response.data.error || 'Authentication failed');
      }
    } catch (error) {
      console.error(`❌ 認證測試失敗: ${error.message}`);
      if (error.response) {
        console.error(`   HTTP 狀態: ${error.response.status}`);
        console.error(`   響應數據:`, JSON.stringify(error.response.data, null, 2));
      }
      return false;
    }
  }

  // 測試上傳文件
  async testFileUpload(filename) {
    console.log(`\n🧪 測試上傳文件: ${filename}`);
    
    try {
      // 創建測試文件
      const filePath = this.createTestFile(filename);
      
      // 檢查文件是否存在
      if (!fs.existsSync(filePath)) {
        throw new Error(`測試文件創建失敗: ${filePath}`);
      }

      // 準備上傳
      const formData = new FormData();
      formData.append('file', fs.createReadStream(filePath));
      
      console.log(`   正在上傳到: ${this.baseUrl}/users/test-user-123/upload`);
      
      const response = await axios.post(
        `${this.baseUrl}/users/test-user-123/upload`,
        formData,
        {
          headers: {
            ...formData.getHeaders(),
            'Authorization': `Bearer ${this.token}`
          },
          timeout: 30000 // 30秒超時
        }
      );

      if (response.data.success) {
        console.log(`✅ 文件上傳成功:`);
        console.log(`   原始文件名: ${response.data.data.fileName}`);
        console.log(`   新文件名: ${response.data.data.newFileName}`);
        console.log(`   生成的文件ID: ${response.data.data.generatedFileId}`);
        console.log(`   RAG Engine ID: ${response.data.data.ragEngine.id}`);
        
        this.testResults.push({
          test: 'upload',
          filename: filename,
          success: true,
          data: response.data.data
        });
        
        // 清理測試文件
        fs.unlinkSync(filePath);
        
        return response.data.data;
      } else {
        throw new Error(response.data.error || 'Upload failed');
      }
    } catch (error) {
      console.error(`❌ 文件上傳失敗: ${error.message}`);
      if (error.response) {
        console.error(`   HTTP 狀態: ${error.response.status}`);
        console.error(`   響應數據:`, JSON.stringify(error.response.data, null, 2));
      }
      this.testResults.push({
        test: 'upload',
        filename: filename,
        success: false,
        error: error.message
      });
      return null;
    }
  }

  // 測試獲取文件名映射
  async testGetFileMapping(engineId) {
    console.log(`\n🧪 測試獲取文件名映射: Engine ${engineId}`);
    
    try {
      const response = await axios.get(
        `${this.baseUrl}/users/engines/${engineId}/file-mapping`,
        {
          headers: {
            'Authorization': `Bearer ${this.token}`
          },
          timeout: 10000
        }
      );

      if (response.data.success) {
        console.log(`✅ 文件名映射獲取成功:`);
        console.log(`   映射數量: ${Object.keys(response.data.mapping).length}`);
        console.log(`   映射內容:`, JSON.stringify(response.data.mapping, null, 2));
        
        this.testResults.push({
          test: 'file-mapping',
          engineId: engineId,
          success: true,
          mapping: response.data.mapping
        });
        
        return response.data.mapping;
      } else {
        throw new Error(response.data.error || 'Failed to get file mapping');
      }
    } catch (error) {
      console.error(`❌ 獲取文件名映射失敗: ${error.message}`);
      if (error.response) {
        console.error(`   HTTP 狀態: ${error.response.status}`);
        console.error(`   響應數據:`, JSON.stringify(error.response.data, null, 2));
      }
      this.testResults.push({
        test: 'file-mapping',
        engineId: engineId,
        success: false,
        error: error.message
      });
      return null;
    }
  }

  // 運行完整測試
  async runFullTest() {
    console.log('🚀 開始文件名映射功能測試');
    console.log('='.repeat(50));
    
    // 0. 系統健康檢查
    console.log('📝 步驟 0: 系統健康檢查');
    const healthOk = await this.testSystemHealth();
    if (!healthOk) {
      console.error('❌ 系統健康檢查失敗，終止測試');
      return;
    }

    // 1. 認證測試
    console.log('\n📝 步驟 1: 認證測試');
    const authOk = await this.testAuthentication();
    if (!authOk) {
      console.error('❌ 認證測試失敗，終止測試');
      console.log('\n💡 請檢查:');
      console.log('   1. JWT_SECRET 環境變數是否正確');
      console.log('   2. Token 是否過期');
      console.log('   3. 用戶是否存在於資料庫中');
      return;
    }

    // 測試文件名列表（包含中文和特殊字符）
    const testFiles = [
      '測試文檔.txt',
      '中文檔案名稱.pdf'
    ];

    let engineId = null;

    // 2. 上傳測試文件
    console.log('\n📝 步驟 2: 上傳測試文件');
    const uploadResults = [];
    for (let i = 0; i < testFiles.length; i++) {
      const filename = testFiles[i];
      console.log(`\n--- 測試 ${i + 1}/${testFiles.length} ---`);
      
      const result = await this.testFileUpload(filename);
      if (result) {
        uploadResults.push(result);
        if (!engineId) {
          engineId = result.ragEngine.id;
        }
      }
      
      // 等待一下避免頻率限制
      if (i < testFiles.length - 1) {
        console.log('   ⏳ 等待 3 秒避免頻率限制...');
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }

    // 3. 測試文件名映射
    if (engineId && uploadResults.length > 0) {
      console.log('\n📝 步驟 3: 測試文件名映射');
      console.log('   ⏳ 等待 5 秒讓資料庫同步...');
      await new Promise(resolve => setTimeout(resolve, 5000));
      await this.testGetFileMapping(engineId);
    } else {
      console.log('\n❌ 跳過文件名映射測試（沒有成功上傳的文件）');
    }

    // 4. 輸出測試結果
    this.printTestSummary();
  }

  // 輸出測試摘要
  printTestSummary() {
    console.log('\n📊 測試結果摘要');
    console.log('='.repeat(50));
    
    const successCount = this.testResults.filter(r => r.success).length;
    const totalCount = this.testResults.length;
    
    console.log(`總測試數: ${totalCount}`);
    console.log(`成功數: ${successCount}`);
    console.log(`失敗數: ${totalCount - successCount}`);
    console.log(`成功率: ${totalCount > 0 ? ((successCount / totalCount) * 100).toFixed(1) : 0}%`);
    
    if (totalCount > 0) {
      console.log('\n詳細結果:');
      this.testResults.forEach((result, index) => {
        const status = result.success ? '✅' : '❌';
        const description = result.filename || result.engineId || 'N/A';
        console.log(`${index + 1}. ${status} ${result.test} - ${description}`);
        if (!result.success && result.error) {
          console.log(`   錯誤: ${result.error}`);
        }
      });

      // 檢查文件名映射是否正確
      const mappingTest = this.testResults.find(r => r.test === 'file-mapping');
      const uploadTests = this.testResults.filter(r => r.test === 'upload' && r.success);
      
      if (mappingTest && mappingTest.success && uploadTests.length > 0) {
        console.log('\n🔍 文件名映射驗證:');
        uploadTests.forEach(upload => {
          const originalName = upload.data.fileName;
          const fileId = upload.data.generatedFileId;
          const mappedName = mappingTest.mapping[fileId];
          
          if (mappedName === originalName) {
            console.log(`✅ ${fileId} -> ${originalName} (正確映射)`);
          } else {
            console.log(`❌ ${fileId} -> 期望: ${originalName}, 實際: ${mappedName || 'undefined'} (映射錯誤)`);
          }
        });
      }
    }

    console.log('\n🎯 測試完成！');
  }

  // 清理測試文件夾
  cleanup() {
    const testDir = path.join(process.cwd(), 'test_files');
    if (fs.existsSync(testDir)) {
      try {
        fs.rmSync(testDir, { recursive: true, force: true });
        console.log('🧹 測試文件已清理');
      } catch (error) {
        console.warn('⚠️ 清理測試文件時發生錯誤:', error.message);
      }
    }
  }
}

// 運行測試
async function main() {
  console.log('🔧 檢查環境...');
  
  // 檢查必要的依賴
  try {
    require('axios');
    require('form-data');
    require('jsonwebtoken');
    console.log('✅ 依賴檢查通過');
  } catch (error) {
    console.error('❌ 缺少必要的依賴，請運行: npm install axios form-data jsonwebtoken');
    process.exit(1);
  }

  const tester = new FileMappingTester();
  
  try {
    await tester.runFullTest();
  } catch (error) {
    console.error('❌ 測試過程中發生未預期的錯誤:', error.message);
    console.error('Stack trace:', error.stack);
  } finally {
    tester.cleanup();
  }
}

// 如果直接運行此文件
if (require.main === module) {
  main().catch(console.error);
}

module.exports = FileMappingTester;