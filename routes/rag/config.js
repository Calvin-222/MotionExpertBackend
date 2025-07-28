const mysql = require("mysql2/promise");
const { VertexAI } = require("@google-cloud/vertexai");
const { GoogleAuth } = require("google-auth-library");
const { Storage } = require("@google-cloud/storage");

// 環境變數檢查
if (!process.env.DB_HOST) {
  require("dotenv").config();
}

// debug log
console.log(
  "[DEBUG] RAG DB config:",
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  process.env.DB_HOST
);

// 資料庫配置
const dbConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: "utf8mb4",
};

// 創建資料庫連接池
const dbPool = mysql.createPool(dbConfig);

// Google Cloud 配置
const PROJECT_ID = "motionexpaiweb";
const LOCATION = "us-central1";
const BUCKET_NAME = "motionexpert-rag-documents";

// 初始化 Google Cloud 服務
const storage = new Storage({
  projectId: PROJECT_ID,
  keyFilename: "./motionexpaiweb-471ee0d1e3d6.json",
});

const auth = new GoogleAuth({
  keyFile: "./motionexpaiweb-471ee0d1e3d6.json",
  scopes: ["https://www.googleapis.com/auth/cloud-platform"],
});

const vertexAI = new VertexAI({
  project: PROJECT_ID,
  location: LOCATION,
});

// 動態 RAG Engine 管理
let CURRENT_CORPUS_ID = "2305843009213693952";
let CURRENT_CORPUS_NAME = `projects/${PROJECT_ID}/locations/${LOCATION}/ragCorpora/${CURRENT_CORPUS_ID}`;

module.exports = {
  dbConfig,
  dbPool,
  PROJECT_ID,
  LOCATION,
  BUCKET_NAME,
  storage,
  auth,
  vertexAI,
  CURRENT_CORPUS_ID,
  CURRENT_CORPUS_NAME,
};
