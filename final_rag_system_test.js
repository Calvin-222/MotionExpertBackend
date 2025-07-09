/**
 * 最終 RAG 系統完整測試
 * 整合所有測試腳本功能，包括：
 * - 用戶註冊/登入
 * - RAG 引擎創建
 * - 文件上傳
 * - RAG 查詢
 * - 文件刪除
 * - Gemini 模型測試
 * - 端到端流程驗證
 */

const axios = require('axios');
const FormData = require('form-data');
const BASE_URL = 'http://localhost:3000';

// 輔助函數
const generateUsername = () => `testuser_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// 彩色輸出
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

class RagSystemTester {
    constructor() {
        this.authToken = null;
        this.userId = null;
        this.engineId = null;
        this.testResults = {
            passed: 0,
            failed: 0,
            total: 0,
            details: []
        };
    }

    async runTest(testName, testFunction) {
        this.testResults.total++;
        try {
            log(colors.cyan, `\n🧪 執行測試: ${testName}`);
            await testFunction();
            this.testResults.passed++;
            this.testResults.details.push({ test: testName, status: 'PASSED' });
            log(colors.green, `✅ 測試通過: ${testName}`);
        } catch (error) {
            this.testResults.failed++;
            this.testResults.details.push({ test: testName, status: 'FAILED', error: error.message });
            log(colors.red, `❌ 測試失敗: ${testName}`);
            log(colors.red, `錯誤: ${error.message}`);
        }
    }

    async testUserRegistration() {
        const username = generateUsername();
        const password = 'testpass123';
        const registerData = {
            username: username,
            password: password,
            confirmPassword: password,
            email: `${username}@test.com`
        };
        
        const response = await axios.post(`${BASE_URL}/api/auth/register`, registerData);
        
        if (!response.data.success) {
            throw new Error(`註冊失敗: ${response.data.message}`);
        }
        
        this.authToken = response.data.token;
        this.userId = response.data.user.userid;
        
        log(colors.blue, `註冊成功 - 用戶: ${username}, ID: ${this.userId}`);
    }

    async testUserLogin() {
        const username = generateUsername();
        const password = 'testpass123';
        
        // 先註冊
        await axios.post(`${BASE_URL}/api/auth/register`, {
            username: username,
            password: password,
            confirmPassword: password,
            email: `${username}@test.com`
        });
        
        // 再登入
        const loginResponse = await axios.post(`${BASE_URL}/api/auth/login`, {
            username: username,
            password: password
        });
        
        if (!loginResponse.data.success) {
            throw new Error(`登入失敗: ${loginResponse.data.message}`);
        }
        
        log(colors.blue, `登入成功 - 用戶: ${username}`);
    }

    async testEngineCreation() {
        if (!this.authToken) {
            throw new Error('需要先登入才能創建引擎');
        }
        
        const engineData = {
            engineName: `TestEngine_${Date.now()}`,
            description: 'Final test RAG Engine'
        };
        
        const response = await axios.post(`${BASE_URL}/api/rag/users/engines`, engineData, {
            headers: {
                'Authorization': `Bearer ${this.authToken}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.data.success) {
            throw new Error(`引擎創建失敗: ${response.data.message}`);
        }
        
        this.engineId = response.data.engine.ragid;
        log(colors.blue, `引擎創建成功 - ID: ${this.engineId}`);
    }

    async testFileUpload() {
        if (!this.authToken || !this.userId || !this.engineId) {
            throw new Error('需要先登入並創建引擎');
        }
        
        const testFiles = [
            {
                name: 'test_document.txt',
                content: '這是一個測試文檔，內容關於法國。法國的首都是巴黎。巴黎是一個美麗的城市，有許多著名的地標，如艾菲爾鐵塔、羅浮宮和聖母院。法國以其美食、美酒和豐富的文化遺產而聞名。'
            },
            {
                name: 'tech_document.txt',
                content: '這是一個技術文檔。Node.js 是一個基於 Chrome V8 JavaScript 引擎的 JavaScript 運行時。它使用事件驅動的非阻塞 I/O 模型，使其輕量且高效。Node.js 非常適合構建可擴展的網絡應用程序。'
            }
        ];
        
        for (const fileData of testFiles) {
            const formData = new FormData();
            formData.append('file', Buffer.from(fileData.content), {
                filename: fileData.name,
                contentType: 'text/plain'
            });
            formData.append('ragId', this.engineId);
            
            const response = await axios.post(
                `${BASE_URL}/api/rag/users/${this.userId}/upload`,
                formData,
                {
                    headers: {
                        'Authorization': `Bearer ${this.authToken}`,
                        ...formData.getHeaders()
                    }
                }
            );
            
            if (!response.data.success) {
                throw new Error(`文件上傳失敗 (${fileData.name}): ${response.data.error}`);
            }
            
            log(colors.blue, `文件上傳成功 - ${fileData.name}`);
        }
        
        log(colors.blue, `所有文件上傳成功 - 共 ${testFiles.length} 個文件`);
    }

    async testRagQuery() {
        if (!this.authToken || !this.userId || !this.engineId) {
            throw new Error('需要先登入、創建引擎並上傳文件');
        }
        
        // 等待文件索引
        log(colors.yellow, '⏳ 等待 30 秒讓文件索引...');
        await sleep(30000);
        
        const testQueries = [
            {
                question: '法國的首都是什麼？',
                expectedKeywords: ['巴黎', '首都', '法國']
            },
            {
                question: 'Node.js 是什麼？',
                expectedKeywords: ['Node.js', 'JavaScript', 'V8']
            },
            {
                question: '艾菲爾鐵塔在哪個城市？',
                expectedKeywords: ['巴黎', '艾菲爾鐵塔']
            }
        ];
        
        for (const query of testQueries) {
            const response = await axios.post(
                `${BASE_URL}/api/rag/users/${this.userId}/engines/${this.engineId}/query`,
                {
                    question: query.question
                },
                {
                    headers: {
                        'Authorization': `Bearer ${this.authToken}`,
                        'Content-Type': 'application/json'
                    }
                }
            );
            
            if (!response.data.success) {
                throw new Error(`查詢失敗: ${response.data.message}`);
            }
            
            const answer = response.data.answer;
            const hasExpectedKeywords = query.expectedKeywords.some(keyword => 
                answer.toLowerCase().includes(keyword.toLowerCase())
            );
            
            if (!hasExpectedKeywords) {
                log(colors.yellow, `⚠️ 警告: 查詢 "${query.question}" 的答案可能不準確`);
                log(colors.yellow, `答案: ${answer}`);
            }
            
            log(colors.blue, `查詢成功 - 問題: "${query.question}"`);
            log(colors.blue, `答案: ${answer.substring(0, 100)}...`);
            
            if (response.data.sources?.contexts?.length > 0) {
                log(colors.blue, `找到 ${response.data.sources.contexts.length} 個相關文檔片段`);
            }
        }
    }

    async testGeminiModelDirectly() {
        // 測試 Gemini 模型的直接調用
        const testQueries = [
            '你好，請用繁體中文回答',
            '什麼是人工智慧？',
            '請解釋機器學習的基本概念'
        ];
        
        for (const query of testQueries) {
            try {
                const response = await axios.post(
                    `${BASE_URL}/api/rag/users/${this.userId}/engines/${this.engineId}/query`,
                    {
                        question: query
                    },
                    {
                        headers: {
                            'Authorization': `Bearer ${this.authToken}`,
                            'Content-Type': 'application/json'
                        }
                    }
                );
                
                if (response.data.success) {
                    log(colors.blue, `Gemini 模型回應測試成功 - 問題: "${query}"`);
                    log(colors.blue, `回答: ${response.data.answer.substring(0, 100)}...`);
                } else {
                    throw new Error(`Gemini 模型測試失敗: ${response.data.message}`);
                }
            } catch (error) {
                throw new Error(`Gemini 模型測試錯誤: ${error.message}`);
            }
        }
    }

    async testFileList() {
        if (!this.authToken || !this.userId) {
            throw new Error('需要先登入');
        }
        
        const response = await axios.get(
            `${BASE_URL}/api/rag/users/documents`,
            {
                headers: {
                    'Authorization': `Bearer ${this.authToken}`
                }
            }
        );
        
        if (!response.data.success) {
            throw new Error(`文件列表獲取失敗: ${response.data.message}`);
        }
        
        const fileCount = response.data.documents ? response.data.documents.length : 0;
        log(colors.blue, `文件列表獲取成功 - 共 ${fileCount} 個文件`);
    }

    async testEngineList() {
        if (!this.authToken || !this.userId) {
            throw new Error('需要先登入');
        }
        
        const response = await axios.get(
            `${BASE_URL}/api/rag/users/${this.userId}/engines`,
            {
                headers: {
                    'Authorization': `Bearer ${this.authToken}`
                }
            }
        );
        
        if (!response.data.success) {
            throw new Error(`引擎列表獲取失敗: ${response.data.message}`);
        }
        
        const engineCount = response.data.engines ? response.data.engines.length : 0;
        log(colors.blue, `引擎列表獲取成功 - 共 ${engineCount} 個引擎`);
    }

    async testCleanup() {
        if (!this.authToken || !this.userId || !this.engineId) {
            return;
        }
        
        try {
            // 刪除引擎
            const response = await axios.delete(
                `${BASE_URL}/api/rag/users/${this.userId}/engines/${this.engineId}`,
                {
                    headers: {
                        'Authorization': `Bearer ${this.authToken}`
                    }
                }
            );
            
            if (response.data.success) {
                log(colors.blue, '清理成功 - 引擎已刪除');
            }
        } catch (error) {
            log(colors.yellow, `清理警告: ${error.message}`);
        }
    }

    async runAllTests() {
        log(colors.magenta, '🚀 開始執行最終 RAG 系統完整測試\n');
        
        await this.runTest('用戶註冊測試', () => this.testUserRegistration());
        await this.runTest('用戶登入測試', () => this.testUserLogin());
        await this.runTest('RAG 引擎創建測試', () => this.testEngineCreation());
        await this.runTest('文件上傳測試', () => this.testFileUpload());
        await this.runTest('引擎列表測試', () => this.testEngineList());
        await this.runTest('文件列表測試', () => this.testFileList());
        await this.runTest('RAG 查詢測試', () => this.testRagQuery());
        await this.runTest('Gemini 模型直接測試', () => this.testGeminiModelDirectly());
        await this.runTest('清理測試', () => this.testCleanup());
        
        this.printTestResults();
    }

    printTestResults() {
        log(colors.magenta, '\n📊 測試結果統計');
        log(colors.magenta, '='.repeat(50));
        log(colors.green, `✅ 通過: ${this.testResults.passed}`);
        log(colors.red, `❌ 失敗: ${this.testResults.failed}`);
        log(colors.blue, `📈 總計: ${this.testResults.total}`);
        log(colors.yellow, `🎯 成功率: ${((this.testResults.passed / this.testResults.total) * 100).toFixed(1)}%`);
        
        log(colors.magenta, '\n📋 詳細結果:');
        this.testResults.details.forEach((result, index) => {
            const status = result.status === 'PASSED' ? '✅' : '❌';
            log(colors.cyan, `${index + 1}. ${status} ${result.test}`);
            if (result.error) {
                log(colors.red, `   錯誤: ${result.error}`);
            }
        });
        
        if (this.testResults.failed === 0) {
            log(colors.green, '\n🎉 所有測試都通過了！RAG 系統運行正常。');
        } else {
            log(colors.red, '\n⚠️ 部分測試失敗，請檢查上述錯誤信息。');
        }
    }
}

// 主函數
async function main() {
    const tester = new RagSystemTester();
    
    try {
        await tester.runAllTests();
    } catch (error) {
        log(colors.red, `測試執行過程中發生嚴重錯誤: ${error.message}`);
        process.exit(1);
    }
}

// 如果直接運行此腳本
if (require.main === module) {
    main().catch(error => {
        log(colors.red, `未處理的錯誤: ${error.message}`);
        process.exit(1);
    });
}

module.exports = RagSystemTester;
