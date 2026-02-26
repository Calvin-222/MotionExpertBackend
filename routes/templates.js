const express = require("express");
const router = express.Router();
const { pool } = require("../config/database");
const jwt = require("jsonwebtoken");

// Token 驗證中間件
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Access token required",
    });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({
        success: false,
        message: "Invalid token",
      });
    }
    req.user = decoded;
    next();
  });
};

// 1. 獲取用戶的所有模板（包含公共模板）
router.get("/users/:userId", authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;

    // 檢查是否為當前用戶或有權限
    if (req.user.userId !== userId) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    // 查詢用戶自己的模板 + 公共模板 (userid = 'SYSTEM')
    const [templates] = await pool.execute(
      `SELECT *, 
        CASE WHEN userid = 'SYSTEM' THEN 1 ELSE 0 END as is_public
       FROM script_template 
       WHERE userid = ? OR userid = 'SYSTEM' 
       ORDER BY is_public ASC, is_default DESC, created_at DESC`,
      [userId],
    );

    console.log(
      `[DEBUG] Found ${templates.length} templates for user ${userId} (including public templates)`,
    );

    res.json({
      success: true,
      templates: templates,
    });
  } catch (error) {
    console.error("Error loading templates:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// 2. 獲取單個模板詳情
router.get("/:templateId", authenticateToken, async (req, res) => {
  try {
    const { templateId } = req.params;

    const [templates] = await pool.execute(
      "SELECT * FROM script_template WHERE id = ?",
      [templateId],
    );

    if (templates.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Template not found",
      });
    }

    // 檢查權限：允許查看自己的模板或公共模板
    const template = templates[0];
    if (req.user.userId !== template.userid && template.userid !== "SYSTEM") {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    res.json({
      success: true,
      template: template,
    });
  } catch (error) {
    console.error("Error loading template:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// 3. 創建新模板
router.post("/", authenticateToken, async (req, res) => {
  try {
    const { userid, scriptname, template_structure, is_default } = req.body;

    // 檢查權限
    if (req.user.userId !== userid) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    // 驗證必要欄位
    if (!scriptname || !template_structure) {
      return res.status(400).json({
        success: false,
        message: "Script name and template structure are required",
      });
    }

    // 如果設為預設，先將其他模板的 is_default 設為 false
    if (is_default) {
      await pool.execute(
        "UPDATE script_template SET is_default = FALSE WHERE userid = ?",
        [userid],
      );
    }

    const [result] = await pool.execute(
      "INSERT INTO script_template (userid, scriptname, template_structure, is_default) VALUES (?, ?, ?, ?)",
      [userid, scriptname, template_structure, is_default || false],
    );

    console.log(
      `[DEBUG] Created new template with ID: ${result.insertId} for user: ${userid}`,
    );

    res.json({
      success: true,
      message: "Template created successfully",
      templateId: result.insertId,
    });
  } catch (error) {
    console.error("Error creating template:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// 4. 更新模板
router.put("/:templateId", authenticateToken, async (req, res) => {
  try {
    const { templateId } = req.params;
    const { scriptname, template_structure, is_default } = req.body;

    // 先檢查模板是否存在且屬於當前用戶
    const [existingTemplates] = await pool.execute(
      "SELECT userid FROM script_template WHERE id = ?",
      [templateId],
    );

    if (existingTemplates.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Template not found",
      });
    }

    // 防止修改公共模板
    if (existingTemplates[0].userid === "SYSTEM") {
      return res.status(403).json({
        success: false,
        message: "Cannot modify public templates",
      });
    }

    if (req.user.userId !== existingTemplates[0].userid) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    // 驗證必要欄位
    if (!scriptname || !template_structure) {
      return res.status(400).json({
        success: false,
        message: "Script name and template structure are required",
      });
    }

    // 如果設為預設，先將其他模板的 is_default 設為 false
    if (is_default) {
      await pool.execute(
        "UPDATE script_template SET is_default = FALSE WHERE userid = ? AND id != ?",
        [req.user.userId, templateId],
      );
    }

    await pool.execute(
      "UPDATE script_template SET scriptname = ?, template_structure = ?, is_default = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [scriptname, template_structure, is_default || false, templateId],
    );

    console.log(`[DEBUG] Updated template ID: ${templateId}`);

    res.json({
      success: true,
      message: "Template updated successfully",
    });
  } catch (error) {
    console.error("Error updating template:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// 5. 刪除模板
router.delete("/:templateId", authenticateToken, async (req, res) => {
  try {
    const { templateId } = req.params;

    // 先檢查模板是否存在且屬於當前用戶
    const [existingTemplates] = await pool.execute(
      "SELECT userid FROM script_template WHERE id = ?",
      [templateId],
    );

    if (existingTemplates.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Template not found",
      });
    }

    // 防止刪除公共模板
    if (existingTemplates[0].userid === "SYSTEM") {
      return res.status(403).json({
        success: false,
        message: "Cannot delete public templates",
      });
    }

    if (req.user.userId !== existingTemplates[0].userid) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    await pool.execute("DELETE FROM script_template WHERE id = ?", [
      templateId,
    ]);

    console.log(`[DEBUG] Deleted template ID: ${templateId}`);

    res.json({
      success: true,
      message: "Template deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting template:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// 6. 為新用戶創建預設模板
router.post("/create-default", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    // 檢查用戶是否已有模板
    const [existingTemplates] = await pool.execute(
      "SELECT id FROM script_template WHERE userid = ? LIMIT 1",
      [userId],
    );

    if (existingTemplates.length > 0) {
      return res.json({
        success: true,
        message: "User already has templates",
      });
    }

    // 創建預設模板結構
    const defaultTemplateStructure = {
      templateName: "Classic Three-Act Structure",
      sections: [
        {
          id: "act1",
          type: "section",
          title: "Act 1: Setup",
          order: 1,
          layoutClass: "half-width",
          fields: [
            {
              id: "openingScene",
              type: "textarea",
              label: "Opening Scene",
              placeholder: "Describe the opening scene...",
              required: false,
              order: 1,
            },
            {
              id: "initiation",
              type: "textarea",
              label: "Initiation",
              placeholder: "How does the story begin for the protagonist?",
              required: false,
              order: 2,
            },
          ],
        },
        {
          id: "act2",
          type: "section",
          title: "Act 2: Confrontation and Barrier",
          order: 2,
          layoutClass: "half-width",
          fields: [
            {
              id: "processAndAchievements",
              type: "textarea",
              label: "Process and Achievements",
              placeholder: "Detail the protagonist's journey and successes...",
              required: false,
              order: 1,
            },
            {
              id: "obstaclesAndChallenges",
              type: "textarea",
              label: "Obstacles and Challenges",
              placeholder: "What hurdles does the protagonist face?",
              required: false,
              order: 2,
            },
          ],
        },
        {
          id: "act3a",
          type: "section",
          title: "Act 3A: Climax",
          order: 3,
          layoutClass: "half-width",
          fields: [
            {
              id: "turningPointAndDiscovery",
              type: "textarea",
              label: "Turning Point and Discovery",
              placeholder: "What is the major turning point or discovery?",
              required: false,
              order: 1,
            },
            {
              id: "inmostCave",
              type: "textarea",
              label: "Inmost Cave",
              placeholder:
                "Describe the protagonist's lowest point or greatest challenge...",
              required: false,
              order: 2,
            },
          ],
        },
        {
          id: "act3b",
          type: "section",
          title: "Act 3B: Aftermath",
          order: 4,
          layoutClass: "half-width",
          fields: [
            {
              id: "finalBattle",
              type: "textarea",
              label: "Final Battle",
              placeholder: "Detail the final confrontation...",
              required: false,
              order: 1,
            },
            {
              id: "endingScene",
              type: "textarea",
              label: "Ending Scene",
              placeholder: "Describe the resolution and ending...",
              required: false,
              order: 2,
            },
            {
              id: "isAntiClimax",
              type: "checkbox",
              label: "Anti-climax",
              placeholder: "",
              required: false,
              order: 3,
            },
          ],
        },
        {
          id: "additionalDetails",
          type: "section",
          title: "Additional Details",
          order: 5,
          layoutClass: "full-width",
          fields: [
            {
              id: "themeAndMessage",
              type: "textarea",
              label: "Theme and Message",
              placeholder: "What is the core theme or message?",
              required: false,
              order: 1,
            },
            {
              id: "oneLiner",
              type: "textarea",
              label: "One-liner",
              placeholder: "Summarize the story in one sentence.",
              required: false,
              order: 2,
            },
            {
              id: "periodOfScene",
              type: "textarea",
              label: "Period of Scene",
              placeholder: "e.g., Present day, 1950s, Distant future",
              required: false,
              order: 3,
            },
            {
              id: "teasingAction",
              type: "textarea",
              label: "Teasing Action",
              placeholder: "A hint of an exciting action sequence...",
              required: false,
              order: 4,
            },
            {
              id: "teasingDialogue",
              type: "textarea",
              label: "Teasing Dialogue",
              placeholder: "A memorable line of dialogue...",
              required: false,
              order: 5,
            },
          ],
        },
      ],
    };

    await pool.execute(
      "INSERT INTO script_template (userid, scriptname, template_structure, is_default) VALUES (?, ?, ?, ?)",
      [
        userId,
        "Classic Three-Act Structure",
        JSON.stringify(defaultTemplateStructure),
        true,
      ],
    );

    console.log(`[DEBUG] Created default template for user: ${userId}`);

    res.json({
      success: true,
      message: "Default template created successfully",
    });
  } catch (error) {
    console.error("Error creating default template:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// 7. 設置模板為預設
router.patch(
  "/:templateId/set-default",
  authenticateToken,
  async (req, res) => {
    try {
      const { templateId } = req.params;

      // 先檢查模板是否存在且屬於當前用戶
      const [existingTemplates] = await pool.execute(
        "SELECT userid FROM script_template WHERE id = ?",
        [templateId],
      );

      if (existingTemplates.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Template not found",
        });
      }

      if (req.user.userId !== existingTemplates[0].userid) {
        return res.status(403).json({
          success: false,
          message: "Access denied",
        });
      }

      // 先將所有模板設為非預設
      await pool.execute(
        "UPDATE script_template SET is_default = FALSE WHERE userid = ?",
        [req.user.userId],
      );

      // 將指定模板設為預設
      await pool.execute(
        "UPDATE script_template SET is_default = TRUE WHERE id = ?",
        [templateId],
      );

      console.log(
        `[DEBUG] Set template ${templateId} as default for user ${req.user.userId}`,
      );

      res.json({
        success: true,
        message: "Template set as default successfully",
      });
    } catch (error) {
      console.error("Error setting default template:", error);
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  },
);

module.exports = router;
