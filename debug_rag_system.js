const axios = require('axios');

const BASE_URL = 'http://localhost:3000';

// 生成隨機用戶名
const generateUsername = () => `testuser_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

async function testSystem() {
    console.log('🔍 開始測試完整的 RAG 系統...\n');
    
    let authToken = null;
    let userId = null;
    let engineId = null;
    
    try {
        // 1. 測試註冊
        console.log('1️⃣ 測試用戶註冊...');
        const username = generateUsername();
        const password = 'testpass123';
        const registerData = {
            username: username,
            password: password,
            confirmPassword: password,
            email: `${username}@test.com`
        };
        
        const registerResponse = await axios.post(`${BASE_URL}/api/auth/register`, registerData);
        console.log('✅ 註冊成功:', {
            status: registerResponse.status,
            message: registerResponse.data.message,
            userId: registerResponse.data.user?.userid
        });
        userId = registerResponse.data.user?.userid;
        
        // 2. 測試登入
        console.log('\n2️⃣ 測試用戶登入...');
        const loginResponse = await axios.post(`${BASE_URL}/api/auth/login`, {
            username: username,
            password: password
        });
        console.log('✅ 登入成功:', {
            status: loginResponse.status,
            message: loginResponse.data.message
        });
        authToken = loginResponse.data.token;
        
        // 3. 測試創建 RAG 引擎
        console.log('\n3️⃣ 測試創建 RAG 引擎...');
        const engineData = {
            engineName: `TestEngine_${Date.now()}`,
            description: 'Test RAG Engine for debugging'
        };
        
        const createEngineResponse = await axios.post(
            `${BASE_URL}/api/rag/users/engines`,
            engineData,
            {
                headers: {
                    'Authorization': `Bearer ${authToken}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        
        console.log('✅ RAG 引擎創建成功:', {
            status: createEngineResponse.status,
            engine: createEngineResponse.data.engine
        });
        
        engineId = createEngineResponse.data.engine.id;
        const ragId = createEngineResponse.data.engine.ragid;
        
        console.log(`🎯 引擎 ID: ${engineId}`);
        console.log(`🎯 RAG Corpus ID: ${ragId}`);
        
        // 4. 驗證 Google Cloud Corpus 是否真的存在
        console.log('\n4️⃣ 驗證 Google Cloud Corpus...');
        if (ragId) {
            try {
                const verifyResponse = await axios.get(
                    `${BASE_URL}/api/rag/debug/corpus/${ragId}`,
                    {
                        headers: {
                            'Authorization': `Bearer ${authToken}`
                        }
                    }
                );
                console.log('✅ Google Cloud Corpus 驗證成功:', verifyResponse.data);
            } catch (verifyError) {
                console.log('❌ Google Cloud Corpus 驗證失敗:', verifyError.response?.data || verifyError.message);
            }
        } else {
            console.log('⚠️  警告: 沒有獲得 RAG Corpus ID');
        }
        
        // 5. 測試引擎列表
        console.log('\n5️⃣ 測試引擎列表...');
        try {
            const listResponse = await axios.get(
                `${BASE_URL}/api/rag/users/${userId}/engines`,
                {
                    headers: {
                        'Authorization': `Bearer ${authToken}`
                    }
                }
            );
            console.log('✅ 引擎列表獲取成功:', {
                status: listResponse.status,
                engines: listResponse.data.engines
            });
        } catch (listError) {
            console.log('❌ 引擎列表獲取失敗:', listError.response?.data || listError.message);
        }
        
        // 6. 測試文件上傳 (如果 ragId 存在)
        let uploadResponse = null;
        if (ragId) {
            console.log('\n6️⃣ 測試文件上傳...');
            try {
                const uploadData = {
                    files: [{
                        name: 'test_document.txt',
                        content: 'This is a test document for RAG system testing. It contains sample text for retrieval augmented generation.'
                    }]
                };
                
                uploadResponse = await axios.post(
                    `${BASE_URL}/api/rag/users/${userId}/engines/${engineId}/import`,
                    uploadData,
                    {
                        headers: {
                            'Authorization': `Bearer ${authToken}`,
                            'Content-Type': 'application/json'
                        }
                    }
                );
                console.log('✅ 文件上傳成功:', uploadResponse.data);
            } catch (uploadError) {
                console.log('❌ 文件上傳失敗:', uploadError.response?.data || uploadError.message);
            }
        }
        
        // 7. 測試 RAG 查詢 (如果 ragId 存在)
        if (ragId) {
            console.log('\n7️⃣ 測試 RAG 查詢（文件剛上傳，可能需要等待索引）...');
            try {
                const queryData = {
                    question: 'What is this document about?'
                };
                
                const queryResponse = await axios.post(
                    `${BASE_URL}/api/rag/users/${userId}/engines/${engineId}/query`,
                    queryData,
                    {
                        headers: {
                            'Authorization': `Bearer ${authToken}`,
                            'Content-Type': 'application/json'
                        }
                    }
                );
                console.log('✅ RAG 查詢成功:', queryResponse.data);

                // 如果沒有找到內容，等待一段時間再試
                if (queryResponse.data.sources && queryResponse.data.sources.length === 0) {
                    console.log('⏰ 文件可能還在索引中，等待 30 秒後再次查詢...');
                    await new Promise(resolve => setTimeout(resolve, 30000));

                    console.log('🔄 重新查詢...');
                    const retryQueryResponse = await axios.post(
                        `${BASE_URL}/api/rag/users/${userId}/engines/${engineId}/query`,
                        queryData,
                        {
                            headers: {
                                'Authorization': `Bearer ${authToken}`,
                                'Content-Type': 'application/json'
                            }
                        }
                    );
                    console.log('🔄 重新查詢結果:', retryQueryResponse.data);
                }
            } catch (queryError) {
                console.log('❌ RAG 查詢失敗:', queryError.response?.data || queryError.message);
            }
        }

        // 8. 測試文件列表
        let allDocsResponse; // 定義在外層作用域
        if (ragId) {
            console.log('\n8️⃣ 測試文件列表...');
            try {
                // 測試特定引擎的文件列表
                const engineDocsResponse = await axios.get(
                    `${BASE_URL}/api/rag/users/${userId}/engines/${engineId}/documents`,
                    {
                        headers: {
                            'Authorization': `Bearer ${authToken}`
                        }
                    }
                );
                console.log('✅ 引擎文件列表獲取成功:', engineDocsResponse.data);

                // 也測試用戶所有文件列表
                allDocsResponse = await axios.get(
                    `${BASE_URL}/api/rag/users/documents`,
                    {
                        headers: {
                            'Authorization': `Bearer ${authToken}`
                        }
                    }
                );
                console.log('✅ 用戶所有文件列表獲取成功:', allDocsResponse.data);
            } catch (listError) {
                console.log('❌ 文件列表獲取失敗:', listError.response?.data || listError.message);
            }
        }

        // 9. 測試文件刪除 (使用從Google Cloud獲取的實際文件 ID)
        if (ragId && engineId) {
            console.log('\n9️⃣ 測試文件刪除...');
            try {
                // 先等待一下確保上傳完成
                console.log('⏰ 等待 5 秒確保文件處理完成...');
                await new Promise(resolve => setTimeout(resolve, 5000));

                // 從用戶所有文件列表中獲取要刪除的文件ID (使用實際的Google Cloud文件ID)
                let fileIdToDelete = null;
                if (typeof allDocsResponse !== 'undefined' && allDocsResponse.data && 
                    allDocsResponse.data.documents && allDocsResponse.data.documents.length > 0) {
                    
                    const fileToDelete = allDocsResponse.data.documents[0];
                    fileIdToDelete = fileToDelete.id; // 使用從Google Cloud獲取的實際文件ID
                    
                    console.log(`🎯 準備刪除文件 ID: ${fileIdToDelete}`);
                    console.log(`🎯 文件名稱: ${fileToDelete.name}`);
                    console.log(`🎯 文件上傳時間: ${fileToDelete.uploadTime}`);

                    const deleteResponse = await axios.delete(
                        `${BASE_URL}/api/rag/users/documents/${fileIdToDelete}?ragId=${engineId}`,
                        {
                            headers: {
                                'Authorization': `Bearer ${authToken}`
                            }
                        }
                    );
                    console.log('✅ 文件刪除成功:', deleteResponse.data);
                    
                    // 驗證文件已被刪除 - 重新獲取文件列表
                    console.log('🔍 驗證文件是否已刪除...');
                    await new Promise(resolve => setTimeout(resolve, 3000));
                    
                    const verifyResponse = await axios.get(
                        `${BASE_URL}/api/rag/users/documents?ragId=${engineId}`,
                        {
                            headers: {
                                'Authorization': `Bearer ${authToken}`
                            }
                        }
                    );
                    
                    if (verifyResponse.data.documents) {
                        const remainingFiles = verifyResponse.data.documents;
                        const stillExists = remainingFiles.some(f => f.id === fileIdToDelete);
                        
                        if (stillExists) {
                            console.log('❌ 驗證失敗: 文件仍然存在於列表中');
                        } else {
                            console.log('✅ 驗證成功: 文件已從列表中移除');
                        }
                        console.log(`📊 剩餘文件數量: ${remainingFiles.length}`);
                    }
                    
                } else {
                    console.log('⚠️ 無法獲取要刪除的文件 ID - 沒有文件列表');
                }
                
            } catch (deleteError) {
                console.log('❌ 文件刪除失敗:', deleteError.response?.data || deleteError.message);
            }
        }
        
        console.log('\n🎉 系統測試完成！');
        
    } catch (error) {
        console.error('❌ 測試過程中發生錯誤:', {
            message: error.message,
            status: error.response?.status,
            data: error.response?.data
        });
    }
}

// 執行測試
testSystem().catch(console.error);
