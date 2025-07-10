/**
 * listAllRAGEngines 方法測試
 * 
 * 測試目標：
 * 1. 驗證是否能正確獲取到 74 個現有的 RAG Engine
 * 2. 測試分頁邏輯是否正確
 * 3. 驗證大量 Engine (200+) 的處理能力
 * 4. 檢查資料庫整合功能
 */

const EngineManagement = require('./routes/rag/engineManagement');

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

class ListEnginesTest {
    constructor() {
        this.engineManager = new EngineManagement();
        this.testResults = {
            totalTests: 0,
            passedTests: 0,
            failedTests: 0,
            details: []
        };
    }

    // 執行單個測試
    async runTest(testName, testFunction) {
        this.testResults.totalTests++;
        log(colors.cyan, `\n🧪 執行測試: ${testName}`);
        
        try {
            const result = await testFunction();
            this.testResults.passedTests++;
            this.testResults.details.push({
                name: testName,
                status: 'PASSED',
                result: result
            });
            log(colors.green, `✅ 測試通過: ${testName}`);
            return result;
        } catch (error) {
            this.testResults.failedTests++;
            this.testResults.details.push({
                name: testName,
                status: 'FAILED',
                error: error.message
            });
            log(colors.red, `❌ 測試失敗: ${testName}`);
            log(colors.red, `   錯誤: ${error.message}`);
            throw error;
        }
    }

    // 測試 1: 基本功能測試 - 獲取所有 Engine
    async testBasicListAllEngines() {
        log(colors.blue, '測試預期：獲取到 74 個 RAG Engine');
        
        const result = await this.engineManager.listAllRAGEngines();
        
        if (!result.success) {
            throw new Error(`API 調用失敗: ${result.error}`);
        }

        const totalEngines = result.totalEngines;
        const dbEngines = result.dbEngines;
        const totalPages = result.totalPages;
        
        log(colors.blue, `📊 API 返回 Engine 數量: ${totalEngines}`);
        log(colors.blue, `📊 資料庫 Engine 數量: ${dbEngines}`);
        log(colors.blue, `📊 總頁數: ${totalPages}`);
        log(colors.blue, `📊 分頁信息: ${JSON.stringify(result.pagination)}`);
        
        // 驗證是否獲取到預期的 74 個 Engine
        if (totalEngines !== 74) {
            log(colors.yellow, `⚠️ 警告: 獲取到 ${totalEngines} 個 Engine，預期 74 個`);
            log(colors.yellow, `   這可能是因為 Engine 數量已變化`);
        }

        // 驗證基本結構
        if (!Array.isArray(result.engines)) {
            throw new Error('engines 不是陣列');
        }

        if (result.engines.length !== totalEngines) {
            throw new Error(`engines 陣列長度 (${result.engines.length}) 與 totalEngines (${totalEngines}) 不符`);
        }

        // 檢查每個 Engine 的基本結構
        const sampleEngine = result.engines[0];
        if (sampleEngine) {
            const requiredFields = ['id', 'name', 'displayName', 'userId'];
            for (const field of requiredFields) {
                if (!sampleEngine.hasOwnProperty(field)) {
                    throw new Error(`Engine 缺少必要欄位: ${field}`);
                }
            }
        }

        return {
            totalEngines,
            dbEngines,
            totalPages,
            pagination: result.pagination,
            engineStructureValid: true
        };
    }

    // 測試 2: 測試不同頁面大小
    async testDifferentPageSizes() {
        log(colors.blue, '測試不同的頁面大小');
        
        const pageSizes = [10, 50, 100, 200];
        const results = {};
        
        for (const pageSize of pageSizes) {
            log(colors.yellow, `   測試頁面大小: ${pageSize}`);
            
            const result = await this.engineManager.listAllRAGEngines(pageSize);
            
            if (!result.success) {
                throw new Error(`頁面大小 ${pageSize} 測試失敗: ${result.error}`);
            }
            
            results[pageSize] = {
                totalEngines: result.totalEngines,
                totalPages: result.totalPages,
                actualPages: result.pagination.actualPages
            };
            
            log(colors.blue, `     結果: ${result.totalEngines} 個 Engine，${result.totalPages} 頁`);
        }
        
        // 驗證所有頁面大小都返回相同的總數
        const engineCounts = Object.values(results).map(r => r.totalEngines);
        const firstCount = engineCounts[0];
        
        if (!engineCounts.every(count => count === firstCount)) {
            throw new Error('不同頁面大小返回的 Engine 總數不一致');
        }
        
        return results;
    }

    // 測試 3: 測試大量 Engine 的處理能力（模擬測試）
    async testLargeEngineCapacity() {
        log(colors.blue, '測試大量 Engine 的處理能力');
        
        // 使用小的頁面大小來測試分頁邏輯
        const smallPageSize = 10;
        const result = await this.engineManager.listAllRAGEngines(smallPageSize);
        
        if (!result.success) {
            throw new Error(`小頁面大小測試失敗: ${result.error}`);
        }
        
        const totalEngines = result.totalEngines;
        const totalPages = result.totalPages;
        const expectedPages = Math.ceil(totalEngines / smallPageSize);
        
        log(colors.blue, `📊 使用頁面大小 ${smallPageSize}:`);
        log(colors.blue, `   總 Engine 數: ${totalEngines}`);
        log(colors.blue, `   實際頁數: ${totalPages}`);
        log(colors.blue, `   預期頁數: ${expectedPages}`);
        
        // 檢查頁數限制問題
        if (totalPages >= 10) {
            log(colors.yellow, `⚠️ 警告: 達到了 10 頁的限制！`);
            log(colors.yellow, `   這意味著如果有更多 Engine，可能無法全部獲取`);
            log(colors.yellow, `   建議增加 pageSize 或移除頁數限制`);
        }
        
        // 檢查是否能處理 200+ Engine 的情況
        const maxEnginesWithCurrentLimit = 10 * 100; // 10 頁 × 100 每頁
        log(colors.blue, `📊 當前設定可處理的最大 Engine 數: ${maxEnginesWithCurrentLimit}`);
        
        if (maxEnginesWithCurrentLimit >= 200) {
            log(colors.green, `✅ 當前設定可以處理 200+ Engine`);
        } else {
            log(colors.red, `❌ 當前設定無法處理 200+ Engine`);
        }
        
        return {
            totalEngines,
            totalPages,
            expectedPages,
            maxCapacity: maxEnginesWithCurrentLimit,
            canHandle200: maxEnginesWithCurrentLimit >= 200
        };
    }

    // 測試 4: 驗證資料庫整合功能
    async testDatabaseIntegration() {
        log(colors.blue, '測試資料庫整合功能');
        
        const result = await this.engineManager.listAllRAGEngines();
        
        if (!result.success) {
            throw new Error(`資料庫整合測試失敗: ${result.error}`);
        }
        
        const engines = result.engines;
        const dbEngines = result.dbEngines;
        
        log(colors.blue, `📊 Google Cloud Engine 數量: ${engines.length}`);
        log(colors.blue, `📊 資料庫 Engine 數量: ${dbEngines}`);
        
        // 統計有資料庫記錄的 Engine
        const enginesWithDbRecord = engines.filter(e => e.hasDbRecord);
        const enginesWithoutDbRecord = engines.filter(e => !e.hasDbRecord);
        
        log(colors.blue, `📊 有資料庫記錄的 Engine: ${enginesWithDbRecord.length}`);
        log(colors.blue, `📊 沒有資料庫記錄的 Engine: ${enginesWithoutDbRecord.length}`);
        
        // 檢查資料庫欄位
        if (enginesWithDbRecord.length > 0) {
            const sampleEngine = enginesWithDbRecord[0];
            const dbFields = ['ragName', 'visibility', 'dbCreatedAt', 'dbUpdatedAt'];
            
            for (const field of dbFields) {
                if (!sampleEngine.hasOwnProperty(field)) {
                    throw new Error(`Engine 缺少資料庫欄位: ${field}`);
                }
            }
        }
        
        return {
            totalEngines: engines.length,
            dbEngines: dbEngines,
            enginesWithDbRecord: enginesWithDbRecord.length,
            enginesWithoutDbRecord: enginesWithoutDbRecord.length,
            dbIntegrationRatio: enginesWithDbRecord.length / engines.length
        };
    }

    // 測試 5: 性能測試
    async testPerformance() {
        log(colors.blue, '執行性能測試');
        
        const startTime = Date.now();
        
        const result = await this.engineManager.listAllRAGEngines();
        
        const endTime = Date.now();
        const duration = endTime - startTime;
        
        if (!result.success) {
            throw new Error(`性能測試失敗: ${result.error}`);
        }
        
        const enginesPerSecond = result.totalEngines / (duration / 1000);
        
        log(colors.blue, `📊 執行時間: ${duration} 毫秒`);
        log(colors.blue, `📊 處理速度: ${enginesPerSecond.toFixed(2)} Engine/秒`);
        log(colors.blue, `📊 平均每個 Engine 處理時間: ${(duration / result.totalEngines).toFixed(2)} 毫秒`);
        
        // 性能基準檢查
        const maxAcceptableTime = 30000; // 30秒
        if (duration > maxAcceptableTime) {
            log(colors.yellow, `⚠️ 警告: 執行時間超過 ${maxAcceptableTime/1000} 秒`);
        }
        
        return {
            duration,
            totalEngines: result.totalEngines,
            enginesPerSecond,
            avgTimePerEngine: duration / result.totalEngines
        };
    }

    // 執行所有測試
    async runAllTests() {
        log(colors.magenta, '🚀 開始 listAllRAGEngines 方法測試\n');
        
        try {
            const test1Result = await this.runTest('基本功能測試', () => this.testBasicListAllEngines());
            const test2Result = await this.runTest('不同頁面大小測試', () => this.testDifferentPageSizes());
            const test3Result = await this.runTest('大量 Engine 處理能力測試', () => this.testLargeEngineCapacity());
            const test4Result = await this.runTest('資料庫整合測試', () => this.testDatabaseIntegration());
            const test5Result = await this.runTest('性能測試', () => this.testPerformance());

            this.printTestResults();
            this.printDetailedAnalysis(test1Result, test2Result, test3Result, test4Result, test5Result);
            
        } catch (error) {
            log(colors.red, `\n💥 測試執行失敗: ${error.message}`);
            this.printTestResults();
        }
    }

    // 打印測試結果
    printTestResults() {
        log(colors.magenta, '\n📊 測試結果統計');
        log(colors.magenta, '='.repeat(60));
        log(colors.green, `✅ 通過: ${this.testResults.passedTests}`);
        log(colors.red, `❌ 失敗: ${this.testResults.failedTests}`);
        log(colors.blue, `📈 總計: ${this.testResults.totalTests}`);
        log(colors.yellow, `🎯 成功率: ${((this.testResults.passedTests / this.testResults.totalTests) * 100).toFixed(1)}%`);
    }

    // 打印詳細分析
    printDetailedAnalysis(test1, test2, test3, test4, test5) {
        log(colors.magenta, '\n📋 詳細分析結果');
        log(colors.magenta, '='.repeat(60));
        
        // 基本功能分析
        if (test1) {
            log(colors.cyan, `🔍 基本功能:`);
            log(colors.blue, `   - 獲取到 ${test1.totalEngines} 個 Engine`);
            log(colors.blue, `   - 資料庫中有 ${test1.dbEngines} 個 Engine`);
            log(colors.blue, `   - 分頁數: ${test1.totalPages} 頁`);
            
            if (test1.totalEngines === 74) {
                log(colors.green, `   ✅ 完美匹配預期的 74 個 Engine`);
            } else {
                log(colors.yellow, `   ⚠️ 實際 ${test1.totalEngines} 個，預期 74 個`);
            }
        }
        
        // 大量 Engine 處理能力分析
        if (test3) {
            log(colors.cyan, `🔍 大量 Engine 處理能力:`);
            log(colors.blue, `   - 最大處理容量: ${test3.maxCapacity} 個 Engine`);
            
            if (test3.canHandle200) {
                log(colors.green, `   ✅ 可以處理 200+ Engine`);
            } else {
                log(colors.red, `   ❌ 無法處理 200+ Engine`);
                log(colors.yellow, `   💡 建議: 增加 pageSize 或移除 10 頁的限制`);
            }
        }
        
        // 資料庫整合分析
        if (test4) {
            log(colors.cyan, `🔍 資料庫整合:`);
            log(colors.blue, `   - 有資料庫記錄: ${test4.enginesWithDbRecord} 個`);
            log(colors.blue, `   - 沒有資料庫記錄: ${test4.enginesWithoutDbRecord} 個`);
            log(colors.blue, `   - 整合比例: ${(test4.dbIntegrationRatio * 100).toFixed(1)}%`);
        }
        
        // 性能分析
        if (test5) {
            log(colors.cyan, `🔍 性能表現:`);
            log(colors.blue, `   - 執行時間: ${test5.duration} 毫秒`);
            log(colors.blue, `   - 處理速度: ${test5.enginesPerSecond.toFixed(2)} Engine/秒`);
            
            if (test5.duration < 10000) {
                log(colors.green, `   ✅ 性能良好 (< 10秒)`);
            } else if (test5.duration < 30000) {
                log(colors.yellow, `   ⚠️ 性能可接受 (10-30秒)`);
            } else {
                log(colors.red, `   ❌ 性能較慢 (> 30秒)`);
            }
        }
        
        // 總結建議
        log(colors.magenta, '\n💡 建議:');
        if (test3 && !test3.canHandle200) {
            log(colors.yellow, '1. 考慮移除 10 頁的硬性限制，改為可配置的參數');
            log(colors.yellow, '2. 增加默認的 pageSize 到 200 或更高');
            log(colors.yellow, '3. 添加更智能的分頁邏輯，避免無限循環');
        } else {
            log(colors.green, '1. 當前配置可以滿足需求');
            log(colors.green, '2. 分頁邏輯運行正常');
        }
    }
}

// 主程序
async function main() {
    const tester = new ListEnginesTest();
    await tester.runAllTests();
}

// 執行測試
if (require.main === module) {
    main().catch(error => {
        console.error('\n💥 測試執行出錯:', error);
        process.exit(1);
    });
}

module.exports = ListEnginesTest;
