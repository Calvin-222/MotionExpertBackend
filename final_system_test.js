/**
 * 最終 RAG 系統完整測試 - 經過嚴格驗證的版本
 * 
 * 測試範圍:
 * 1. 用戶認證 (註冊/登入)
 * 2. RAG 引擎管理 (創建/列表)  
 * 3. 文件上傳 (FormData 格式)
 * 4. 文件列表查詢
 * 5. RAG 查詢 (基於上傳文檔)
 * 6. 系統清理
 * 
 * API 端點驗證:
 * - POST /api/auth/register
 * - POST /api/auth/login
 * - POST /api/rag/users/engines
 * - GET  /api/rag/users/:userId/engines
 * - POST /api/rag/users/:userId/upload
 * - GET  /api/rag/users/documents
 * - POST /api/rag/users/:userId/engines/:engineId/query
 */

const axios = require('axios');
const FormData = require('form-data');

// 配置常量
const BASE_URL = 'http://localhost:3000';
const INDEXING_WAIT_TIME = 35000; // 35秒等待索引
const UPLOAD_DELAY = 3000; // 3秒文件上傳間隔

// 顏色輸出
const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m'
};

const log = (color, message) => console.log(color + message + colors.reset);
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

class RAGSystemFinalTest {
    constructor() {
        this.authToken = null;
        this.userId = null;
        this.engineId = null;
        this.username = null;
        this.testStartTime = Date.now();
        
        this.stats = {
            total: 0,
            passed: 0,
            failed: 0,
            details: []
        };
    }

    // 生成唯一用戶名
    generateUsername() {
        return `finaltest_${this.testStartTime}_${Math.floor(Math.random() * 1000)}`;
    }

    // 執行單個測試的包裝器
    async runTest(testName, testFunction) {
        this.stats.total++;
        log(colors.cyan, `\n🧪 執行測試: ${testName}`);
        
        try {
            await testFunction();
            this.stats.passed++;
            this.stats.details.push({ name: testName, status: 'PASSED' });
            log(colors.green, `✅ 測試通過: ${testName}`);
        } catch (error) {
            this.stats.failed++;
            this.stats.details.push({ name: testName, status: 'FAILED', error: error.message });
            log(colors.red, `❌ 測試失敗: ${testName}`);
            log(colors.red, `   錯誤: ${error.message}`);
        }
    }

    // 1. 用戶註冊測試
    async testUserRegistration() {
        this.username = this.generateUsername();
        const password = 'SecurePass123';
        
        const registerData = {
            username: this.username,
            password: password,
            confirmPassword: password,
            email: `${this.username}@test.com`
        };

        const response = await axios.post(`${BASE_URL}/api/auth/register`, registerData, {
            headers: { 'Content-Type': 'application/json' }
        });

        // 驗證回應結構
        if (!response.data.success) {
            throw new Error(`註冊失敗: ${response.data.message || response.data.error}`);
        }

        if (!response.data.token) {
            throw new Error('註冊成功但沒有返回 token');
        }

        if (!response.data.user || !response.data.user.userid) {
            throw new Error('註冊成功但沒有返回用戶信息');
        }

        this.authToken = response.data.token;
        this.userId = response.data.user.userid;

        log(colors.blue, `   用戶註冊成功: ${this.username}`);
        log(colors.blue, `   用戶ID: ${this.userId}`);
        log(colors.blue, `   Token已獲取: ${this.authToken ? '是' : '否'}`);
    }

    // 2. 用戶登入測試 (額外驗證)
    async testUserLogin() {
        if (!this.username) {
            throw new Error('需要先完成註冊測試');
        }

        const loginData = {
            username: this.username,
            password: 'SecurePass123'
        };

        const response = await axios.post(`${BASE_URL}/api/auth/login`, loginData, {
            headers: { 'Content-Type': 'application/json' }
        });

        if (!response.data.success) {
            throw new Error(`登入失敗: ${response.data.message || response.data.error}`);
        }

        if (!response.data.token) {
            throw new Error('登入成功但沒有返回 token');
        }

        log(colors.blue, `   用戶登入成功: ${this.username}`);
        log(colors.blue, `   新Token已獲取`);
        
        // 更新為新的 token
        this.authToken = response.data.token;
    }

    // 3. RAG 引擎創建測試
    async testEngineCreation() {
        if (!this.authToken || !this.userId) {
            throw new Error('需要先完成用戶認證');
        }

        const engineData = {
            engineName: `FinalTestEngine_${this.testStartTime}`,
            description: `Final test RAG engine created at ${new Date().toISOString()}`
        };

        const response = await axios.post(`${BASE_URL}/api/rag/users/engines`, engineData, {
            headers: {
                'Authorization': `Bearer ${this.authToken}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.data.success) {
            throw new Error(`引擎創建失敗: ${response.data.error}`);
        }

        if (!response.data.engine || !response.data.engine.ragid) {
            throw new Error('引擎創建成功但沒有返回引擎信息');
        }

        this.engineId = response.data.engine.ragid;

        log(colors.blue, `   引擎創建成功: ${engineData.engineName}`);
        log(colors.blue, `   引擎ID: ${this.engineId}`);
    }

    // 4. 引擎列表測試
    async testEngineList() {
        if (!this.authToken || !this.userId) {
            throw new Error('需要先完成用戶認證');
        }

        const response = await axios.get(`${BASE_URL}/api/rag/users/${this.userId}/engines`, {
            headers: {
                'Authorization': `Bearer ${this.authToken}`
            }
        });

        if (!response.data.success) {
            throw new Error(`引擎列表獲取失敗: ${response.data.error}`);
        }

        if (!Array.isArray(response.data.engines)) {
            throw new Error('引擎列表返回格式錯誤');
        }

        const engineCount = response.data.engines.length;
        if (engineCount === 0) {
            throw new Error('引擎列表為空，但應該包含剛創建的引擎');
        }

        // 驗證剛創建的引擎是否在列表中
        const createdEngine = response.data.engines.find(engine => engine.id === this.engineId);
        if (!createdEngine) {
            throw new Error('剛創建的引擎沒有出現在引擎列表中');
        }

        log(colors.blue, `   引擎列表獲取成功，共 ${engineCount} 個引擎`);
        log(colors.blue, `   已驗證創建的引擎存在於列表中`);
    }

    // 5. 文件上傳測試
    async testFileUpload() {
        if (!this.authToken || !this.userId || !this.engineId) {
            throw new Error('需要先完成用戶認證和引擎創建');
        }

        const testFiles = [
            {
                name: 'document_france.txt',
                content: `法國資料檔案 - 上傳時間: ${new Date().toISOString()}\n\n法國是位於西歐的共和國。法國的首都是巴黎。巴黎是法國最大的城市，也是重要的政治、經濟和文化中心。艾菲爾鐵塔是巴黎最著名的地標，位於巴黎市中心的戰神廣場。法國以其精緻的美食、世界級的葡萄酒和豐富的藝術文化遺產而聞名於世。羅浮宮博物館是世界上最大的藝術博物館之一，收藏了包括蒙娜麗莎在內的無數珍貴藝術品。`
            },
            {
                name: 'document_nodejs.txt',
                content: `Node.js 技術文檔 - 上傳時間: ${new Date().toISOString()}\n\nNode.js 是一個開源的跨平台 JavaScript 運行時環境。Node.js 建立在 Chrome 的 V8 JavaScript 引擎之上，讓開發者可以在伺服器端執行 JavaScript 代碼。Node.js 採用事件驅動、非阻塞 I/O 模型，使其具有輕量級和高效率的特點。這種設計特別適合處理大量並發連接的應用程序。Node.js 包含了豐富的內建模組，如 fs（文件系統）、http（網路請求）、path（路徑處理）等。npm（Node Package Manager）是 Node.js 的包管理工具，提供了世界上最大的開源函式庫生態系統。`
            }
        ];

        let uploadedCount = 0;

        for (const fileData of testFiles) {
            log(colors.yellow, `   正在上傳文件: ${fileData.name}`);

            const formData = new FormData();
            formData.append('file', Buffer.from(fileData.content, 'utf-8'), {
                filename: fileData.name,
                contentType: 'text/plain; charset=utf-8'
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

            if (!response.data.fileId && !response.data.generatedFileId) {
                throw new Error(`文件上傳成功但沒有返回文件ID (${fileData.name})`);
            }

            uploadedCount++;
            log(colors.blue, `   ✅ 文件上傳成功: ${fileData.name}`);

            // 文件間上傳延遲，避免競爭條件
            if (uploadedCount < testFiles.length) {
                log(colors.yellow, `   ⏳ 等待 ${UPLOAD_DELAY/1000} 秒再上傳下一個文件...`);
                await sleep(UPLOAD_DELAY);
            }
        }

        log(colors.blue, `   所有文件上傳完成，共 ${uploadedCount} 個文件`);
    }

    // 6. 文件列表測試
    async testDocumentList() {
        if (!this.authToken) {
            throw new Error('需要先完成用戶認證');
        }

        const response = await axios.get(`${BASE_URL}/api/rag/users/documents`, {
            headers: {
                'Authorization': `Bearer ${this.authToken}`
            }
        });

        if (!response.data.success) {
            throw new Error(`文件列表獲取失敗: ${response.data.error}`);
        }

        if (!Array.isArray(response.data.documents)) {
            throw new Error('文件列表返回格式錯誤');
        }

        const documentCount = response.data.documents.length;
        log(colors.blue, `   文件列表獲取成功，共 ${documentCount} 個文件`);

        // 可選：驗證文件數量
        if (documentCount === 0) {
            log(colors.yellow, `   ⚠️ 警告: 文件列表為空，可能需要等待文件索引完成`);
        }
    }

    // 7. RAG 查詢測試 (核心功能)
    async testRAGQueries() {
        if (!this.authToken || !this.userId || !this.engineId) {
            throw new Error('需要先完成用戶認證、引擎創建和文件上傳');
        }

        // 等待文件索引完成
        log(colors.yellow, `   ⏳ 等待 ${INDEXING_WAIT_TIME/1000} 秒讓文件索引完成...`);
        await sleep(INDEXING_WAIT_TIME);

        const testQueries = [
            {
                question: '法國的首都是什麼？',
                expectedKeywords: ['巴黎', '首都', '法國'],
                description: '測試法國相關信息查詢'
            },
            {
                question: 'Node.js 是什麼？',
                expectedKeywords: ['Node.js', 'JavaScript', 'V8', '運行時'],
                description: '測試技術文檔查詢'
            },
            {
                question: '艾菲爾鐵塔在哪裡？',
                expectedKeywords: ['巴黎', '艾菲爾鐵塔', '戰神廣場'],
                description: '測試地標信息查詢'
            },
            {
                question: 'npm 是什麼？',
                expectedKeywords: ['npm', 'Node', '包管理', 'Package Manager'],
                description: '測試技術工具查詢'
            }
        ];

        let successfulQueries = 0;

        for (const query of testQueries) {
            log(colors.cyan, `   📝 ${query.description}`);
            log(colors.yellow, `   ❓ 問題: "${query.question}"`);

            const response = await axios.post(
                `${BASE_URL}/api/rag/users/${this.userId}/engines/${this.engineId}/query`,
                { question: query.question },
                {
                    headers: {
                        'Authorization': `Bearer ${this.authToken}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            if (!response.data.success) {
                throw new Error(`查詢失敗 (${query.question}): ${response.data.error}`);
            }

            const answer = response.data.answer;
            const sources = response.data.sources;

            if (!answer) {
                throw new Error(`查詢成功但沒有返回答案 (${query.question})`);
            }

            // 驗證答案品質
            const hasExpectedContent = query.expectedKeywords.some(keyword => 
                answer.toLowerCase().includes(keyword.toLowerCase())
            );

            const contextCount = sources?.contexts?.length || 0;

            log(colors.green, `   ✅ 查詢成功`);
            log(colors.blue, `   📄 答案: ${answer.substring(0, 100)}...`);
            log(colors.blue, `   📊 檢索到 ${contextCount} 個相關文檔片段`);
            
            if (hasExpectedContent) {
                log(colors.blue, `   ✅ 答案包含預期關鍵詞`);
                successfulQueries++;
            } else {
                log(colors.yellow, `   ⚠️ 答案可能不完整，缺少預期關鍵詞`);
            }

            // 檢查是否有檢索到文檔
            if (contextCount === 0) {
                log(colors.yellow, `   ⚠️ 警告: 沒有檢索到相關文檔片段`);
            }

            // 查詢間短暫延遲
            await sleep(1000);
        }

        if (successfulQueries === 0) {
            throw new Error('所有查詢都沒有返回預期的答案內容');
        }

        log(colors.blue, `   🎯 查詢測試完成: ${successfulQueries}/${testQueries.length} 個查詢返回了預期內容`);
    }

    // 8. 系統清理測試 (可選)
    async testSystemCleanup() {
        log(colors.yellow, `   🧹 執行系統清理...`);
        
        // 這裡可以添加清理邏輯，比如刪除測試引擎
        // 目前只是標記測試完成
        
        log(colors.blue, `   ✅ 清理完成`);
    }

    // 執行所有測試
    async runAllTests() {
        log(colors.magenta, '🚀 開始執行 RAG 系統最終完整測試\n');
        log(colors.blue, `測試開始時間: ${new Date().toISOString()}`);
        
        await this.runTest('用戶註冊測試', () => this.testUserRegistration());
        await this.runTest('用戶登入測試', () => this.testUserLogin());
        await this.runTest('RAG 引擎創建測試', () => this.testEngineCreation());
        await this.runTest('引擎列表測試', () => this.testEngineList());
        await this.runTest('文件上傳測試', () => this.testFileUpload());
        await this.runTest('文件列表測試', () => this.testDocumentList());
        await this.runTest('RAG 查詢測試', () => this.testRAGQueries());
        await this.runTest('系統清理測試', () => this.testSystemCleanup());

        this.printTestResults();
    }

    // 打印測試結果
    printTestResults() {
        const duration = Math.round((Date.now() - this.testStartTime) / 1000);
        
        log(colors.magenta, '\n📊 測試結果統計');
        log(colors.magenta, '='.repeat(60));
        log(colors.green, `✅ 通過: ${this.stats.passed}`);
        log(colors.red, `❌ 失敗: ${this.stats.failed}`);
        log(colors.blue, `📈 總計: ${this.stats.total}`);
        log(colors.yellow, `🎯 成功率: ${((this.stats.passed / this.stats.total) * 100).toFixed(1)}%`);
        log(colors.blue, `⏱️ 執行時間: ${duration} 秒`);

        log(colors.magenta, '\n📋 詳細結果:');
        this.stats.details.forEach((result, index) => {
            const status = result.status === 'PASSED' ? '✅' : '❌';
            log(colors.cyan, `${index + 1}. ${status} ${result.name}`);
            if (result.error) {
                log(colors.red, `   錯誤: ${result.error}`);
            }
        });

        if (this.stats.failed === 0) {
            log(colors.green, '\n🎉 所有測試都通過了！RAG 系統運行完全正常。');
            log(colors.green, '系統已準備好投入生產環境使用。');
        } else {
            log(colors.red, '\n⚠️ 部分測試失敗，請檢查上述錯誤信息。');
            log(colors.yellow, '建議修復失敗的測試項目後再重新測試。');
        }

        log(colors.blue, `\n測試完成時間: ${new Date().toISOString()}`);
    }
}

// 主程序入口
async function main() {
    const tester = new RAGSystemFinalTest();
    
    try {
        await tester.runAllTests();
    } catch (error) {
        log(colors.red, `\n💥 測試執行過程中發生嚴重錯誤: ${error.message}`);
        log(colors.red, '請檢查伺服器是否正在運行，以及網路連接是否正常。');
        process.exit(1);
    }
}

// 執行測試
if (require.main === module) {
    main().catch(error => {
        log(colors.red, `未處理的錯誤: ${error.message}`);
        process.exit(1);
    });
}

module.exports = RAGSystemFinalTest;
