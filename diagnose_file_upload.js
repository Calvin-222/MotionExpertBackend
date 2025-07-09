/**
 * RAG 文件上傳診斷測試
 * 檢查文件是否被正確上傳和索引
 */

const axios = require('axios');
const FormData = require('form-data');
const BASE_URL = 'http://localhost:3000';

const colors = {
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    reset: '\x1b[0m'
};

const log = (color, message) => console.log(color + message + colors.reset);

async function diagnoseFileUpload() {
    let authToken = null;
    let userId = null;
    let engineId = null;
    
    try {
        // 1. 註冊用戶
        log(colors.cyan, '🔍 開始診斷文件上傳問題...\n');
        
        const username = `diaguser_${Date.now()}`;
        const registerResponse = await axios.post(`${BASE_URL}/api/auth/register`, {
            username: username,
            password: 'testpass123',
            confirmPassword: 'testpass123',
            email: `${username}@test.com`
        });
        
        authToken = registerResponse.data.token;
        userId = registerResponse.data.user.userid;
        log(colors.green, `✅ 用戶註冊成功: ${username}`);
        
        // 2. 創建引擎
        const engineResponse = await axios.post(`${BASE_URL}/api/rag/users/engines`, {
            engineName: `DiagEngine_${Date.now()}`,
            description: 'Diagnostic engine for file upload testing'
        }, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        
        engineId = engineResponse.data.engine.ragid;
        log(colors.green, `✅ 引擎創建成功: ${engineId}`);
        
        // 3. 逐一上傳文件並檢查
        const testFiles = [
            {
                name: 'france_document.txt',
                content: '法國是歐洲的一個國家。法國的首都是巴黎。巴黎有艾菲爾鐵塔。法國以美食和美酒聞名。'
            },
            {
                name: 'nodejs_document.txt',
                content: 'Node.js 是一個 JavaScript 運行時環境。Node.js 基於 Chrome V8 引擎。Node.js 適合構建伺服器端應用程序。'
            },
            {
                name: 'ai_document.txt',
                content: '人工智慧是計算機科學的一個分支。機器學習是人工智慧的重要組成部分。深度學習是機器學習的子集。'
            }
        ];
        
        for (let i = 0; i < testFiles.length; i++) {
            const fileData = testFiles[i];
            log(colors.yellow, `\n📤 上傳文件 ${i + 1}: ${fileData.name}`);
            
            const formData = new FormData();
            formData.append('file', Buffer.from(fileData.content), {
                filename: fileData.name,
                contentType: 'text/plain'
            });
            formData.append('ragId', engineId);
            
            const uploadResponse = await axios.post(
                `${BASE_URL}/api/rag/users/${userId}/upload`,
                formData,
                {
                    headers: {
                        'Authorization': `Bearer ${authToken}`,
                        ...formData.getHeaders()
                    }
                }
            );
            
            if (uploadResponse.data.success) {
                log(colors.green, `✅ 文件上傳成功: ${fileData.name}`);
                log(colors.blue, `   檔案ID: ${uploadResponse.data.fileId}`);
            } else {
                log(colors.red, `❌ 文件上傳失敗: ${uploadResponse.data.error}`);
            }
            
            // 每個文件上傳後等待一下
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
        // 4. 檢查文件列表
        log(colors.yellow, '\n📋 檢查已上傳的文件列表...');
        const documentsResponse = await axios.get(`${BASE_URL}/api/rag/users/documents`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        
        if (documentsResponse.data.success) {
            log(colors.green, `✅ 文件列表獲取成功，共 ${documentsResponse.data.total} 個文件`);
            documentsResponse.data.documents.forEach((doc, index) => {
                log(colors.blue, `   ${index + 1}. ${doc.name || doc.displayName || '未知文件名'}`);
            });
        } else {
            log(colors.red, `❌ 文件列表獲取失敗: ${documentsResponse.data.error}`);
        }
        
        // 5. 等待索引完成
        log(colors.yellow, '\n⏳ 等待 35 秒讓文件索引完成...');
        await new Promise(resolve => setTimeout(resolve, 35000));
        
        // 6. 測試各種查詢
        const testQueries = [
            { question: '法國的首都是什麼？', expectedFile: 'france_document.txt' },
            { question: 'Node.js 是什麼？', expectedFile: 'nodejs_document.txt' },
            { question: '什麼是人工智慧？', expectedFile: 'ai_document.txt' },
            { question: '艾菲爾鐵塔在哪裡？', expectedFile: 'france_document.txt' },
            { question: '什麼是機器學習？', expectedFile: 'ai_document.txt' }
        ];
        
        log(colors.yellow, '\n🔍 開始查詢測試...');
        
        for (const query of testQueries) {
            log(colors.cyan, `\n❓ 查詢: "${query.question}"`);
            
            const queryResponse = await axios.post(
                `${BASE_URL}/api/rag/users/${userId}/engines/${engineId}/query`,
                { question: query.question },
                {
                    headers: {
                        'Authorization': `Bearer ${authToken}`,
                        'Content-Type': 'application/json'
                    }
                }
            );
            
            if (queryResponse.data.success) {
                const answer = queryResponse.data.answer;
                const contexts = queryResponse.data.sources?.contexts || [];
                
                log(colors.green, `✅ 查詢成功`);
                log(colors.blue, `   答案: ${answer.substring(0, 100)}...`);
                log(colors.blue, `   找到 ${contexts.length} 個相關文檔片段`);
                
                // 檢查是否有實際的文檔內容
                if (contexts.length > 0) {
                    const hasRealContent = contexts.some(ctx => 
                        ctx.text && !ctx.text.includes('沒有找到相關信息') && 
                        !answer.includes('沒有關於') && !answer.includes('文檔中沒有')
                    );
                    
                    if (hasRealContent) {
                        log(colors.green, `   ✅ 成功檢索到相關文檔內容`);
                    } else {
                        log(colors.red, `   ❌ 檢索到片段但沒有有效內容`);
                    }
                } else {
                    log(colors.red, `   ❌ 沒有檢索到任何文檔片段`);
                }
                
                // 檢查答案質量
                if (answer.includes('沒有') || answer.includes('無法找到')) {
                    log(colors.yellow, `   ⚠️ 可能的問題: 文件 ${query.expectedFile} 未被正確索引`);
                }
            } else {
                log(colors.red, `❌ 查詢失敗: ${queryResponse.data.error}`);
            }
        }
        
        log(colors.magenta, '\n📊 診斷總結:');
        log(colors.blue, '1. 檢查上述查詢結果');
        log(colors.blue, '2. 如果某些文件的查詢都失敗，可能是該文件沒有被正確上傳或索引');
        log(colors.blue, '3. 如果文件列表顯示的文件數量少於上傳的數量，說明有文件上傳失敗');
        
    } catch (error) {
        log(colors.red, `❌ 診斷過程中發生錯誤: ${error.message}`);
        if (error.response?.data) {
            log(colors.red, `   錯誤詳情: ${JSON.stringify(error.response.data)}`);
        }
    }
}

diagnoseFileUpload().catch(console.error);
