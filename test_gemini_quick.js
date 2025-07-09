// 簡單的 Gemini 模型測試
const axios = require('axios');

async function testGeminiModel() {
  try {
    console.log('🔍 測試 Gemini 模型...');
    
    // 使用現有的用戶和引擎
    const username = 'coretest_1751441676890';
    const password = 'testpass123';
    
    // 1. 登入
    const loginResponse = await axios.post('http://localhost:3000/api/auth/login', {
      username: username,
      password: password
    });
    
    if (!loginResponse.data.success) {
      throw new Error('Login failed');
    }
    
    console.log('✅ 登入成功');
    const token = loginResponse.data.token;
    const userId = loginResponse.data.user.userid;
    
    // 2. 創建新的 RAG 引擎
    const engineData = {
      engineName: `GeminiTest_${Date.now()}`,
      description: 'Test RAG Engine for Gemini model testing'
    };
    
    const createEngineResponse = await axios.post('http://localhost:3000/api/rag/users/engines', engineData, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!createEngineResponse.data.success) {
      throw new Error('Engine creation failed');
    }
    
    console.log('✅ 引擎創建成功');
    const engineId = createEngineResponse.data.engine.ragid;
    
    // 3. 上傳測試文件
    const FormData = require('form-data');
    const form = new FormData();
    form.append('file', Buffer.from('This is a test document about machine learning. Machine learning is a subset of artificial intelligence that uses statistical techniques to give computers the ability to learn from data without being explicitly programmed.'), 'test_ml_document.txt');
    form.append('ragId', engineId);
    
    const uploadResponse = await axios.post(`http://localhost:3000/api/rag/users/${userId}/upload`, form, {
      headers: {
        ...form.getHeaders(),
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (!uploadResponse.data.success) {
      throw new Error('File upload failed');
    }
    
    console.log('✅ 文件上傳成功');
    
    // 4. 等待文件處理
    console.log('⏳ 等待文件處理...');
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    // 5. 測試查詢
    const queryResponse = await axios.post(`http://localhost:3000/api/rag/users/${userId}/engines/${engineId}/query`, {
      question: 'What is machine learning?'
    }, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('🎯 查詢結果:', queryResponse.data);
    
    if (queryResponse.data.success) {
      console.log('✅ 查詢成功!');
      console.log('📝 答案:', queryResponse.data.answer);
    } else {
      console.log('❌ 查詢失敗:', queryResponse.data.error);
    }
    
  } catch (error) {
    console.error('❌ 測試失敗:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
  }
}

testGeminiModel();
