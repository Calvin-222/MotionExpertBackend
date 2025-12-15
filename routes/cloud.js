const express = require("express");
const router = express.Router();
const { authenticateToken } = require("./middlewarecheck/middleware");
const { Storage } = require("@google-cloud/storage");

// Initialize Google Cloud Storage
const storage = new Storage({
  projectId: "motionexpaiweb",
  keyFilename: "./motionexpaiweb-471ee0d1e3d6.json",
});
const bucketName = "motion_expert_generated_data";

// List Cloud Files API
// Frontend calls: /api/cloud/files?bucket=motion_expert_generated_data
router.get("/files", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const bucket = req.query.bucket || bucketName;

    // Ensure the bucket exists or handle error if it doesn't
    const [files] = await storage
      .bucket(bucket)
      .getFiles({ prefix: `${userId}/` });

    const fileList = files.map((file) => ({
      name: file.name,
      updated: file.metadata.updated,
      timeCreated: file.metadata.timeCreated,
      size: file.metadata.size,
      simpleName: file.name.split("/").pop(),
    }));

    res.json({ success: true, files: fileList });
  } catch (error) {
    console.error("Error listing cloud files:", error);
    res.status(500).json({
      success: false,
      message: "Failed to list files",
      error: error.message,
    });
  }
});

// Save to Cloud API
// Frontend calls: /api/cloud/save (inferred from logs)
router.post("/save", authenticateToken, async (req, res) => {
  try {
    // Frontend sends: { content, filename, bucket }
    // Backend expected: { text, title }
    // Mapping: content -> text, filename -> title
    const { text, title, content, filename } = req.body;
    const userId = req.user.userId;

    const textContent = text || content;
    const fileTitle = title || filename;

    if (!textContent || !fileTitle) {
      return res.status(400).json({
        success: false,
        message: "Text/Content and title/filename are required",
      });
    }

    // If filename is provided and looks like a full path or filename, use it directly or sanitize it
    // The frontend sends `synopsis_${Date.now()}.txt` as filename.
    // The backend logic was: `${userId}/${timestamp}_${safeTitle}.txt`

    let finalFilename;
    if (filename) {
      // If frontend provides filename, we might want to respect it but ensure it's in user's folder
      // Sanitize filename just in case
      const safeFilename = filename.replace(/[^a-zA-Z0-9-_\.]/g, "_");
      finalFilename = `${userId}/${safeFilename}`;
    } else {
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const safeTitle = fileTitle.replace(/[^a-zA-Z0-9-_]/g, "_");
      finalFilename = `${userId}/${timestamp}_${safeTitle}.txt`;
    }

    const file = storage.bucket(bucketName).file(finalFilename);

    await file.save(textContent, {
      metadata: {
        contentType: "text/plain",
      },
    });

    res.json({
      success: true,
      message: "File saved successfully",
      filename: finalFilename,
    });
  } catch (error) {
    console.error("Error saving to cloud:", error);
    res.status(500).json({
      success: false,
      message: "Failed to save file",
      error: error.message,
    });
  }
});

module.exports = router;
