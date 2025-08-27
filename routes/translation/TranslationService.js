const { auth, vertexAI, PROJECT_ID, LOCATION } = require("../rag/config");
const { GoogleGenAI } = require("@google/genai");

class TranslationService {
  constructor() {
    this.auth = auth;
    this.vertexAI = vertexAI;
    this.projectId = PROJECT_ID;
    this.location = LOCATION;

    this.genAI = new GoogleGenAI({
      vertexai: true,
      project: PROJECT_ID,
      location: LOCATION,
      googleAuth: auth,
    });

    this.supportedLanguages = {
      en: {
        name: "English",
        englishName: "English",
        code: "en",
        syllablePattern: "stress",
        characteristics: ["stress-timed", "alphabetic", "Germanic"],
      },
      "zh-HK": {
        name: "粵語",
        englishName: "Cantonese",
        code: "zh-HK",
        syllablePattern: "tonal",
        characteristics: ["tonal", "monosyllabic", "logographic"],
      },

      "zh-CN": {
        name: "普通話",
        englishName: "Mandarin",
        code: "zh-CN",
        syllablePattern: "tonal",
        characteristics: ["tonal", "monosyllabic", "logographic"],
      },
      ja: {
        name: "日本語",
        englishName: "Japanese",
        code: "ja",
        syllablePattern: "mora",
        characteristics: ["mora-timed", "syllabic", "mixed-script"],
      },
      th: {
        name: "แบบไทย",
        englishName: "Thai",
        code: "th",
        syllablePattern: "tonal",
        characteristics: ["tonal", "abugida", "Tai-Kadai"],
      },
    };

    // 支援的模型
    this.supportedModels = {
      "gemini-2.5-pro": {
        name: "Gemini 2.5 Pro",
        description: "Suitable for complex content and professional texts",
        type: "google-vertex",
        maxTokens: 65536,
        temperature: 0.2,
        characteristics: ["high-quality", "complex-reasoning", "context-aware"],
      },
    };

  }

  /**
   * � 配音腳本表格翻譯方法（專門處理TC/CHARACTER/ENGLISH/TRANSLATION格式）
   */
  async translateVoiceScriptTable({
    scriptData,
    sourceLanguage,
    targetLanguage,
    model,
    userId,
  }) {
    const startTime = Date.now();

    try {
      // 解析表格格式的腳本
      const parsedScript = this.parseScriptTable(scriptData);
      
      if (!parsedScript.success) {
        return {
          success: false,
          error: parsedScript.error,
          processingTime: Date.now() - startTime,
          timestamp: new Date().toISOString(),
        };
      }

      // 提取需要翻譯的對白內容
      const dialogueEntries = parsedScript.entries.filter(entry => 
        entry.english && 
        entry.english.trim() && 
        entry.english.trim() !== 'max' && 
        entry.english.trim() !== 'ORIGINAL' &&
        entry.english.trim() !== 'FRANCE' &&
        entry.english.trim() !== 'New York' &&
        !entry.english.trim().match(/^[A-Z\s]+$/) // 排除純大寫標題
      );

      const translationResults = [];

      // 逐條翻譯對白
      for (const entry of dialogueEntries) {
        console.log(`🎭 翻譯角色 "${entry.character}" 的對白...`);
        
        const prompt = this.buildVoiceScriptTablePrompt(
          entry,
          sourceLanguage,
          targetLanguage
        );

        let translationResult;
        if (this.supportedModels[model].type === "google-vertex") {
          translationResult = await this.translateWithGemini(prompt, model);
        } else {
          return {
            success: false,
            error: `不支援的模型類型: ${model}`,
          };
        }

        if (!translationResult.success) {
          translationResults.push({
            timecode: entry.timecode,
            character: entry.character,
            originalEnglish: entry.english,
            translatedText: `[翻譯失敗: ${translationResult.error}]`,
            success: false,
            error: translationResult.error
          });
          continue;
        }

        // 解析翻譯結果（簡化版）
        const parsedResult = this.parseTranslationResult(translationResult.response);
        
        translationResults.push({
          timecode: entry.timecode,
          character: entry.character,
          originalEnglish: entry.english,
          translatedText: parsedResult.translatedText,
          success: true
        });
      }

      // 重組完整的腳本表格
      const reconstructedScript = this.reconstructScriptTable(
        parsedScript.entries,
        translationResults
      );

      const processingTime = Date.now() - startTime;

      // 簡化返回結果
      return {
        success: true,
        originalScript: scriptData,
        translatedScript: reconstructedScript,
        translationResults,
        sourceLanguage,
        targetLanguage,
        model,
        statistics: {
          totalEntries: parsedScript.entries.length,
          translatedEntries: translationResults.filter(r => r.success).length,
          failedEntries: translationResults.filter(r => !r.success).length,
        },
        processingTime,
        timestamp: new Date().toISOString(),
      };

    } catch (error) {
      console.error("Voice script table translation error:", error);
      const processingTime = Date.now() - startTime;

      return {
        success: false,
        error: error.message,
        processingTime,
        timestamp: new Date().toISOString(),
        details: {
          sourceLanguage,
          targetLanguage,
          model,
        },
      };
    }
  }

  /**
   * �🌐 主要翻譯方法
   */
  async translateVoiceScript({
    text,
    sourceLanguage,
    targetLanguage,
    model,
    userId,
  }) {
    const startTime = Date.now();

    try {

      // 構建專業的翻譯提示詞
      const prompt = this.buildTranslationPrompt(
        text,
        sourceLanguage,
        targetLanguage
      );

      let translationResult;

      // 根據模型類型選擇不同的API
      if (this.supportedModels[model].type === "google-vertex") {
        translationResult = await this.translateWithGemini(prompt, model);
      } else {
        throw new Error(`未知的模型類型: ${this.supportedModels[model].type}`);
      }

      if (!translationResult.success) {
        throw new Error(translationResult.error);
      }

      // 解析翻譯結果 (只取翻譯文本)
      const parsedResult = this.parseTranslationResult(
        translationResult.response
      );

      const processingTime = Date.now() - startTime;

      return {
        success: true,
        translatedText: parsedResult.translatedText,
        sourceLanguage,
        targetLanguage,
        model,
        processingTime,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error("Translation service error:", error);
      const processingTime = Date.now() - startTime;

      return {
        success: false,
        error: error.message,
        processingTime,
        timestamp: new Date().toISOString(),
        details: {
          sourceLanguage,
          targetLanguage,
          model,
          textLength: text.length,
        },
      };
    }
  }

  /**
   * � 解析配音腳本表格格式
   */
  parseScriptTable(scriptData) {
    try {
      const lines = scriptData.trim().split('\n');
      const entries = [];
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        // 解析表格行：TC \t CHARACTER \t ENGLISH \t TRANSLATION
        const columns = line.split('\t');
        
        if (columns.length >= 4) {
          const [timecode, character, english, translation] = columns;
          
          // 跳過標題行
          if (timecode === 'TC' || timecode === 'TIMECODE') continue;
          
          entries.push({
            timecode: timecode.trim(),
            character: character.trim(),
            english: english.trim(),
            existingTranslation: translation.trim(),
            lineNumber: i + 1
          });
        } else if (columns.length >= 3) {
          // 處理某些行可能缺少翻譯的情況
          const [timecode, character, english] = columns;
          entries.push({
            timecode: timecode.trim(),
            character: character.trim(), 
            english: english.trim(),
            existingTranslation: '',
            lineNumber: i + 1
          });
        }
      }

      return {
        success: true,
        entries,
        totalLines: lines.length,
        parsedEntries: entries.length
      };

    } catch (error) {
      return {
        success: false,
        error: `腳本解析失敗: ${error.message}`
      };
    }
  }

  /**
   * 🎭 為配音腳本構建專門的翻譯提示詞（簡化版 - 只要翻譯結果）
   */
  buildVoiceScriptTablePrompt(entry, sourceLanguage, targetLanguage) {
    const sourceLang = this.supportedLanguages[sourceLanguage];
    const targetLang = this.supportedLanguages[targetLanguage];
    
    // 檢查是否是普通話到粵語的轉換
    const isMandatonCantonese = (sourceLanguage === 'zh-CN' && targetLanguage === 'zh-HK') || 
                               (sourceLanguage === 'zh-HK' && targetLanguage === 'zh-CN');

    if (isMandatonCantonese) {
      return this.buildCantoneseScriptPrompt(entry, sourceLanguage, targetLanguage, sourceLang, targetLang);
    }

    // 檢查是否是純音效標記
    if (entry.english.match(/^[<(].*[>)]$/)) {
      return `翻譯音效標記：${entry.english}
翻譯成${targetLang.name}，保持標記格式。

例子：
<screams> → （尖叫）
<roars> → （怒吼）
(overlaps) → （疊）

只回應JSON格式：{"translatedText": "結果"}
不要解釋，不要拼音，只要翻譯結果。`;
    }

    return `翻譯配音對白：${entry.english}
語言：${sourceLang.name} → ${targetLang.name}

**音節對應要求（最重要）：**
- 翻譯後的音節數必須與原文接近（差距不超過1-2個音節）
- 這是配音同步的關鍵要求
- 如果直譯音節太多，請簡化表達
- 如果直譯音節太少，請適當擴展

其他規則：
1. 人名不翻譯（Gizmo、Greene等保持原文）
2. 地名不翻譯（FRANCE、New York等保持原文）
3. 音效標記：<roars> → （怒吼）
4. 技術標記：(overlaps) → （疊）
5. 使用自然${targetLang.name}表達

重要：只回應JSON格式：{"translatedText": "翻譯結果"}
不要解釋，不要拼音，不要註釋，只要乾淨的翻譯文本。`;
  }

  /**
   * 🏮 專門為普通話-粵語配音腳本設計的提示詞（簡化版 - 只要結果）
   */
  buildCantoneseScriptPrompt(entry, sourceLanguage, targetLanguage, sourceLang, targetLang) {
    const isToCantonese = targetLanguage === 'zh-HK';

    // 如果是純音效標記，直接返回簡單翻譯
    if (entry.english.match(/^[<(].*[>)]$/)) {
      return `翻譯音效：${entry.english}
翻譯成${isToCantonese ? '粵語' : '普通話'}

只回應JSON：{"translatedText": "翻譯結果"}
不要解釋，不要拼音。`;
    }

    return `翻譯配音對白：${entry.english}
翻譯成${isToCantonese ? '地道香港粵語' : '標準普通話'}

**音節對應要求（最重要）：**
- 翻譯後的音節數必須與原文接近（差距不超過1-2個音節）
- 這是配音同步的關鍵要求
- 如果直譯音節太多，請簡化表達
- 如果直譯音節太少，請適當擴展

${isToCantonese ? `粵語翻譯要求：
1. 使用真正香港人說話方式
2. 人名不翻譯（如Greene、Sam保持原文）
3. 可適當使用英語詞彙（OK等）來調節音節數
4. 使用粵語語氣詞：啦、喇、嘅、咗等
5. 自然流暢表達

例子：
"No." → "唔。"
"Thanks for saving my life." → "多謝你救咗我。"
"Where is my Gizmo?" → "我嘅Gizmo呢？"` : `普通話翻譯要求：
1. 標準普通話表達
2. 人名不翻譯
3. 自然流暢
4. 音節數要匹配原文`}

重要：只回應JSON格式：{"translatedText": "翻譯結果"}
不要解釋，不要拼音，不要註釋，只要乾淨的翻譯文本。`;
  }

  /**
   * 🔄 重組配音腳本表格
   */
  reconstructScriptTable(originalEntries, translationResults) {
    const header = "TC\tCHARACTER\tENGLISH\tTRANSLATION";
    const rows = [header];
    
    // 創建翻譯結果的查找映射
    const translationMap = {};
    translationResults.forEach(result => {
      const key = `${result.timecode}-${result.character}`;
      translationMap[key] = result;
    });
    
    originalEntries.forEach(entry => {
      const key = `${entry.timecode}-${entry.character}`;
      const translationResult = translationMap[key];
      
      let finalTranslation = entry.existingTranslation;
      
      if (translationResult && translationResult.success) {
        finalTranslation = translationResult.translatedText;
      } else if (translationResult && !translationResult.success) {
        finalTranslation = `[翻譯失敗]`;
      }
      
      const row = `${entry.timecode}\t${entry.character}\t${entry.english}\t${finalTranslation}`;
      rows.push(row);
    });
    
    return rows.join('\n');
  }

  /**
   * �📝 構建翻譯提示詞
   */
  buildTranslationPrompt(text, sourceLanguage, targetLanguage) {
    const sourceLang = this.supportedLanguages[sourceLanguage];
    const targetLang = this.supportedLanguages[targetLanguage];

    // 檢查是否是普通話到粵語的轉換
    const isMandatonCantonese = (sourceLanguage === 'zh-CN' && targetLanguage === 'zh-HK') || 
                               (sourceLanguage === 'zh-HK' && targetLanguage === 'zh-CN');

    if (isMandatonCantonese) {
      return this.buildCantoneseTranslationPrompt(text, sourceLanguage, targetLanguage, sourceLang, targetLang);
    }

    return `翻譯配音腳本：${sourceLang.englishName} → ${targetLang.englishName}

原文：
"${text}"

**音節對應要求（最重要）：**
- 翻譯後的音節數必須與原文接近（差距不超過1-2個音節）
- 這是配音同步的關鍵要求
- 如果直譯音節太多，請簡化表達
- 如果直譯音節太少，請適當擴展

其他要求：
1. 保持原始格式（說話人標識、標點符號）
2. 人名不翻譯
3. 自然${targetLang.name}表達
4. 適合配音使用

重要：只回應JSON格式：{"translatedText": "完整翻譯結果"}
不要解釋，不要拼音，不要註釋，只要乾淨的翻譯文本。`;
  }

  /**
   * 🏮 專門為普通話-粵語轉換設計的提示詞（簡化版 - 只要結果）
   */
  buildCantoneseTranslationPrompt(text, sourceLanguage, targetLanguage, sourceLang, targetLang) {
    const isToCantonese = targetLanguage === 'zh-HK';

    return `翻譯配音腳本：${isToCantonese ? '普通話到地道香港粵語' : '香港粵語到標準普通話'}

原文：
"${text}"

**音節對應要求（最重要）：**
- 翻譯後的音節數必須與原文接近（差距不超過1-2個音節）
- 這是配音同步的關鍵要求
- 如果直譯音節太多，請簡化表達
- 如果直譯音節太少，請適當擴展

${isToCantonese ? `粵語翻譯要求：
1. 使用真正香港人說話方式
2. 人名不翻譯（如Greene、Sam保持原文）
3. 可適當使用英語詞彙（OK等）來調節音節數
4. 使用粵語語氣詞：啦、喇、嘅、咗等
5. 自然流暢表達` : `普通話翻譯要求：
1. 標準普通話表達
2. 人名不翻譯
3. 自然流暢
4. 音節數要匹配原文`}

重要：只回應JSON格式：{"translatedText": "完整翻譯結果"}
不要解釋，不要拼音，不要註釋，只要乾淨的翻譯文本。`;
  }

  /**
   * 🤖 使用 Gemini 模型翻譯
   */
  async translateWithGemini(prompt, model) {
    try {
      console.log(`🤖 Translating with Gemini model: ${model}`);

      const modelConfig = this.supportedModels[model];

      const request = {
        model: model,
        contents: [
          {
            role: "user",
            parts: [
              {
                text: prompt,
              },
            ],
          },
        ],
        config: {
          temperature: modelConfig.temperature,
          topK: 32,
          topP: 1,
          maxOutputTokens: modelConfig.maxTokens,
        },
      };

      const result = await this.genAI.models.generateContent(request);

      console.log(`🔍 Raw Gemini result:`, JSON.stringify(result, null, 2));

      // 修正：處理不同的回應結構
      let responseText = "";

      // 直接檢查 result.candidates (不是 result.response.candidates)
      if (result && result.candidates && result.candidates[0]) {
        const candidate = result.candidates[0];
        if (
          candidate.content &&
          candidate.content.parts &&
          candidate.content.parts[0]
        ) {
          responseText = candidate.content.parts[0].text;
          console.log(`✅ Got text via candidates path`);
        }
      }

      // 備用：嘗試其他可能的路徑
      if (!responseText && result.response) {
        if (typeof result.response.text === "function") {
          try {
            responseText = result.response.text();
            console.log(`✅ Got text via function call`);
          } catch (error) {
            console.log(`⚠️ Function call failed:`, error.message);
          }
        }

        if (!responseText && result.response.text) {
          responseText = result.response.text;
          console.log(`✅ Got text via direct text property`);
        }
      }

      if (!responseText) {
        console.log(`❌ Could not extract text from response`);
        console.log(`📋 Available properties:`, Object.keys(result));
        throw new Error("無法從 Gemini 回應中提取文本內容");
      }

      return {
        success: true,
        response: responseText,
        model: model,
        rawResponse: result,
      };
    } catch (error) {
      console.error(`❌ Gemini translation error:`, error);
      return {
        success: false,
        error: `Gemini 翻譯失敗: ${error.message}`,
      };
    }
  }

  /**
   * 解析翻譯結果（只取翻譯文本）
   */
  parseTranslationResult(response) {
    try {
      // 嘗試解析 JSON 格式回應
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsedJson = JSON.parse(jsonMatch[0]);
        return {
          translatedText: parsedJson.translatedText || response.trim(),
        };
      }
    } catch (error) {
      console.log("JSON parsing failed, using plain text response");
    }

    // 如果無法解析 JSON，使用純文本
    return {
      translatedText: response.trim(),
    };
  }



  /**
   * 📊 計算語境分數
   */
  calculateContextScore(original, translated) {
    // 簡化的語境分析：基於長度比例和關鍵詞保持
    const lengthRatio = translated.length / original.length;
    let score = 100;

    // 長度偏差懲罰
    if (lengthRatio > 2 || lengthRatio < 0.5) {
      score -= 30;
    } else if (lengthRatio > 1.5 || lengthRatio < 0.7) {
      score -= 15;
    }

    // 標點符號保持 (簡化檢查)
    const originalPunctuation = (original.match(/[!?。！？]/g) || []).length;
    const translatedPunctuation = (translated.match(/[!?。！？]/g) || [])
      .length;

    if (Math.abs(originalPunctuation - translatedPunctuation) > 2) {
      score -= 10;
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * 🎵 分析語調保持
   */
  analyzeTonePreservation(original, translated) {
    // 檢查情感標記
    const exclamationOrig = (original.match(/[!！]/g) || []).length;
    const questionOrig = (original.match(/[?？]/g) || []).length;
    const exclamationTrans = (translated.match(/[!！]/g) || []).length;
    const questionTrans = (translated.match(/[?？]/g) || []).length;

    if (
      exclamationOrig === exclamationTrans &&
      questionOrig === questionTrans
    ) {
      return "excellent";
    } else if (
      Math.abs(exclamationOrig - exclamationTrans) <= 1 &&
      Math.abs(questionOrig - questionTrans) <= 1
    ) {
      return "good";
    } else {
      return "needs_improvement";
    }
  }

  /**
   * 🌍 分析文化適應
   */
  analyzeCulturalAdaptation(
    original,
    translated,
    sourceLanguage,
    targetLanguage
  ) {
    // 簡化的文化適應分析
    // 在實際應用中，這裡可以包含更複雜的文化詞彙檢測
    return "standard_adaptation";
  }

  /**
   * 💡 獲取語境建議
   */
  getContextRecommendation(score, tonePreservation) {
    if (score >= 90 && tonePreservation === "excellent") {
      return "語境保持極佳，可直接用於配音";
    } else if (score >= 80) {
      return "語境保持良好，建議微調後使用";
    } else if (score >= 60) {
      return "語境有部分偏差，建議重新檢視翻譯";
    } else {
      return "語境偏差較大，建議重新翻譯";
    }
  }



  /**
   * 🔄 批量翻譯
   */
  async translateVoiceScriptBatch({
    texts,
    sourceLanguage,
    targetLanguage,
    model,
    userId,
  }) {
    const startTime = Date.now();
    const results = [];
    let successCount = 0;
    let failCount = 0;

    try {
      console.log(`🔄 Starting batch translation of ${texts.length} texts`);

      for (let i = 0; i < texts.length; i++) {
        const text = texts[i];
        console.log(`🔄 Translating text ${i + 1}/${texts.length}`);

        try {
          const result = await this.translateVoiceScript({
            text,
            sourceLanguage,
            targetLanguage,
            model,
            userId,
          });

          if (result.success) {
            results.push({
              index: i,
              success: true,
              originalText: text,
              translatedText: result.translatedText,
            });
            successCount++;
          } else {
            results.push({
              index: i,
              success: false,
              originalText: text,
              error: result.error,
            });
            failCount++;
          }
        } catch (error) {
          results.push({
            index: i,
            success: false,
            originalText: text,
            error: error.message,
          });
          failCount++;
        }

        // 添加間隔以避免API速率限制
        if (i < texts.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }

      const processingTime = Date.now() - startTime;

      return {
        success: true,
        translations: results,
        summary: {
          total: texts.length,
          successful: successCount,
          failed: failCount,
          successRate: ((successCount / texts.length) * 100).toFixed(1) + "%",
        },
        sourceLanguage,
        targetLanguage,
        model,
        successCount,
        failCount,
        processingTime,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error("Batch translation error:", error);
      const processingTime = Date.now() - startTime;

      return {
        success: false,
        error: error.message,
        processingTime,
        timestamp: new Date().toISOString(),
        details: {
          sourceLanguage,
          targetLanguage,
          model,
          totalTexts: texts.length,
        },
      };
    }
  }

  /**
   *  獲取支援的語言
   */
  getSupportedLanguages() {
    return this.supportedLanguages;
  }

  /**
   * 🤖 獲取支援的模型
   */
  getSupportedModels() {
    return this.supportedModels;
  }
}

module.exports = TranslationService;
