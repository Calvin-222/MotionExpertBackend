const express = require("express");
const router = express.Router();
const { authenticateToken } = require("./middlewarecheck/middleware");
const TranslationService = require("./translation/TranslationService");

// 創建翻譯服務實例
const translationService = new TranslationService();

/**
 * � 配音腳本表格翻譯 API
 * 專門處理TC/CHARACTER/ENGLISH/TRANSLATION格式的配音腳本
 */
router.post("/voice-script-table", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const {
      scriptData,
      sourceLanguage,
      targetLanguage,
      model = "gemini-2.5-pro",
    } = req.body;

    // 驗證輸入參數
    if (!scriptData || !sourceLanguage || !targetLanguage) {
      return res.status(400).json({
        success: false,
        error: "必須提供 scriptData, sourceLanguage, targetLanguage 參數",
      });
    }

    console.log(`🎬 Voice script table translation request from user ${userId}:`);
    console.log(`📝 Script length: ${scriptData.length} characters`);
    console.log(`🔄 ${sourceLanguage} → ${targetLanguage}`);
    console.log(`🤖 Model: ${model}`);

    // 執行配音腳本表格翻譯
    const result = await translationService.translateVoiceScriptTable({
      scriptData,
      sourceLanguage,
      targetLanguage,
      model,
      userId,
    });

    if (result.success) {
      res.json({
        success: true,
        voiceScriptTranslation: {
          originalScript: result.originalScript,
          translatedScript: result.translatedScript,
          sourceLanguage: result.sourceLanguage,
          targetLanguage: result.targetLanguage,
          model: result.model,
          translationResults: result.translationResults,
          statistics: result.statistics,
        },
        metadata: {
          processingTime: result.processingTime,
          timestamp: result.timestamp,
          userId: userId,
        },
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error,
        details: result.details,
      });
    }
  } catch (error) {
    console.error("Voice script table translation API error:", error);
    res.status(500).json({
      success: false,
      error: "配音腳本表格翻譯服務內部錯誤",
      details: error.message,
    });
  }
});

/**
 * �🌐 配音稿翻譯 API
 *
 * 支援語言:
 * - zh-CN: 普通話
 * - zh-HK: 粵語
 * - en: 英語
 * - ja: 日文
 * - th: 泰文
 *
 * 支援模型:
 * - gemini-2.5-pro: 高質量翻譯，適合複雜內容
 * - gemini-2.5-flash: 快速翻譯，適合一般內容
 * - deepseek-r1-0528: 專業翻譯，適合技術內容
 */
router.post("/voice-script", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const {
      text,
      sourceLanguage,
      targetLanguage,
      model = "gemini-2.5-flash",
    } = req.body;

    // 驗證輸入參數
    if (!text || !sourceLanguage || !targetLanguage) {
      return res.status(400).json({
        success: false,
        error: "必須提供 text, sourceLanguage, targetLanguage 參數",
      });
    }

    console.log(`🌐 Translation request from user ${userId}:`);
    console.log(`📝 Text: ${text.substring(0, 100)}...`);
    console.log(`🔄 ${sourceLanguage} → ${targetLanguage}`);
    console.log(`🤖 Model: ${model}`);

    // 執行翻譯
    const result = await translationService.translateVoiceScript({
      text,
      sourceLanguage,
      targetLanguage,
      model,
      userId,
    });

    if (result.success) {
      res.json({
        success: true,
        translation: {
          originalText: text,
          translatedText: result.translatedText,
          sourceLanguage: result.sourceLanguage,
          targetLanguage: result.targetLanguage,
          model: result.model,
          syllableAnalysis: result.syllableAnalysis,
          contextPreservation: result.contextPreservation,
          translationQuality: result.quality,
        },
        metadata: {
          processingTime: result.processingTime,
          timestamp: result.timestamp,
          userId: userId,
        },
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error,
        details: result.details,
      });
    }
  } catch (error) {
    console.error("Translation API error:", error);
    res.status(500).json({
      success: false,
      error: "翻譯服務內部錯誤",
      details: error.message,
    });
  }
});

/**
 * 🎯 批量翻譯 API
 * 支援一次翻譯多個文本片段
 */
router.post("/voice-script/batch", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const {
      texts,
      sourceLanguage,
      targetLanguage,
      model = "gemini-2.5-flash",
    } = req.body;

    // 驗證輸入參數
    if (!texts || !Array.isArray(texts) || texts.length === 0) {
      return res.status(400).json({
        success: false,
        error: "texts 必須是非空陣列",
      });
    }

    if (!sourceLanguage || !targetLanguage) {
      return res.status(400).json({
        success: false,
        error: "必須提供 sourceLanguage, targetLanguage 參數",
      });
    }

    console.log(`🌐 Batch translation request from user ${userId}:`);
    console.log(`📝 Texts count: ${texts.length}`);
    console.log(`🔄 ${sourceLanguage} → ${targetLanguage}`);
    console.log(`🤖 Model: ${model}`);

    // 執行批量翻譯
    const result = await translationService.translateVoiceScriptBatch({
      texts,
      sourceLanguage,
      targetLanguage,
      model,
      userId,
    });

    if (result.success) {
      res.json({
        success: true,
        batchTranslation: {
          originalTexts: texts,
          translations: result.translations,
          sourceLanguage: result.sourceLanguage,
          targetLanguage: result.targetLanguage,
          model: result.model,
          summary: result.summary,
        },
        metadata: {
          totalTexts: texts.length,
          successfulTranslations: result.successCount,
          failedTranslations: result.failCount,
          processingTime: result.processingTime,
          timestamp: result.timestamp,
          userId: userId,
        },
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error,
        details: result.details,
      });
    }
  } catch (error) {
    console.error("Batch translation API error:", error);
    res.status(500).json({
      success: false,
      error: "批量翻譯服務內部錯誤",
      details: error.message,
    });
  }
});

/**
 * 📊 支援的語言列表 API
 */
router.get("/languages", async (req, res) => {
  try {
    const supportedLanguages = translationService.getSupportedLanguages();

    res.json({
      success: true,
      supportedLanguages: supportedLanguages,
      totalLanguages: Object.keys(supportedLanguages).length,
    });
  } catch (error) {
    console.error("Get languages API error:", error);
    res.status(500).json({
      success: false,
      error: "獲取語言列表失敗",
    });
  }
});

/**
 * 🤖 支援的模型列表 API
 */
router.get("/models", async (req, res) => {
  try {
    const supportedModels = translationService.getSupportedModels();

    res.json({
      success: true,
      supportedModels: supportedModels,
      totalModels: Object.keys(supportedModels).length,
    });
  } catch (error) {
    console.error("Get models API error:", error);
    res.status(500).json({
      success: false,
      error: "獲取模型列表失敗",
    });
  }
});

module.exports = router;
