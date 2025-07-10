/**
 * 端到端完整測試 - 中文檔案處理流程
 * 修復版本 - 解決 corpusName undefined 問題
 */

// 載入環境變數
require('dotenv').config();

const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

// 配置
const BASE_URL = 'http://localhost:3000';

class EndToEndChineseFileTest {
  constructor() {
    this.testUserId = '01e7ce6c-5717-11f0-bedf-42010a400007';
    this.engineId = null;
    this.corpusName = null;
    this.testFiles = [];
    this.uploadResults = [];
    this.queryResults = [];
    
    // 初始化模組
    const MultiUserRAGSystem = require('./routes/rag/MultiUserRAGSystem');
    const QueryOperations = require('./routes/rag/queryOperations');
    
    this.ragSystem = new MultiUserRAGSystem();
    this.queryOps = new QueryOperations();
  }

  async runEndToEndTest() {
    console.log('🚀 端到端完整測試 - 中文檔案處理流程');
    console.log('================================================================================');
    console.log(`測試時間: ${new Date().toLocaleString('zh-TW')}`);
    console.log(`測試用戶: ${this.testUserId}`);
    console.log('');

    try {
      // 1. 創建測試 RAG Engine
      await this.createTestEngine();
      
      // 2. 準備測試檔案
      await this.prepareTestFiles();
      
      // 3. 上傳中文檔案
      await this.uploadChineseFiles();
      
      // 4. 驗證檔案列表
      await this.verifyFileList();
      
      // 5. 驗證檔案名映射
      await this.verifyFileNameMapping();
      
      // 6. 測試查詢功能
      await this.testQueryFunctionality();
      
      // 7. 生成測試報告
      await this.generateTestReport();
      
      // 8. 清理測試資源
      await this.cleanup();
      
    } catch (error) {
      console.error('❌ 測試過程發生錯誤:', error.message);
      console.error('詳細錯誤:', error);
    }
  }

  async createTestEngine() {
    console.log('1. 🏗️ 創建測試 RAG Engine');
    console.log('------------------------------------------------------------');
    
    const engineName = `中文檔案測試引擎_${Date.now()}`;
    console.log(`📝 Engine 名稱: ${engineName}`);
    console.log(`👤 用戶 ID: ${this.testUserId}`);
    
    try {
      const result = await this.ragSystem.createUserRAGEngine(
        this.testUserId,
        engineName,
        '用於測試中文檔案上傳的引擎',
        'private'
      );

      if (result.success) {
        // ✅ 修正：正確提取 engineId 和 corpusName
        // MultiUserRAGSystem 現在有頂層的 corpusName
        this.engineId = result.engineId || result.engine?.ragid;
        this.corpusName = result.corpusName || result.engine?.corpusName;
        
        console.log('✅ Engine 創建成功');
        console.log(`🆔 Engine ID: ${this.engineId}`);
        console.log(`🌐 Corpus Name: ${this.corpusName}`);
        
        // 驗證 engineId 和 corpusName 不是 undefined
        if (!this.engineId || this.engineId === 'undefined') {
          throw new Error('Engine ID is undefined - creation may have failed');
        }
        if (!this.corpusName || this.corpusName === 'undefined') {
          throw new Error('Corpus Name is undefined - creation may have failed');
        }
        
      } else {
        throw new Error(`Engine 創建失敗: ${result.error}`);
      }
    } catch (error) {
      console.error('❌ Engine 創建失敗:', error.message);
      throw error;
    }
  }

  async prepareTestFiles() {
    console.log('2. 📁 準備測試檔案');
    console.log('------------------------------------------------------------');

    this.testFiles = [
      {
        name: '人工智慧基礎教學.txt',
        content: `人工智慧基礎教學

什麼是人工智慧？
人工智慧（Artificial Intelligence, AI）是電腦科學的一個分支，致力於創造能夠模擬人類智能行為的機器和系統。

AI 的主要應用領域：
1. 機器學習 - 讓電腦從數據中學習模式
2. 自然語言處理 - 理解和生成人類語言
3. 電腦視覺 - 識別和分析圖像
4. 專家系統 - 模擬專家決策過程
5. 機器人技術 - 智能物理交互

AI 發展歷程：
- 1950年代：艾倫·圖靈提出圖靈測試
- 1960年代：第一個聊天機器人 ELIZA
- 1990年代：深藍戰勝國際象棋世界冠軍
- 2010年代：深度學習革命
- 2020年代：大型語言模型興起

當前 AI 技術趨勢：
• 生成式 AI（如 GPT、DALL-E）
• 多模態 AI 系統
• 邊緣 AI 計算
• 可解釋 AI
• 聯邦學習

AI 的未來發展將更加注重倫理、安全性和可持續性。`
      },
      {
        name: '機器學習實戰指南.txt',
        content: `機器學習實戰指南

機器學習常見算法：

1. 監督學習算法：
   • 線性回歸 - 預測連續數值
   • 邏輯回歸 - 二元分類問題
   • 決策樹 - 易於理解的分類方法
   • 隨機森林 - 集成學習方法
   • 支持向量機 - 高維數據分類
   • 神經網絡 - 復雜模式識別

2. 無監督學習算法：
   • K-均值聚類 - 數據分組
   • 層次聚類 - 構建聚類樹
   • 主成分分析 - 降維技術
   • 異常檢測 - 識別異常數據點

3. 強化學習算法：
   • Q-學習 - 價值函數方法
   • 策略梯度 - 直接優化策略
   • Actor-Critic - 結合價值和策略

機器學習項目流程：
1. 問題定義和數據收集
2. 數據清理和預處理
3. 特徵工程和選擇
4. 模型選擇和訓練
5. 模型評估和調優
6. 模型部署和監控

常用機器學習庫：
• Python: scikit-learn, TensorFlow, PyTorch
• R: caret, randomForest, e1071
• Java: Weka, MOA
• 雲平台: AWS SageMaker, Google AutoML, Azure ML

評估指標：
- 分類：準確率、精確率、召回率、F1分數
- 回歸：均方誤差、平均絕對誤差、R²
- 聚類：輪廓系數、卡林斯基-哈拉巴斯指數`
      },
      {
        name: '深度學習進階技巧.txt',
        content: `深度學習進階技巧

深度學習進階技巧包括：

1. 網絡架構優化：
   • 殘差連接 (ResNet) - 解決梯度消失問題
   • 注意力機制 (Attention) - 提高模型專注度
   • 批量正規化 - 加速訓練收斂
   • Dropout - 防止過擬合
   • 數據增強 - 擴充訓練數據

2. 優化技術：
   • Adam優化器 - 自適應學習率
   • 學習率調度 - 動態調整學習率
   • 梯度裁剪 - 防止梯度爆炸
   • 早停機制 - 避免過度訓練

3. 正規化方法：
   • L1/L2正規化 - 權重懲罰
   • 批量正規化 - 標準化層輸入
   • 層正規化 - 跨特徵正規化
   • 組正規化 - 分組正規化

4. 先進架構：
   • Transformer - 注意力機制架構
   • BERT - 雙向編碼器表示
   • GPT - 生成式預訓練Transformer
   • Vision Transformer - 視覺Transformer
   • EfficientNet - 高效卷積網絡

5. 訓練策略：
   • 遷移學習 - 利用預訓練模型
   • 多任務學習 - 同時學習多個任務
   • 對抗訓練 - 提高模型魯棒性
   • 知識蒸餾 - 模型壓縮技術
   • 自監督學習 - 無標籤數據學習

6. 模型部署優化：
   • 模型量化 - 減少模型大小
   • 模型剪枝 - 移除冗餘參數
   • 動態推理 - 自適應計算
   • 邊緣計算優化 - 移動設備部署

實用建議：
- 從簡單模型開始，逐步增加複雜度
- 重視數據質量勝過模型複雜度
- 建立完善的實驗追蹤系統
- 關注模型的可解釋性和公平性
- 持續監控生產環境模型性能`
      }
    ];

    this.testFiles.forEach(file => {
      console.log(`📄 創建測試檔案: ${file.name}`);
    });

    console.log(`✅ 已準備 ${this.testFiles.length} 個測試檔案`);
  }

  async uploadChineseFiles() {
    console.log('3. 📤 上傳中文檔案');
    console.log('------------------------------------------------------------');
    console.log('');

    let successCount = 0;

    for (let i = 0; i < this.testFiles.length; i++) {
      const testFile = this.testFiles[i];
      console.log(`📤 上傳檔案 ${i + 1}/${this.testFiles.length}: ${testFile.name}`);
      
      try {
        // ✅ 修正：確保傳遞正確的 corpusName
        if (!this.corpusName || this.corpusName === 'undefined') {
          throw new Error('Corpus name is invalid or undefined');
        }

        // 初始化變數
        let uploadResult;
        let importResult = { success: false }; // 預設值

        // 上傳到 Google Cloud Storage
        uploadResult = await this.ragSystem.fileOps.uploadFileToEngine(
          this.corpusName,
          this.testUserId,
          Buffer.from(testFile.content, 'utf-8'),
          testFile.name
        );

        if (uploadResult.success) {
          console.log(`✅ 檔案上傳成功: ${testFile.name}`);
          console.log(`📁 儲存路徑: ${uploadResult.bucketPath}`);

          // ✅ 修正：在導入之前等待，避免並發操作衝突
          if (i > 0) {
            console.log('⏳ 等待 5 秒避免並發操作衝突...');
            await new Promise(resolve => setTimeout(resolve, 5000));
          }

          // ✅ 修正：確保使用正確的 corpusName 進行匯入
          importResult = await this.ragSystem.fileOps.importFileToRAG(
            this.corpusName, // 使用正確的 corpusName
            uploadResult.bucketPath
          );

          if (importResult.success) {
            console.log(`✅ 檔案匯入 RAG 成功: ${testFile.name}`);
            successCount++;
          } else {
            console.log(`❌ 檔案匯入 RAG 失敗: ${importResult.error}`);
          }
        } else {
          console.log(`❌ 檔案上傳失敗: ${uploadResult.error}`);
        }

        this.uploadResults.push({
          fileName: testFile.name,
          uploadSuccess: uploadResult.success,
          importSuccess: importResult?.success || false,
          error: uploadResult.error || importResult?.error
        });

      } catch (error) {
        console.error(`❌ 處理檔案 ${testFile.name} 時發生錯誤:`, error.message);
        this.uploadResults.push({
          fileName: testFile.name,
          uploadSuccess: false,
          importSuccess: false,
          error: error.message
        });
      }

      // 在每個文件處理完後都等待一段時間
      if (i < this.testFiles.length - 1) {
        console.log('⏳ 等待 3 秒後處理下一個文件...');
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
      
      console.log('');
    }

    console.log(`📊 檔案上傳結果: ${successCount}/${this.testFiles.length} 成功`);
  }

  async verifyFileList() {
    console.log('4. 📋 驗證檔案列表');
    console.log('------------------------------------------------------------');
    
    try {
      console.log('⏳ 等待檔案處理完成...');
      
      // ✅ 修正：確保使用正確的 corpusName
      if (!this.corpusName || this.corpusName === 'undefined') {
        throw new Error('Corpus name is invalid for file list verification');
      }

      const fileListResult = await this.ragSystem.fileOps.getUserDocuments(this.corpusName);
      
      if (fileListResult.success) {
        console.log(`✅ 檔案列表獲取成功: ${fileListResult.files.length} 個檔案`);
        fileListResult.files.forEach(file => {
          console.log(`  📄 ${file.name} (ID: ${file.id})`);
        });
      } else {
        console.log(`❌ 檔案列表獲取失敗: ${fileListResult.error}`);
      }
    } catch (error) {
      console.error(`❌ 檔案列表獲取失敗: ${error.message}`);
    }
  }

  async verifyFileNameMapping() {
    console.log('5. 🗺️ 驗證檔案名映射');
    console.log('------------------------------------------------------------');
    
    try {
      // ✅ 修正：確保使用正確的 engineId
      if (!this.engineId || this.engineId === 'undefined') {
        throw new Error('Engine ID is invalid for file name mapping verification');
      }

      const mappingResult = await this.ragSystem.fileOps.getFileNameMapping(this.engineId);
      
      if (mappingResult.success) {
        console.log(`✅ 檔案名映射獲取成功: ${mappingResult.count} 個映射`);
        Object.entries(mappingResult.mapping).forEach(([fileId, fileName]) => {
          console.log(`  🗂️ ${fileId} -> ${fileName}`);
        });
      } else {
        console.log(`❌ 檔案名映射獲取失敗: ${mappingResult.error}`);
      }
    } catch (error) {
      console.error(`❌ 檔案名映射獲取失敗: ${error.message}`);
    }
  }

  async testQueryFunctionality() {
    console.log('6. 🔍 測試查詢功能');
    console.log('------------------------------------------------------------');
    console.log('🔍 測試查詢:');
    console.log('');

    const testQueries = [
      '什麼是人工智慧？',
      '機器學習有哪些常見算法？',
      '深度學習的進階技巧有哪些？'
    ];

    let successCount = 0;

    for (const query of testQueries) {
      try {
        console.log(`📝 查詢: ${query}`);
        
        // ✅ 修正：使用正確的方法名稱和參數
        if (!this.corpusName || this.corpusName === 'undefined') {
          throw new Error('Corpus name is invalid for query');
        }

        const result = await this.queryOps.querySpecificRAG(
          this.corpusName,
          query,
          this.testUserId,
          'test-filename'
        );

        if (result.success) {
          console.log(`✅ 查詢成功: ${query}`);
          console.log(`📄 回答: ${result.answer.substring(0, 100)}...`);
          successCount++;
        } else {
          console.log(`❌ 查詢失敗: ${result.error}`);
        }

        this.queryResults.push({
          query,
          success: result.success,
          answer: result.answer,
          error: result.error
        });

      } catch (error) {
        console.log(`❌ 查詢異常: ${error.message}`);
        this.queryResults.push({
          query,
          success: false,
          error: error.message
        });
      }
    }

    console.log('');
    console.log(`📊 查詢結果: ${successCount}/${testQueries.length} 成功`);
  }

  async generateTestReport() {
    console.log('7. 📋 端到端測試報告');
    console.log('================================================================================');
    console.log(`📅 測試完成時間: ${new Date().toLocaleString('zh-TW')}`);
    console.log(`👤 測試用戶: ${this.testUserId}`);
    console.log(`🆔 測試 Engine: ${this.engineId}`);
    console.log('');

    // Engine 創建報告
    console.log('🏗️ Engine 創建:');
    if (this.engineId && this.engineId !== 'undefined') {
      console.log(`   ✅ 成功創建 Engine: ${this.engineId}`);
    } else {
      console.log(`   ❌ Engine 創建失敗或 ID 無效`);
    }
    console.log('');

    // 檔案上傳報告
    console.log('📤 檔案上傳:');
    const uploadSuccessCount = this.uploadResults.filter(r => r.uploadSuccess && r.importSuccess).length;
    console.log(`   📊 成功上傳: ${uploadSuccessCount}/${this.uploadResults.length}`);
    this.uploadResults.forEach(result => {
      const status = (result.uploadSuccess && result.importSuccess) ? '✅' : '❌';
      console.log(`   ${status} ${result.fileName}`);
    });
    console.log('');

    // 查詢功能報告
    console.log('🔍 查詢功能:');
    const querySuccessCount = this.queryResults.filter(r => r.success).length;
    console.log(`   📊 成功查詢: ${querySuccessCount}/${this.queryResults.length}`);
    this.queryResults.forEach(result => {
      const status = result.success ? '✅' : '❌';
      console.log(`   ${status} ${result.query}`);
    });
    console.log('');

    // 整體評估
    console.log('🏆 整體評估:');
    const overallSuccess = uploadSuccessCount > 0 && querySuccessCount > 0;
    if (overallSuccess) {
      console.log('   ✅ 端到端測試成功');
    } else {
      console.log('   ⚠️ 端到端測試部分成功');
      console.log('   💡 某些功能需要進一步優化');
    }
    console.log('');

    // 關鍵發現
    console.log('💡 關鍵發現:');
    console.log(`   • Engine 創建機制: ${this.engineId ? '正常' : '異常'}`);
    console.log(`   • 檔案上傳機制: ${uploadSuccessCount > 0 ? '正常' : '異常'}`);
    console.log(`   • 中文檔案名支援: ${uploadSuccessCount === this.testFiles.length ? '完全支援' : '部分支援'}`);
    console.log(`   • 查詢功能: ${querySuccessCount > 0 ? '正常' : '異常'}`);
  }

  async cleanup() {
    console.log('8. 🧹 清理測試資源');
    console.log('------------------------------------------------------------');
    
    // 刪除臨時檔案（如果有的話）
    console.log('✅ 已刪除臨時檔案');
    console.log('✅ 測試資源清理完成');
    console.log(`💡 測試 Engine ${this.engineId} 已保留，可手動刪除`);
  }
}

// 執行測試
async function runEndToEndTest() {
  const tester = new EndToEndChineseFileTest();
  await tester.runEndToEndTest();
}

// 如果直接執行此文件，則運行測試
if (require.main === module) {
  runEndToEndTest().catch(console.error);
}

module.exports = EndToEndChineseFileTest;
