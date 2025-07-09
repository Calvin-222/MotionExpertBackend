// 診斷 RAG 查詢問題
const axios = require('axios');

async function testRAGQuery() {
  try {
    console.log('🔍 開始診斷 RAG 查詢問題...');
    
    // 1. 先註冊和登入
    const registerResponse = await axios.post('http://localhost:3000/api/auth/register', {
      username: 'testuser_' + Date.now(),
      email: 'test@example.com',
      password: 'testpass123'
    });
    
    const userId = registerResponse.data.userId;
    console.log('✅ 註冊成功，用戶 ID:', userId);
    
    const loginResponse = await axios.post('http://localhost:3000/api/auth/login', {
      username: registerResponse.data.username || 'testuser_' + Date.now(),
      password: 'testpass123'
    });
    
    const token = loginResponse.data.token;
    console.log('✅ 登入成功，獲得 token');
    
    // 2. 創建 RAG 引擎
    const engineResponse = await axios.post('http://localhost:3000/api/rag/users/engines', {
      engineName: 'TestEngine_' + Date.now(),
      description: 'Test engine for debugging'
    }, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    const engineId = engineResponse.data.engine.ragid;
    console.log('✅ 創建引擎成功，引擎 ID:', engineId);
    
    // 3. 上傳測試文檔
    const testContent = 'The capital of France is Paris. Paris is a beautiful city with many famous landmarks like the Eiffel Tower.';
    
    const uploadResponse = await axios.post(
      `http://localhost:3000/api/rag/users/${userId}/upload`,
      JSON.stringify([{
        name: 'test_document.txt',
        content: testContent
      }]),
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('✅ 文檔上傳成功:', uploadResponse.data);
    
    // 4. 等待文檔索引
    console.log('⏳ 等待 30 秒讓文檔索引...');
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
    
    console.log('🔍 查詢結果:');
    console.log('Success:', queryResponse.data.success);
    console.log('Answer:', queryResponse.data.answer);
    console.log('Sources:', JSON.stringify(queryResponse.data.sources, null, 2));
    
    // 6. 檢查是否有 contexts
    if (queryResponse.data.sources && queryResponse.data.sources.contexts) {
      console.log('✅ 找到 contexts:', queryResponse.data.sources.contexts.length);
      queryResponse.data.sources.contexts.forEach((ctx, index) => {
        console.log(`Context ${index + 1}:`, ctx.text?.substring(0, 100) || 'No text');
      });
    } else {
      console.log('❌ 沒有找到 contexts');
    }
    
  } catch (error) {
    console.error('❌ 測試失敗:', error.response?.data || error.message);
  }
}

testRAGQuery();
