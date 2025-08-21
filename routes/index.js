var express = require("express");
var router = express.Router();
const { VertexAI } = require("@google-cloud/vertexai");
const { authenticateToken } = require("./middlewarecheck/middleware");

// Initialize Vertex AI
const vertexAI = new VertexAI({
  project: process.env.GOOGLE_CLOUD_PROJECT,
  location: process.env.GOOGLE_CLOUD_LOCATION || "us-central1",
});
// 確保環境變數已正確設置 (例如, GOOGLE_APPLICATION_CREDENTIALS)
// Set up generation config
const generationConfig = {
  maxOutputTokens: 8192,
  temperature: 1,
  topP: 1,
};

// 安全設定
const safetySettings = [
  {
    category: "HARM_CATEGORY_HATE_SPEECH",
    threshold: "BLOCK_NONE",
  },
  {
    category: "HARM_CATEGORY_DANGEROUS_CONTENT",
    threshold: "BLOCK_NONE",
  },
  {
    category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
    threshold: "BLOCK_NONE",
  },
  {
    category: "HARM_CATEGORY_HARASSMENT",
    threshold: "BLOCK_NONE",
  },
];

router.get("/", function (req, res, next) {
  res.render("index", { title: "RAG 系統測試界面" });
});

// 添加 ragtest 路由
router.get("/ragtest", function (req, res, next) {
  res.render("index", { title: "RAG 系統測試界面" });
});

/* GET API status check */
router.get("/api/status", function (req, res, next) {
  res.json({
    success: true,
    status: "operational",
    services: {
      database: "connected",
      vertexAI: "available",
      ragSystem: "operational",
    },
    timestamp: new Date().toISOString(),
  });
});

/* GET test API endpoint */
router.get("/api/test", function (req, res, next) {
  res.json({
    success: true,
    message: "API is working!",
    timestamp: new Date().toISOString(),
    availableServices: {
      basicGeneration: "/api/generate",
      synopsis: "/api/synopsis",
      synopsisFollowUp: "/api/synopsis/follow-up",
      ragServices: "/api/rag/*",
    },
  });
});

/* POST API for Vertex AI content generation */
router.post("/api/generate", async function (req, res, next) {
  try {
    console.log("正在初始化 Vertex AI...");

    const { prompt } = req.body;

    if (!prompt) {
      return res.status(400).json({
        success: false,
        error: "Prompt is required",
      });
    }

    const generativeModel = vertexAI.getGenerativeModel({
      model: "gemini-2.5-pro",
      generationConfig: generationConfig,
      safetySettings: safetySettings,
    });

    console.log("正在生成內容...");

    const result = await generativeModel.generateContentStream(prompt);

    let generatedText = "";

    for await (const chunk of result.stream) {
      if (
        chunk.candidates &&
        chunk.candidates[0] &&
        chunk.candidates[0].content
      ) {
        const parts = chunk.candidates[0].content.parts;
        for (const part of parts) {
          if (part.text) {
            generatedText += part.text;
          }
        }
      }
    }

    console.log("生成完成");

    res.json({
      success: true,
      text: generatedText,
      prompt: prompt,
    });
  } catch (error) {
    console.error("Vertex AI 錯誤:", error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      details: error.details || "Unknown error",
    });
  }
});

/* 新增：POST API for Synopsis processing - 處理完整的劇情概要 */
router.post(
  "/api/synopsis",
  authenticateToken,
  async function (req, res, next) {
    try {
      console.log("正在處理劇情概要...");

      const { synopsisString } = req.body;

      if (!synopsisString) {
        return res.status(400).json({
          success: false,
          message: "Synopsis string is required",
        });
      }

      // 建構給 AI 的提示詞 - 直接要求生成電影劇本
      const aiPrompt = `請基於以下劇情概要結構，生成一個專業的詳細的電影劇本（Movie Script）。請確保劇本格式正確，包含場景描述、角色對話、動作指示等專業電影劇本元素：

${synopsisString}

請生成一個完整的電影劇本，包含：
1. 正確的劇本格式（場景標題、角色名稱、對話、動作描述）
2. 詳細的場景描述和角色動作
3. 自然流暢的角色對話
4. 適當的場景轉換
5. 專業的劇本結構

劇本應該適合拍攝製作使用。`;

      const generativeModel = vertexAI.getGenerativeModel({
        model: "gemini-2.5-pro",
        generationConfig: generationConfig,
        safetySettings: safetySettings,
      });

      console.log("正在生成電影劇本...");

      const result = await generativeModel.generateContentStream(aiPrompt);

      let generatedText = "";

      for await (const chunk of result.stream) {
        if (
          chunk.candidates &&
          chunk.candidates[0] &&
          chunk.candidates[0].content
        ) {
          const parts = chunk.candidates[0].content.parts;
          for (const part of parts) {
            if (part.text) {
              generatedText += part.text;
            }
          }
        }
      }

      console.log("電影劇本生成完成");

      res.json({
        success: true,
        message: "Movie script generated successfully",
        aiProcessedOutput: generatedText,
        originalInput: synopsisString,
      });
    } catch (error) {
      console.error("電影劇本處理錯誤:", error.message);
      res.status(500).json({
        success: false,
        message: "Error processing movie script",
        error: error.message,
        details: error.details || "Unknown error",
      });
    }
  }
);

/* 新增：POST API for Synopsis follow-up - 處理後續指令 */
router.post(
  "/api/synopsis/follow-up",
  authenticateToken,
  async function (req, res, next) {
    try {
      console.log("正在處理劇本後續指令...");

      const { followUpString, engineId, previousResponse, templateId } = req.body;
      const userId = req.user.userId;

      if (!followUpString) {
        return res.status(400).json({
          success: false,
          message: "Follow-up instruction is required",
        });
      }

      if (!engineId) {
        return res.status(400).json({
          success: false,
          message: "engineId is required",
        });
      }

      console.log(`[DEBUG] Processing follow-up request:`, {
        userId,
        engineId,
        followUpLength: followUpString.length,
        hasPreviousResponse: !!previousResponse,
        templateId: templateId || "none",
      });

      // 如果提供了 templateId，獲取模板詳情
      let templateInfo = null;
      if (templateId) {
        try {
          console.log(`[DEBUG] Processing templateId for follow-up: ${templateId}`);

          const [templates] = await pool.execute(
            "SELECT scriptname, template_structure FROM script_template WHERE id = ? AND userid = ?",
            [templateId, userId]
          );

          if (templates.length > 0) {
            try {
              const rawTemplateStructure = templates[0].template_structure;
              let templateStructure;

              if (typeof rawTemplateStructure === "object" && rawTemplateStructure !== null) {
                templateStructure = rawTemplateStructure;
              } else if (typeof rawTemplateStructure === "string") {
                if (rawTemplateStructure === "[object Object]") {
                  throw new Error("Invalid template structure");
                } else {
                  templateStructure = JSON.parse(rawTemplateStructure);
                }
              } else {
                throw new Error("Unknown template structure format");
              }

              templateInfo = {
                name: templates[0].scriptname,
                structure: templateStructure,
              };

              console.log(`[DEBUG] Successfully loaded template for follow-up: ${templateInfo.name}`);
            } catch (jsonError) {
              console.error("[DEBUG] Error parsing template_structure JSON for follow-up:", jsonError);
            }
          }
        } catch (error) {
          console.error("[DEBUG] Database error while handling template for follow-up:", error);
        }
      }

      // 重用 MSWwithFIile.js 中的完整 ScriptCraft AI 提示詞邏輯
      let aiPrompt;
      
      // 構建包含 follow-up 指令的 synopsisString
      const followUpSynopsisString = `**Previous Context:**
${previousResponse ? previousResponse : 'This is a follow-up request for screenplay modification.'}

**User's Follow-up Instructions:**
${followUpString}

**Task:** Please address the user's follow-up instructions by modifying, expanding, or refining the screenplay content accordingly. Maintain professional screenplay formatting and narrative consistency.`;

      if (templateInfo) {
        // 使用模板資訊的完整提示詞（從 MSWwithFIile.js 複製）
        aiPrompt = `**Your Role:**
You are ScriptCraft AI, an advanced AI specializing in cinematic adaptation and original screenplay creation. Think of yourself not just as a writer, but as a filmmaker who understands narrative arcs, character psychology, visual language, and the art of dramatic tension. Your goal is to craft original, compelling screenplays that resonate with audiences.

**Your Core Mission:**
You will be provided with analyzed source material via a Retrieval-Augmented Generation (RAG) process. Your mission is to synthesize this information into a fully original, feature-length movie screenplay. This means identifying the most cinematic and emotionally impactful elements, then building a unique narrative around them. You are to create, not just report.

**Template Framework:**
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
${followUpSynopsisString}

**The Creative Process: Elevating Inspiration to Art**

**Deep Dive & Cinematic Identification:**
- Analyze the provided source material: Go beyond simply listing events. Identify the core conflicts, the central themes, the character's internal and external struggles, and their primary relationships.
- Pinpoint the "Cinematic Engine": What are the turning points, moments of significant change, dramatic confrontations, or visually striking set pieces within the source material? These are the building blocks of your screenplay.
- Establish a Clear Dramatic Arc: Structure your screenplay using a compelling three-act structure, focusing on a protagonist with clear goals and obstacles.

**Creative Transformation & Originality (The "Homage" Framework):**
- **Inspired, Not Imitated:** Your primary directive is to transform the source material into a novel cinematic experience. Avoid direct retelling or chronological recounting of events unless it serves a specific, dramatically justified purpose.
- **The "Homage" Clause:** You may strategically and sparingly incorporate elements from the source material as a deliberate "homage." This can include:
  * Iconic Phrases/Quotes: Use them only if they perfectly encapsulate a character's essence or a pivotal moment
  * Key Moments/Events: Select a few defining moments, but re-contextualize them
  * Thematic Echoes: Capture the spirit or underlying message of the source material

**Permitted Creative Additions (Crucial for Depth):**
- Develop Character Interiority: Explore characters' inner thoughts, motivations, fears, and desires
- Flesh out Relationships: Create nuanced and believable interactions between characters
- Invent/Enhance Supporting Characters: Create composite characters or entirely new ones to serve the narrative
- Craft Original Dialogue: Write dialogue that is sharp, reveals character, advances plot, and feels natural
- Create New Scenes: Bridge narrative gaps, build tension, establish mood, or explore character emotions
- Alter Timelines & Structure: Condense, expand, or reorder events for greater dramatic impact

**Template Integration:** Organize the screenplay structure and development rhythm according to the provided template framework, ensuring each section contributes to the overall narrative arc.

**Output Requirements:**
* Professional Screenplay Format with industry standards:
  - Scene Headings: INT./EXT. LOCATION - DAY/NIGHT (concise and specific)
  - Action Lines: Written in present tense, descriptive, visual, and economical. Focus on what the audience sees and hears
  - Character Names: Centered, capitalized, above dialogue
  - Dialogue: Centered, natural-sounding, and revealing of character
  - Parentheticals: Used sparingly for subtle direction on delivery

**Your Task:**
Analyze the provided source material and template framework. Based on the user's follow-up instructions, generate the requested screenplay modifications or additions. Focus on addressing their specific concerns while maintaining the tone, character consistency, and narrative quality. Your output should be substantial and detailed; aim for comprehensive screenplay content that seamlessly integrates with the existing work.`;
      } else {
        // 使用預設的完整提示詞（從 MSWwithFIile.js 複製）
        aiPrompt = `**Your Role:**

You are ScriptCraft AI, an advanced AI specializing in cinematic adaptation and original screenplay creation. Think of yourself not just as a writer, but as a filmmaker who understands narrative arcs, character psychology, visual language, and the art of dramatic tension. Your goal is to craft original, compelling, and comprehensive feature-length movie screenplays that resonate with audiences. You are an architect of cinematic worlds and a master of emotional storytelling.

**Your Core Mission:**

You will be provided with analyzed source material (e.g., biographies, historical accounts, novels, articles) via a Retrieval-Augmented Generation (RAG) process. Your mission is to synthesize this information into a fully original, feature-length movie screenplay. This means identifying the most cinematic and emotionally impactful elements, then building a unique, detailed, and expansively developed narrative around them. You are to create, not just report.

Crucially, you will often be provided with a detailed film outline or synopsis in the middle of our interaction. You must be prepared to receive and integrate this outline seamlessly, using it to guide the subsequent development of the screenplay, expanding upon its beats and characters with rich detail.

**Source Material:**
${followUpSynopsisString}

**The Creative Process: Elevating Inspiration to Art and Building a Complete World**

**Deep Dive & Cinematic Identification:**

- **Comprehensive Analysis:** Go beyond simply listing events. Identify the core conflicts, the central themes, the character's internal and external struggles, their primary relationships, and the inherent dramatic potential within the source material. What are the emotional stakes? What are the visual opportunities?
- **Pinpoint the "Cinematic Engine":** What are the turning points, moments of significant change, dramatic confrontations, visually striking set pieces, or moments of profound character revelation within the source material? These are the foundational building blocks of your screenplay.
- **Establish a Clear Dramatic Arc:** Structure your screenplay using a compelling three-act structure (or a variation thereof that best serves the story). Focus on a protagonist with clear goals and meaningful obstacles, and ensure a well-paced progression of rising action, climax, falling action, and resolution.

**Creative Transformation & Originality (The "Homage" Framework):**

- **Inspired, Not Imitated:** Your primary directive is to transform the source material into a novel cinematic experience. Avoid direct retelling or chronological recounting of events unless it serves a specific, dramatically justified purpose for narrative impact or thematic resonance. Your goal is to create something new and distinct.
- **The "Homage" Clause:** You may strategically and sparingly incorporate elements from the source material as a deliberate "homage." This can include:
  * **Iconic Phrases/Quotes:** Use them only if they perfectly encapsulate a character's essence or a pivotal moment, and ensure they fit organically into the new dialogue and are not gratuitous.
  * **Key Moments/Events:** Select a few defining moments, but re-contextualize them significantly. Change the circumstances, character reactions, consequences, or the sequence of events to make them uniquely yours.
  * **Thematic Echoes:** Capture the spirit or underlying message of the source material, but express it through your own plot, characters, and narrative choices.

**Permitted Creative Additions (Crucial for Depth, Detail, and Length):**

- **Develop Character Interiority with Depth:** Explore characters' inner thoughts, motivations, fears, desires, and subconscious drives. Create complex inner conflicts that may not be explicit in the source. Show their emotional journeys and transformations in detail.
- **Flesh Out Relationships with Nuance:** Create rich, believable, and evolving interactions between characters. Show, don't just tell, their bonds, rivalries, unspoken tensions, and changing dynamics. Develop subplots that explore these relationships.
- **Invent/Enhance Supporting Characters Extensively:** Create composite characters, entirely new characters, or significantly expand upon existing ones from the source to serve the narrative, represent specific themes, provide dramatic contrast, offer unique perspectives, or drive subplots.
- **Craft Original, Multi-layered Dialogue:** Write dialogue that is sharp, authentic, reveals character subtly, advances plot organically, and feels natural for the period and context. Dialogue should have subtext, emotional weight, and contribute significantly to the overall tone and pacing. Aim for conversations that feel lived-in and impactful.
- **Create New Scenes Generously:** Bridge narrative gaps, build tension, establish mood, explore character emotions, introduce new conflicts, and add thematic layers that the source material might not have covered. Inventing scenes is key to building a unique, detailed, and feature-length film.
- **Alter Timelines & Structure Strategically:** Condense, expand, reorder, or interweave events for greater dramatic impact, narrative flow, and thematic resonance. Non-linear storytelling or flashbacks/flash-forwards are acceptable if they serve the story and enhance its complexity.
- **Build Vivid Worlds and Atmospheres:** Describe settings with sensory detail, creating a strong sense of place and mood that enhances the storytelling.

**Maintaining Authenticity & Tone:**

- **Genre Focus & Consistent Tone:** Determine the most fitting genre (e.g., gritty crime drama, character-driven biopic, historical epic, thrilling adventure) based on the source material and maintain a consistent, compelling, and immersive tone throughout the entire screenplay.
- **Implied Emotion and Subtext:** Even with factual source material, imbue scenes and characters with genuine emotional weight and subtext. Allow the audience to feel what the characters are feeling, even when it's not explicitly stated.

**Output Requirements:**

* **Professional Screenplay Format:** Adhere strictly to industry-standard screenplay formatting:
  - **Scene Headings:** INT./EXT. LOCATION - DAY/NIGHT (concise and specific).
  - **Action Lines:** Written in the present tense, descriptive, visual, and economical. Focus on what the audience sees and hears. Prioritize vivid imagery and active verbs to convey action and emotion. Avoid internal thoughts in action lines; externalize them through actions or dialogue.
  - **Character Names:** Centered, capitalized, above dialogue.
  - **Dialogue:** Centered, natural-sounding, revealing of character, and appropriate for the narrative.
  - **Parentheticals:** Used sparingly for subtle direction on delivery or action directly tied to dialogue (e.g., (whispering), (slamming door)). Ensure they enhance, not dictate, the performance.
* **Narrative Depth and Completeness:** Ensure the screenplay has a clear beginning, rising action, multiple layers of conflict, a compelling climax, well-defined falling action, and a satisfying resolution. The protagonist's journey should be evident and complete, demonstrating significant character development. Aim for a screenplay that feels like a fully realized film, not just a series of connected scenes.

**Your Task:**

Analyze the provided source material. Based on the user's follow-up instructions, generate the requested screenplay modifications, expansions, or refinements. Focus on addressing their specific concerns while maintaining professional screenplay formatting and narrative consistency. Remember, the goal is comprehensive screenplay content that seamlessly integrates with existing work and enhances the overall narrative quality.`;
      }

      // 使用 RAG 系統處理後續指令
      const MultiUserRAGSystem = require("./rag/MultiUserRAGSystem");
      const ragSystem = new MultiUserRAGSystem();

      const result = await ragSystem.queryUserRAG(userId, aiPrompt, engineId);

      if (result.success) {
        console.log("劇本後續指令處理完成");

        res.json({
          success: true,
          message: "Script follow-up processed successfully",
          aiProcessedOutput: result.answer || result.data || result.response,
          originalFollowUp: followUpString,
          templateUsed: templateInfo?.name || null,
          engineId: engineId,
        });
      } else {
        res.status(500).json({
          success: false,
          message: result.error || "RAG 後續指令處理失敗",
        });
      }
    } catch (error) {
      console.error("劇本後續指令處理錯誤:", error.message);
      res.status(500).json({
        success: false,
        message: "Error processing script follow-up",
        error: error.message,
        details: error.details || "Unknown error",
      });
    }
  }
);

/* GET API for simple Vertex AI test */
router.get("/api/test-vertex", async function (req, res, next) {
  try {
    console.log("正在測試 Vertex AI 連接...");

    const generativeModel = vertexAI.getGenerativeModel({
      model: "gemini-2.5-pro",
      generationConfig: generationConfig,
      safetySettings: safetySettings,
    });

    const testPrompt = "Hello! Please introduce yourself in one sentence.";
    const result = await generativeModel.generateContentStream(testPrompt);

    let generatedText = "";

    for await (const chunk of result.stream) {
      if (
        chunk.candidates &&
        chunk.candidates[0] &&
        chunk.candidates[0].content
      ) {
        const parts = chunk.candidates[0].content.parts;
        for (const part of parts) {
          if (part.text) {
            generatedText += part.text;
          }
        }
      }
    }

    res.json({
      success: true,
      text: generatedText,
      message: "Vertex AI connection test successful!",
    });
  } catch (error) {
    console.error("Vertex AI 測試錯誤:", error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      details: error.details || "Unknown error",
    });
  }
});

/* GET API to check current model */
router.get("/api/model-info", function (req, res, next) {
  res.json({
    success: true,
    currentModel: "gemini-2.5-flash-preview-05-20",
    modelType: "Gemini 2.5 Flash Preview",
    description: "Latest Gemini 2.5 Flash preview model with RAG capabilities",
    timestamp: new Date().toISOString(),
    ragEnabled: true,
  });
});

module.exports = router;
