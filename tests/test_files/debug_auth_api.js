const axios = require('axios');

const BASE_URL = 'http://localhost:3000';

async function debugAuthAPI() {
  console.log('🔍 調試認證 API 格式...\n');

  // 測試不同的註冊格式
  const testFormats = [
    {
      name: '基本格式',
      data: { username: 'testuser123', password: 'testpass123' }
    },
    {
      name: '包含 email',
      data: { username: 'testuser123', password: 'testpass123', email: 'testuser123@test.com' }
    },
    {
      name: '包含 confirmPassword',
      data: { username: 'testuser123', password: 'testpass123', confirmPassword: 'testpass123' }
    },
    {
      name: '包含 email 和 confirmPassword',
      data: { 
        username: 'testuser123', 
        password: 'testpass123', 
        confirmPassword: 'testpass123',
        email: 'testuser123@test.com' 
      }
    },
    {
      name: '包含 firstName 和 lastName',
      data: { 
        username: 'testuser123', 
        password: 'testpass123',
        firstName: 'Test',
        lastName: 'User'
      }
    }
  ];

  for (const format of testFormats) {
    try {
      console.log(`🧪 測試 ${format.name}...`);
      console.log('📤 發送數據:', format.data);
      
      const response = await axios.post(`${BASE_URL}/api/auth/register`, format.data);
      console.log('✅ 成功！回應:', response.data);
      
      // 如果成功，嘗試登錄
      console.log('🔑 嘗試登錄...');
      const loginResponse = await axios.post(`${BASE_URL}/api/auth/login`, {
        username: format.data.username,
        password: format.data.password
      });
      console.log('✅ 登錄成功！回應:', loginResponse.data);
      
      console.log('\n🎉 找到正確格式！');
      console.log('📋 註冊格式:', format.data);
      return format.data;
      
    } catch (error) {
      console.log('❌ 失敗:', error.response?.data || error.message);
      console.log('---\n');
    }
  }

  console.log('❌ 所有格式都失敗了！請檢查 routes/auth.js');
}

// 執行調試
debugAuthAPI();