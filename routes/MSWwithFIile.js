const express = require("express");
const multer = require("multer");
const fs = require("fs");
const axios = require("axios");
const FormData = require("form-data");
const router = express.Router();

const upload = multer({ dest: "uploads/" });

// 上傳檔案到 RagCorpus
async function uploadFileToRagCorpus(file) {
  const formData = new FormData();
  formData.append("file", fs.createReadStream(file.path));
  // 取得 parent id (建議放在 .env)
  const parentId =
    process.env.RAG_PARENT_ID ||
    "projects/motionexpaiweb/locations/us-central1/ragCorpora/default";
  const apiUrl = `https://vertexai.googleapis.com/v1beta1/${parentId}/ragFiles:upload`;
  // 取得 Google Cloud access token
  const { GoogleAuth } = require("google-auth-library");
  const auth = new GoogleAuth({
    scopes: "https://www.googleapis.com/auth/cloud-platform",
  });
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  const response = await axios.post(apiUrl, formData, {
    headers: {
      ...formData.getHeaders(),
      Authorization: `Bearer ${token.token || token}`,
    },
  });
  // 回傳檔案 reference（ID）
  return response.data.fileReference || response.data.name;
}

// AI 劇本生成，支援 fileReference
async function generateMovieScript(synopsisString, fileReference) {
  // 建構 prompt
  const aiPrompt = `請基於以下劇情概要結構，生成一個專業的詳細的電影劇本（Movie Script）。請確保劇本格式正確，包含場景描述、角色對話、動作指示等專業電影劇本元素：\n\n${synopsisString}\n\n請生成一個完整的電影劇本，包含：\n1. 正確的劇本格式（場景標題、角色名稱、對話、動作描述）\n2. 詳細的場景描述和角色動作\n3. 自然流暢的角色對話\n4. 適當的場景轉換\n5. 專業的劇本結構\n\n劇本應該適合拍攝製作使用。`;

  // payload 可根據 API 文件調整
  const payload = {
    prompt: aiPrompt,
    fileReference: fileReference || undefined,
  };
  // parentId 取自 .env
  const parentId =
    process.env.RAG_PARENT_ID ||
    "projects/motionexpaiweb/locations/us-central1";
  const apiUrl = `https://vertexai.googleapis.com/v1beta1/${parentId}:augmentPrompt`;
  const { GoogleAuth } = require("google-auth-library");
  const auth = new GoogleAuth({
    scopes: "https://www.googleapis.com/auth/cloud-platform",
  });
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  const response = await axios.post(apiUrl, payload, {
    headers: {
      Authorization: `Bearer ${token.token || token}`,
      "Content-Type": "application/json",
    },
  });
  return response.data.answer || response.data;
}

// 刪除 RagCorpus 檔案
async function deleteRagFile(fileReference) {
  const { GoogleAuth } = require("google-auth-library");
  const auth = new GoogleAuth({
    scopes: "https://www.googleapis.com/auth/cloud-platform",
  });
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  const apiUrl = `https://vertexai.googleapis.com/v1beta1/${fileReference}`;
  await axios.delete(apiUrl, {
    headers: {
      Authorization: `Bearer ${token.token || token}`,
    },
  });
}

// 主要 router
router.post("/askai", upload.single("file"), async (req, res) => {
  try {
    const { synopsisString } = req.body;
    const file = req.file;

    if (!synopsisString) {
      return res.status(400).json({
        success: false,
        message: "Synopsis string is required",
      });
    }

    let fileReference = null;
    if (file) {
      fileReference = await uploadFileToRagCorpus(file);
    }

    const aiResponse = await generateMovieScript(synopsisString, fileReference);

    // 檔案只用一次，問完即刪
    if (fileReference) {
      await deleteRagFile(fileReference);
    }

    res.json({
      success: true,
      message: "Movie script generated successfully",
      aiProcessedOutput: aiResponse,
      originalInput: synopsisString,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error processing movie script",
      error: error.message,
      details: error.details || "Unknown error",
    });
  }
});

module.exports = router;
