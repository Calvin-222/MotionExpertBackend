const express = require("express");
const router = express.Router();
const { authenticateToken } = require("./middlewarecheck/middleware");
const { pool } = require("../config/database");
const MultiUserRAGSystem = require("./rag/MultiUserRAGSystem");
const ragSystem = new MultiUserRAGSystem();

// 主要 router：直接用 RAG Engine 回答
router.post("/askai", authenticateToken, async (req, res) => {
  try {
    const { synopsisString, engineId, templateId } = req.body; // 新增 templateId 參數
    const userId = req.user.userId;

    if (!synopsisString || !engineId) {
      return res.status(400).json({
        success: false,
        message: "synopsisString 和 engineId 都是必填欄位",
      });
    }

    console.log(`[DEBUG] Processing synopsis request:`, {
      userId,
      engineId,
      templateId: templateId || "none",
      synopsisLength: synopsisString.length,
    });

    // 如果提供了 templateId，記錄模板使用情況並獲取模板詳情
    let templateInfo = null;
    if (templateId) {
      try {
        console.log(`[DEBUG] Processing templateId: ${templateId}`);

        // 獲取模板詳情以加強提示詞
        const [templates] = await pool.execute(
          "SELECT scriptname, template_structure FROM script_template WHERE id = ? AND userid = ?",
          [templateId, userId]
        );

        console.log(
          `[DEBUG] Found ${templates.length} template(s) for templateId: ${templateId}`
        );

        if (templates.length > 0) {
          try {
            const rawTemplateStructure = templates[0].template_structure;
            console.log(
              `[DEBUG] Raw template_structure type:`,
              typeof rawTemplateStructure
            );

            // 根據資料類型決定處理方式
            let templateStructure;

            if (
              typeof rawTemplateStructure === "object" &&
              rawTemplateStructure !== null
            ) {
              // 如果已經是物件，直接使用
              console.log(`[DEBUG] Template structure is already an object`);
              templateStructure = rawTemplateStructure;
            } else if (typeof rawTemplateStructure === "string") {
              console.log(
                `[DEBUG] Raw template_structure preview:`,
                rawTemplateStructure.substring(0, 100) + "..."
              );

              // 檢查是否為 "[object Object]" 字串
              if (rawTemplateStructure === "[object Object]") {
                console.error(
                  "[DEBUG] Invalid template structure: [object Object] detected"
                );
                console.error(
                  "[DEBUG] This suggests the template was not properly JSON.stringify() when saved"
                );
                throw new Error("Invalid template structure");
              } else {
                // 嘗試解析 JSON 字串
                templateStructure = JSON.parse(rawTemplateStructure);
              }
            } else {
              throw new Error("Unknown template structure format");
            }

            templateInfo = {
              name: templates[0].scriptname,
              structure: templateStructure,
            };

            // 更新模板的最後使用時間（只在成功找到模板後執行）
            await pool.execute(
              "UPDATE script_template SET updated_at = CURRENT_TIMESTAMP WHERE id = ? AND userid = ?",
              [templateId, userId]
            );

            console.log(
              `[DEBUG] Successfully loaded template: ${templateInfo.name}`
            );
          } catch (jsonError) {
            console.error(
              "[DEBUG] Error parsing template_structure JSON:",
              jsonError
            );
            console.error(
              "[DEBUG] Raw template_structure:",
              templates[0].template_structure
            );
          }
        } else {
          console.warn(
            `[DEBUG] No template found for templateId: ${templateId}, userId: ${userId}`
          );
        }
      } catch (error) {
        console.error("[DEBUG] Database error while handling template:", error);
        // 不影響主要功能，繼續執行
      }
    } else {
      console.log(`[DEBUG] No templateId provided, using default prompt`);
    }

    // 建構給 AI 的提示詞（根據是否有模板資訊來調整）
    let aiPrompt;

        if (templateInfo) {
      // 使用模板資訊來增強提示詞
      aiPrompt = `Please use the following template 「${
        templateInfo.name
      }」to create a advertisment script and reply in tradtional chinese. The template structure includes the following sections:
${templateInfo.structure.sections
  .map(
    (section) =>
      `- ${section.title}: ${section.fields
        .map((field) => field.label)
        .join(", ")}`
  )
  .join("\n")}

The script will use the following information:
${synopsisString}

Plase make a complete advertisment script, ensure:
1. the correct script format (scene headings, character names, dialogue, action descriptions)
2. detailed scene descriptions and character actions
3. natural and fluent character dialogue 
4. appropriate scene transitions
5. professional script structure  
6. organize the script rhythm and development according to the template structure
7. pay attention to the time, Do not exceed the requested time limit
8. As this is a advertisment script, it should be concise and impactful, focusing on the key message.

This should be a shooting script. Aside from using the docuements in the RAG Engine, you chould use your own knowledge and experience to generate the script.There is no limit to how long each scene is, do as you please.`;
    } else {
      // 原來的提示詞
      aiPrompt = `請基於以下劇情概要結構，生成一個專業的詳細的電影劇本（Movie Script）。請確保劇本格式正確，包含場景描述、角色對話、動作指示等專業電影劇本元素：

${synopsisString}

請生成一個完整的電影劇本，包含：
1. 正確的劇本格式（場景標題、角色名稱、對話、動作描述）
2. 詳細的場景描述和角色動作
3. 自然流暢的角色對話
4. 適當的場景轉換
5. 專業的劇本結構

劇本應該適合拍攝製作使用。除了使用RAG Engine裡面的文件內容，你可以使用你的知識和經驗來生成劇本。請確保劇本符合專業標準，並遵循電影劇本的格式，並包含場景描述、角色對話、動作指示等專業電影劇本元素，劇本應該足夠長，每一個片段（SCENE）都不能太短。`;
    }

    // 用包裝後的 prompt 送給 RAG query function
    const result = await ragSystem.queryUserRAG(userId, aiPrompt, engineId);

    if (result.success) {
      res.json({
        success: true,
        message: "AI 回答成功",
        aiProcessedOutput: result.answer || result.data || result.response,
        originalInput: synopsisString,
        templateUsed: templateInfo?.name || null,
        engineId: engineId,
      });
    } else {
      res.status(500).json({
        success: false,
        message: result.error || "RAG 回答失敗",
      });
    }
  } catch (error) {
    console.error("Full error:", error);
    res.status(500).json({
      success: false,
      message: "Error processing movie script",
      error: error.message,
      details: error.details || "Unknown error",
    });
  }
});

module.exports = router;