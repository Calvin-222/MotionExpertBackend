const express = require("express");
const router = express.Router();
const multer = require("multer");
const { Storage } = require("@google-cloud/storage");
const storage = new Storage();
const { pool } = require("../config/database");
const path = require("path");

// Google Cloud Storage 設定
const BUCKET_NAME = "motion_expert_user_icon";

// Multer 設定（記憶體儲存）
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, 
});

// 上傳頭像 API
router.post("/avatar", upload.single("avatar"), async (req, res) => {
  try {
    const userId = req.body.userId;
    const file = req.file;

    if (!userId || !file) {
      return res
        .status(400)
        .json({ success: false, error: "缺少 userId 或檔案" });
    }

    // 取得副檔名
    const ext = path.extname(file.originalname) || ".jpg";
    const gcsFileName = `${userId}${ext}`;
    const bucketFile = storage.bucket(BUCKET_NAME).file(gcsFileName);

    // 上傳到 GCS
    await bucketFile.save(file.buffer, {
      contentType: file.mimetype,
      metadata: {
        uploadedBy: userId,
        originalName: file.originalname,
        uploadTime: new Date().toISOString(),
      },
    });

    // 產生公開 URL（可根據需求改成簽名URL）
    const publicUrl = `https://storage.googleapis.com/${BUCKET_NAME}/${gcsFileName}`;

    // 更新資料庫 users.avatarurl 欄位
    await pool.execute("UPDATE users SET avatarurl = ? WHERE userid = ?", [
      publicUrl,
      userId,
    ]);

    res.json({
      success: true,
      message: "頭像上傳成功",
      avatarurl: publicUrl,
    });
  } catch (error) {
    console.error("上傳頭像失敗:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 取得用戶頭像 API
router.get("/:userId/avatar", async (req, res) => {
  const userId = req.params.userId;
  const fileName = `${userId}.jpg`;
  const file = storage.bucket(BUCKET_NAME).file(fileName);
  const options = {
    version: "v4",
    action: "read",
    expires: Date.now() + 10 * 60 * 1000, // 10分鐘有效
  };

  try {
    // 檢查檔案是否存在
    const [exists] = await file.exists();
    if (!exists) {
      // 直接回傳 default avatar 路徑，讓前端不用判斷
      return res.json({
        success: false,
        avatarurl: "/stylesheets/default-avatar.jpg",
        error: "找不到頭像",
      });
    }
    const [url] = await file.getSignedUrl(options);
    res.json({ success: true, avatarurl: url });
  } catch (err) {
    res.json({
      success: false,
      avatarurl: "/stylesheets/default-avatar.jpg",
      error: "找不到頭像",
    });
  }
});

/* GET users listing. */
router.get("/", function (req, res, next) {
  res.send("respond with a resource");
});

module.exports = router;
