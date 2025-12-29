require('dotenv').config();
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');

async function createAdminUser() {
  const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306,
  };

  console.log("Connecting to database...");
  
  try {
    const connection = await mysql.createConnection(dbConfig);
    
    const username = "MEL_Admin";
    const password = "MEL.adm135#"; 
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    console.log(`Creating admin user '${username}'...`);

    // Check if exists first
    const [existing] = await connection.execute("SELECT userid FROM users WHERE username = ?", [username]);
    
    let userId;

    if (existing.length > 0) {
        console.log("User already exists. Updating password...");
        userId = existing[0].userid;
        await connection.execute("UPDATE users SET password = ? WHERE userid = ?", [hashedPassword, userId]);
    } else {
        await connection.execute(
            "INSERT INTO users (username, password) VALUES (?, ?)",
            [username, hashedPassword]
        );
        const [newUser] = await connection.execute("SELECT userid FROM users WHERE username = ?", [username]);
        userId = newUser[0].userid;
    }

    console.log("\nSUCCESS! Admin user ready.");
    console.log("---------------------------------------------------");
    console.log(`Username: ${username}`);
    console.log(`Password: ${password}`);
    console.log(`UserID:   ${userId}`);
    console.log("---------------------------------------------------");
    console.log("\n>>> ACTION REQUIRED <<<");
    console.log(`Please add the following line to your backend .env file:`);
    console.log(`ADMIN_USER_ID=${userId}`);
    console.log("---------------------------------------------------");

    await connection.end();

  } catch (error) {
    console.error("Error:", error.message);
  }
}

createAdminUser();
