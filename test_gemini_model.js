// 快速測試新的 Gemini 模型
const axios = require('axios');

async function quickTest() {
  try {
    console.log('🔍 快速測試新的 Gemini 模型...');
    
    // 1. 註冊和登入
    const username = `testuser_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const password = 'testpass123';
    
    const registerResponse = await axios.post('http://localhost:3000/api/auth/register', {
      username: username,
      password: password,
      confirmPassword: password
    });
    
    if (!registerResponse.data.success) {
      throw new Error('Registration failed');
    }
    
    console.log('✅ 註冊成功');
    const token = registerResponse.data.token;
    const userId = registerResponse.data.user.userid;
    
    // 2. 創建 RAG 引擎
    const engineData = {
      engineName: `TestEngine_${Date.now()}`,
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
    
    // 3. 使用 JSON 格式上傳文件
    const fileData = [{
      name: 'test_document.txt',
      content: 'This is a test document about France. The capital of France is Paris. Paris is a beautiful city with many famous landmarks like the Eiffel Tower, Louvre Museum, and Notre-Dame Cathedral. France is known for its cuisine, wine, and rich cultural heritage.'
    }];
    
    const uploadResponse = await axios.post(
      `http://localhost:3000/api/rag/users/${userId}/upload`,
      fileData,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        params: {
          ragId: engineId
        }
      }
    );
    
    console.log('✅ 文件上傳成功:', uploadResponse.data);
    
    // 4. 等待文件索引
    console.log('⏳ 等待 30 秒讓文件索引...');
    await new Promise(resolve => setTimeout(resolve, 30000));
    
    // 5. 進行查詢
    const queryResponse = await axios.post(
      `http://localhost:3000/api/rag/users/${userId}/engines/${engineId}/query`,
      {
        question: 'What is the capital of France?'
      },
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('🔍 RAG 查詢結果:');
    console.log('Success:', queryResponse.data.success);
    console.log('Answer:', queryResponse.data.answer);
    console.log('有 contexts 嗎:', queryResponse.data.sources?.contexts ? 'Yes' : 'No');
    
    if (queryResponse.data.sources?.contexts?.length > 0) {
      console.log('✅ 檢索成功，找到', queryResponse.data.sources.contexts.length, '個相關文檔片段');
      console.log('第一個文檔片段:', queryResponse.data.sources.contexts[0].text?.substring(0, 100) + '...');
    }
    
  } catch (error) {
    console.error('❌ 錯誤:', error.response?.data || error.message);
  }
}

quickTest();
