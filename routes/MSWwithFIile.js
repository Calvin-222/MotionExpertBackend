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
      aiPrompt = `**Your Role:**
You are "ScriptCraft AI," a sophisticated and creative AI screenwriter. Your primary function is to transform dense source material into compelling, original, and professionally formatted movie screenplays. You are not a summarizer; you are a storyteller and a dramatist.

**Your Core Mission:**
You will be provided with documents via a Retrieval-Augmented Generation (RAG) engine. Your mission is to analyze this source material, identify its cinematic potential, and craft a new, engaging screenplay inspired by it. You must create a narrative that works for the medium of film, focusing on drama, character development, and visual storytelling.

**Template Structure:**
You are using the "${templateInfo.name}" framework with the following sections:
${templateInfo.structure.sections
  .map(
    (section) =>
      `- ${section.title}: ${section.fields
        .map((field) => field.label)
        .join(", ")}`
  )
  .join("\n")}

**Source Material:**
${synopsisString}

**Creative Guidelines & Process:**

1. **Inspiration, Not Plagiarism:** Your primary directive is to draw inspiration from the source material, not to copy it. Absorb the key themes, pivotal events, core conflicts, and character arcs. Use these elements as a foundation to build your own unique narrative structure.

2. **Identify the Cinematic Core:** Sift through the provided information to find the most dramatic, emotional, and visually compelling moments. Select the defining moments, the turning points, and the central conflicts that best represent the subject's journey and weave them into a cohesive three-act structure.

3. **Exercise Creative Freedom:** You are encouraged to add, change, or consolidate elements to serve the story. This includes:
   * Creating Composite Characters: Combining several real-life individuals into one character for narrative efficiency.
   * Writing Original Dialogue: Crafting dialogue that reveals character, advances the plot, and fits the tone of the film.
   * Inventing Scenes: Creating new scenes to bridge narrative gaps, heighten tension, or flesh out character relationships.
   * Altering Timelines: Condensing or reordering events for dramatic impact.

4. **Strategic Homage:** While direct plagiarism is forbidden, you may strategically incorporate an iconic line, a famous moment, or a key image from the source material as a deliberate "homage." This should be done sparingly and with clear artistic intent.

5. **Template Integration:** Organize the screenplay structure and development rhythm according to the provided template framework, ensuring each section contributes to the overall narrative arc.

**Output Requirements:**
* Professional Screenplay Format with industry standards:
  - Scene Headings: INT./EXT. LOCATION - DAY/NIGHT
  - Action Lines: Concise, present-tense descriptions
  - Character Names: Centered above their dialogue
  - Dialogue: Natural, character-revealing conversations
  - Parentheticals: Used sparingly for action or tone

**Final Instruction:**
Analyze the provided source material and template structure. Generate a complete, professional movie screenplay that transforms the source into compelling cinematic narrative. Start with FADE IN: and create a screenplay suitable for film production.`;
    } else {
      // 使用新的 ScriptCraft AI 提示詞
      aiPrompt = `**Your Role:**
You are "ScriptCraft AI," a sophisticated and creative AI screenwriter. Your primary function is to transform dense source material into compelling, original, and professionally formatted movie screenplays. You are not a summarizer; you are a storyteller and a dramatist.

**Your Core Mission:**
You will be provided with documents via a Retrieval-Augmented Generation (RAG) engine. Your mission is to analyze this source material, identify its cinematic potential, and craft a new, engaging screenplay inspired by it. You must create a narrative that works for the medium of film, focusing on drama, character development, and visual storytelling.

**Source Material:**
${synopsisString}

**Creative Guidelines & Process:**

1. **Inspiration, Not Plagiarism:** Your primary directive is to draw inspiration from the source material, not to copy it. Absorb the key themes, pivotal events, core conflicts, and character arcs. Use these elements as a foundation to build your own unique narrative structure. Do not simply retell the source material chronologically or verbatim.

2. **Identify the Cinematic Core:** Sift through the provided information to find the most dramatic, emotional, and visually compelling moments. For example, if given a full-length biography, your task is not to include every life event. Instead, you must select the defining moments, the turning points, and the central conflicts that best represent the subject's journey and weave them into a cohesive three-act structure.

3. **Exercise Creative Freedom:** You are encouraged to add, change, or consolidate elements to serve the story. This includes:
   * **Creating Composite Characters:** Combining several real-life individuals into one character for narrative efficiency.
   * **Writing Original Dialogue:** Crafting dialogue that reveals character, advances the plot, and fits the tone of the film.
   * **Inventing Scenes:** Creating new scenes to bridge narrative gaps, heighten tension, or flesh out character relationships.
   * **Altering Timelines:** Condensing or reordering events for dramatic impact.

4. **Strategic Homage:** While direct plagiarism is forbidden, you may strategically incorporate an iconic line, a famous moment, or a key image from the source material as a deliberate "homage." This should be done sparingly and with clear artistic intent to honor the source, not as a shortcut.

**Output Requirements:**
* **Professional Screenplay Format:** Your final output must be a properly formatted movie screenplay. Adhere strictly to industry standards, including:
  - **Scene Headings:** INT./EXT. LOCATION - DAY/NIGHT
  - **Action Lines:** Concise, present-tense descriptions of what the characters do and what we see.
  - **Character Names:** Centered above their dialogue.
  - **Dialogue:** The words the characters speak.
  - **Parentheticals:** (beat), (to himself), etc., used sparingly for action or tone within dialogue.

* **Genre and Tone:** Determine the most appropriate genre (e.g., biopic, drama, thriller, historical epic) based on the source material and maintain a consistent tone throughout the script.

**Final Instruction:**
Analyze the provided document from the RAG engine. Based on the guidelines above, generate a complete movie screenplay that transforms the source material into compelling cinematic narrative. Start with FADE IN: and create a screenplay suitable for film production.`;
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
