const mysql = require("mysql2/promise");

const dbConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME ,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  acquireTimeout: 60000,
  timeout: 60000,
  reconnect: true,
};

const pool = mysql.createPool(dbConfig);

// 測試資料庫連接
async function testConnection() {
  try {
    const connection = await pool.getConnection();
    console.log("Database connected successfully");
    const [users] = await connection.execute('SELECT userid, username FROM users LIMIT 1');
    console.log('[DEBUG] Sample users:', users);
    
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
