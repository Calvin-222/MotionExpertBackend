const mysql = require("mysql2/promise");

// 載入環境變數（如果尚未載入）
if (!process.env.DB_HOST) {
  require('dotenv').config();
}

// 除錯：顯示資料庫配置
console.log("[DEBUG] Database config:");
console.log("  DB_HOST:", process.env.DB_HOST);
console.log("  DB_USER:", process.env.DB_USER);
console.log("  DB_PASSWORD:", process.env.DB_PASSWORD ? "***" : "undefined");
console.log("  DB_NAME:", process.env.DB_NAME);
console.log("  DB_PORT:", process.env.DB_PORT);

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

const pool = mysql.createPool(dbConfig);

// 測試資料庫連接
async function testConnection() {
  try {
    const connection = await pool.getConnection();
    console.log("Database connected successfully");
    const [users] = await connection.execute(
      "SELECT userid, username FROM users LIMIT 1"
    );
    console.log("[DEBUG] Sample users:", users);

    connection.release();
    return true;
  } catch (error) {
    console.error("Database connection failed:", error.message);
    return false;
  }
}
testConnection();

module.exports = {
  pool,
  testConnection,
  dbConfig,
};
