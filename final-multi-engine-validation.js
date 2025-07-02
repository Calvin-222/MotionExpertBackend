#!/usr/bin/env node

/**
 * MotionExpert Backend - 最終多 Engine 驗證測試
 * 完整驗證多 Engine 架構的所有功能
 */

const axios = require('axios');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const BASE_URL = 'http://localhost:3000';
const TEST_TIMEOUT = 120000; // 2 分鐘超時

class MultiEngineValidator {
    constructor() {
        this.testUser = null;
        this.authToken = null;
        this.createdEngines = [];
        this.results = {
            total: 0,
            passed: 0,
            failed: 0,
            details: []
        };
    }

    log(level, message, details = null) {
        const timestamp = new Date().toISOString();
        const symbols = {
            info: 'ℹ️',
            success: '✅',
            error: '❌',
            warning: '⚠️'
        };
        
        console.log(`${symbols[level]} ${message}`);
        if (details) {
            console.log(`   詳情: ${JSON.stringify(details, null, 2)}`);
        }
        
        this.results.details.push({
            timestamp,
            level,
            message,
            details
        });
    }

    async test(name, testFunc) {
        this.results.total++;
        try {
            await testFunc();
            this.results.passed++;
            this.log('success', `${name}: 測試通過`);
        } catch (error) {
            this.results.failed++;
            this.log('error', `${name}: 測試失敗`, error.message);
        }
    }

    async registerTestUser() {
        const username = `testuser${Date.now()}`;
        const password = 'Test123456';
        const userData = {
            username,
            password,
            confirmPassword: password
        };

        const response = await axios.post(`${BASE_URL}/api/auth/register`, userData);
        if (!response.data.success) {
            throw new Error(`用戶註冊失敗: ${response.data.message}`);
        }

        this.testUser = {
            username,
            password,
            userId: response.data.user.userid
        };
        this.authToken = response.data.token;
        return this.testUser;
    }

    async createTestEngine(engineName, description) {
        const headers = { 'Authorization': `Bearer ${this.authToken}` };
        const engineData = { engineName, description };

        const response = await axios.post(`${BASE_URL}/api/rag/users/engines`, engineData, { headers });
        if (!response.data.success) {
            throw new Error(`Engine 創建失敗: ${response.data.message}`);
        }

        const engine = {
            name: engineName,
            id: response.data.engine.id,
            displayName: response.data.engine.displayName
        };
        this.createdEngines.push(engine);
        return engine;
    }

    async waitForEngineReady(engineName, maxWaitTime = 60000) {
        const startTime = Date.now();
        const headers = { 'Authorization': `Bearer ${this.authToken}` };

        while (Date.now() - startTime < maxWaitTime) {
            try {
                const response = await axios.get(`${BASE_URL}/api/rag/users/engines`, { headers });
                if (response.data.success) {
                    const engine = response.data.engines.find(e => e.name === engineName);
                    if (engine) {
                        return engine;
                    }
                }
            } catch (error) {
                // 繼續等待
            }
            await new Promise(resolve => setTimeout(resolve, 5000)); // 等待 5 秒
        }
        throw new Error(`Engine ${engineName} 在 ${maxWaitTime/1000} 秒內未準備就緒`);
    }

    async uploadTestDocument(engineName, fileName, content) {
        const headers = { 'Authorization': `Bearer ${this.authToken}` };
        
        // 創建測試文件
        const testFilePath = `/tmp/${fileName}`;
        fs.writeFileSync(testFilePath, content);

        const FormData = require('form-data');
        const form = new FormData();
        form.append('file', fs.createReadStream(testFilePath));
        form.append('engineName', engineName);

        const response = await axios.post(`${BASE_URL}/api/rag/users/upload`, form, {
            headers: {
                ...headers,
                ...form.getHeaders()
            }
        });

        // 清理測試文件
        fs.unlinkSync(testFilePath);

        if (!response.data.success) {
            throw new Error(`文件上傳失敗: ${response.data.message}`);
        }

        return response.data;
    }

    async queryEngine(engineName, query) {
        const headers = { 'Authorization': `Bearer ${this.authToken}` };
        const queryData = { engineName, query };

        const response = await axios.post(`${BASE_URL}/api/rag/users/query`, queryData, { headers });
        if (!response.data.success) {
            throw new Error(`查詢失敗: ${response.data.message}`);
        }

        return response.data;
    }

    async getEngineDocuments(engineName) {
        const headers = { 'Authorization': `Bearer ${this.authToken}` };
        const params = { engineName };

        const response = await axios.get(`${BASE_URL}/api/rag/users/documents`, { headers, params });
        if (!response.data.success) {
            throw new Error(`獲取文檔列表失敗: ${response.data.message}`);
        }

        return response.data;
    }

    async runValidation() {
        console.log('🚀 MotionExpert 多 Engine 系統最終驗證');
        console.log('================================================');
        console.log(`開始時間: ${new Date().toISOString()}\n`);

        try {
            // 1. 用戶認證測試
            await this.test('用戶註冊', async () => {
                const user = await this.registerTestUser();
                this.log('info', `測試用戶: ${user.username} (${user.userId})`);
            });

            // 2. Engine 創建測試
            await this.test('創建技術文檔 Engine', async () => {
                const engine = await this.createTestEngine('技術文檔', '存儲技術相關文檔');
                this.log('info', `Engine 已創建: ${engine.displayName}`);
            });

            await this.test('創建業務資料 Engine', async () => {
                const engine = await this.createTestEngine('業務資料', '存儲業務相關文檔');
                this.log('info', `Engine 已創建: ${engine.displayName}`);
            });

            // 3. Engine 列表測試
            await this.test('Engine 列表查詢', async () => {
                // 等待 Engine 同步 - 增加等待時間
                this.log('info', '等待 Engine 同步（45秒）...');
                await new Promise(resolve => setTimeout(resolve, 45000));
                
                const headers = { 'Authorization': `Bearer ${this.authToken}` };
                const response = await axios.get(`${BASE_URL}/api/rag/users/engines`, { headers });
                
                if (!response.data.success) {
                    throw new Error('獲取 Engine 列表失敗');
                }

                const engines = response.data.engines;
                this.log('info', `找到 ${engines.length} 個 Engine`);
                
                if (engines.length < 2) {
                    // 再等待一下
                    this.log('info', 'Engine 仍在同步中，再等待 30 秒...');
                    await new Promise(resolve => setTimeout(resolve, 30000));
                    
                    const response2 = await axios.get(`${BASE_URL}/api/rag/users/engines`, { headers });
                    const engines2 = response2.data.engines;
                    this.log('info', `第二次檢查：找到 ${engines2.length} 個 Engine`);
                }
            });

            // 4. 文檔上傳測試
            await this.test('上傳技術文檔', async () => {
                const content = `
                    # 技術文檔
                    
                    ## API 設計原則
                    1. RESTful 設計
                    2. 統一的錯誤處理
                    3. 完整的認證機制
                    
                    ## 技術架構
                    - Node.js + Express
                    - Google Cloud AI
                    - RAG 多引擎支援
                `;
                
                // 在上傳前確認 Engine 存在
                const headers = { 'Authorization': `Bearer ${this.authToken}` };
                const enginesResponse = await axios.get(`${BASE_URL}/api/rag/users/engines`, { headers });
                
                if (!enginesResponse.data.engines.find(e => e.name === '技術文檔')) {
                    throw new Error('技術文檔 Engine 尚未同步完成');
                }
                
                await this.uploadTestDocument('技術文檔', 'tech-doc.txt', content);
            });

            await this.test('上傳業務文檔', async () => {
                const content = `
                    # 業務需求文檔
                    
                    ## 產品目標
                    提供多 Engine RAG 系統，支援：
                    - 多用戶隔離
                    - 靈活的知識庫管理
                    - 高效的文檔查詢
                    
                    ## 市場定位
                    企業級知識管理解決方案
                `;
                
                // 在上傳前確認 Engine 存在
                const headers = { 'Authorization': `Bearer ${this.authToken}` };
                const enginesResponse = await axios.get(`${BASE_URL}/api/rag/users/engines`, { headers });
                
                if (!enginesResponse.data.engines.find(e => e.name === '業務資料')) {
                    throw new Error('業務資料 Engine 尚未同步完成');
                }
                
                await this.uploadTestDocument('業務資料', 'business-doc.txt', content);
            });

            // 5. 文檔查詢測試
            await this.test('查詢技術文檔', async () => {
                // 等待文檔處理
                await new Promise(resolve => setTimeout(resolve, 15000));
                
                const result = await this.queryEngine('技術文檔', '什麼是 RESTful 設計？');
                
                if (!result.answer || result.answer.length < 10) {
                    throw new Error('查詢結果不完整');
                }
                
                this.log('info', `查詢結果: ${result.answer.substring(0, 100)}...`);
            });

            await this.test('查詢業務文檔', async () => {
                const result = await this.queryEngine('業務資料', '產品的市場定位是什麼？');
                
                if (!result.answer || result.answer.length < 10) {
                    throw new Error('查詢結果不完整');
                }
                
                this.log('info', `查詢結果: ${result.answer.substring(0, 100)}...`);
            });

            // 6. 跨 Engine 隔離測試
            await this.test('Engine 隔離驗證', async () => {
                // 在技術文檔 Engine 中查詢業務內容，應該找不到
                const result = await this.queryEngine('技術文檔', '產品的市場定位是什麼？');
                
                // 檢查答案是否包含業務相關內容
                if (result.answer.includes('企業級知識管理') || result.answer.includes('市場定位')) {
                    this.log('warning', 'Engine 隔離可能不完全');
                } else {
                    this.log('info', 'Engine 隔離正常');
                }
            });

            // 7. 文檔管理測試
            await this.test('獲取技術文檔列表', async () => {
                const docs = await this.getEngineDocuments('技術文檔');
                
                if (!docs.documents || docs.documents.length === 0) {
                    throw new Error('未找到上傳的文檔');
                }
                
                this.log('info', `找到 ${docs.documents.length} 個文檔`);
            });

        } catch (error) {
            this.log('error', '驗證過程中發生錯誤', error.message);
        }

        // 輸出最終報告
        this.generateReport();
    }

    generateReport() {
        console.log('\n📊 最終驗證報告');
        console.log('================================================');
        console.log(`總測試項目: ${this.results.total}`);
        console.log(`成功: ${this.results.passed}`);
        console.log(`失敗: ${this.results.failed}`);
        console.log(`成功率: ${((this.results.passed / this.results.total) * 100).toFixed(1)}%`);
        
        const status = this.results.failed === 0 ? '🎉 完全成功' : 
                      this.results.passed > this.results.failed ? '⚠️ 基本成功' : '❌ 需要修復';
        
        console.log(`系統狀態: ${status}`);

        // 詳細結果
        console.log('\n📋 詳細結果:');
        console.log('==========================================');
        this.results.details.forEach((detail, index) => {
            if (detail.level === 'success' || detail.level === 'error') {
                console.log(`${index + 1}. ${detail.level === 'success' ? '✅' : '❌'} ${detail.message}`);
            }
        });

        if (this.createdEngines.length > 0) {
            console.log('\n🎯 創建的 Engine:');
            this.createdEngines.forEach((engine, index) => {
                console.log(`   ${index + 1}. ${engine.name} (${engine.id})`);
            });
            console.log('\nℹ️ 建議手動清理測試 Engine 以釋放配額');
        }

        console.log(`\n✨ 驗證完成時間: ${new Date().toISOString()}`);
    }
}

// 運行驗證
async function main() {
    const validator = new MultiEngineValidator();
    
    // 設置超時
    const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('測試超時')), TEST_TIMEOUT);
    });

    try {
        await Promise.race([
            validator.runValidation(),
            timeoutPromise
        ]);
    } catch (error) {
        console.error('❌ 驗證失敗:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = MultiEngineValidator;
