const mysql = require('mysql2/promise');

// Debug database connection settings
console.log('[DEBUG] Database Config:', {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER,
  database: process.env.DB_NAME
});

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  acquireTimeout: 60000,
  timeout: 60000,
  reconnect: true
});

// Test connection
async function testConnection() {
  try {
    const connection = await pool.getConnection();
    console.log('[DEBUG] Database connected successfully to demo database!');
    
    // Test users table
    const [users] = await connection.execute('SELECT userid, username FROM users LIMIT 5');
    console.log('[DEBUG] Sample users:', users);
    
    connection.release();
  } catch (error) {
    console.error('[ERROR] Database connection failed:', error.message);
  }
}

testConnection();

module.exports = pool;