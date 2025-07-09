const axios = require('axios');

const BASE_URL = 'http://localhost:3000';

async function testSpecificDeletion() {
    try {
        console.log('🧪 測試特定文件刪除功能...\n');
        
        // 1. 註冊和登入
        const testUsername = `testuser_${Date.now()}`;
        const registerResponse = await axios.post(`${BASE_URL}/api/auth/register`, {
            username: testUsername,
            password: 'testpass123',
            email: `test_${Date.now()}@example.com`
        });
        
        console.log('註冊響應:', registerResponse.data);
        const userId = registerResponse.data.userId;
        console.log(`✅ 用戶註冊成功: ${userId}`);
        
        const loginResponse = await axios.post(`${BASE_URL}/api/auth/login`, {
            username: testUsername,
            password: 'testpass123'
        });
        
        console.log('登入響應:', loginResponse.data);
        const authToken = loginResponse.data.token;
        console.log(`✅ 登入成功, Token: ${authToken ? '已獲取' : '未獲取'}`);
        
        // 2. 創建 RAG 引擎
        const engineResponse = await axios.post(`${BASE_URL}/api/rag/users/engines`, {
            engineName: `DeleteTestEngine_${Date.now()}`,
            description: 'Engine for testing deletion'
        }, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        
        const ragId = engineResponse.data.engine.ragid;
        console.log(`✅ RAG 引擎創建成功: ${ragId}`);
        
        // 3. 上傳文件
        const uploadResponse = await axios.post(`${BASE_URL}/api/rag/users/${userId}/engines/${ragId}/import`, {
            files: [{
                name: 'delete_test.txt',
                content: 'This is a test document that will be deleted. It contains deletion test content.'
            }]
        }, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        
        const uploadedFile = uploadResponse.data.importedFiles[0];
        const actualFileId = uploadedFile.actualFileId;
        console.log(`✅ 文件上傳成功`);
        console.log(`📝 生成的文件ID: ${uploadedFile.generatedFileId}`);
        console.log(`📝 實際文件ID: ${actualFileId}`);
        
        // 4. 驗證文件存在
        console.log('\n🔍 驗證文件存在...');
        const beforeListResponse = await axios.get(`${BASE_URL}/api/rag/users/documents`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        
        const filesBefore = beforeListResponse.data.documents || [];
        console.log(`📊 刪除前文件數量: ${filesBefore.length}`);
        const targetFile = filesBefore.find(f => f.id === actualFileId);
        
        if (targetFile) {
            console.log(`✅ 目標文件確認存在: ${targetFile.id}`);
        } else {
            console.log(`❌ 找不到目標文件: ${actualFileId}`);
            return;
        }
        
        // 5. 等待一段時間確保文件完全處理完成
        console.log('\n⏰ 等待 10 秒確保文件完全處理...');
        await new Promise(resolve => setTimeout(resolve, 10000));
        
        // 6. 執行刪除
        console.log(`\n🗑️ 刪除文件: ${actualFileId}`);
        const deleteResponse = await axios.delete(
            `${BASE_URL}/api/rag/users/documents/${actualFileId}?ragId=${ragId}`,
            {
                headers: { 'Authorization': `Bearer ${authToken}` }
            }
        );
        
        console.log(`✅ 刪除回應:`, deleteResponse.data);
        
        // 7. 驗證刪除結果
        console.log('\n🔍 驗證刪除結果...');
        await new Promise(resolve => setTimeout(resolve, 5000)); // 等待5秒
        
        const afterListResponse = await axios.get(`${BASE_URL}/api/rag/users/documents`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        
        const filesAfter = afterListResponse.data.documents || [];
        console.log(`📊 刪除後文件數量: ${filesAfter.length}`);
        
        const stillExists = filesAfter.some(f => f.id === actualFileId);
        if (stillExists) {
            console.log(`❌ 文件仍然存在! 刪除失敗`);
        } else {
            console.log(`✅ 文件已成功刪除! 🎉`);
        }
        
        // 8. 嘗試查詢已刪除的文件
        console.log('\n🔍 測試查詢已刪除的文件...');
        try {
            const queryResponse = await axios.post(`${BASE_URL}/api/rag/users/${userId}/engines/${ragId}/query`, {
                question: 'What does the deletion test document say?'
            }, {
                headers: { 'Authorization': `Bearer ${authToken}` }
            });
            
            console.log(`🔍 查詢回應:`, queryResponse.data.answer);
            if (queryResponse.data.sources && queryResponse.data.sources.contexts && queryResponse.data.sources.contexts.length > 0) {
                console.log(`⚠️ 警告: 查詢仍然返回了來源，文件可能未完全從索引中移除`);
            } else {
                console.log(`✅ 查詢未返回相關來源，確認文件已從索引中移除`);
            }
        } catch (queryError) {
            console.log(`🔍 查詢錯誤 (可能是正常的):`, queryError.response?.data || queryError.message);
        }
        
        console.log('\n🎉 文件刪除測試完成!');
        
    } catch (error) {
        console.error('❌ 測試失敗:', {
            message: error.message,
            status: error.response?.status,
            data: error.response?.data
        });
    }
}

// 執行測試
testSpecificDeletion().catch(console.error);
