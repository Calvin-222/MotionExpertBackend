// 修復 script_template 表的自增 ID 問題
require("dotenv").config();
const { pool } = require("./config/database");

async function fixAutoIncrement() {
  try {
    console.log("開始修復 script_template 表的自增設置...");

    // 1. 檢查當前表中的最大 ID
    const [maxIdResult] = await pool.execute(
      "SELECT MAX(id) as maxId FROM script_template",
    );
    const maxId = maxIdResult[0].maxId || 0;
    console.log(`當前最大 ID: ${maxId}`);

    // 2. 設置自增起始值為 maxId + 1
    const nextId = maxId + 1;
    await pool.execute(
      `ALTER TABLE script_template AUTO_INCREMENT = ${nextId}`,
    );
    console.log(`已將自增起始值設置為: ${nextId}`);

    // 3. 驗證修復
    const [tableStatus] = await pool.execute(
      "SHOW TABLE STATUS LIKE 'script_template'",
    );
    console.log("表狀態:", {
      Name: tableStatus[0].Name,
      Auto_increment: tableStatus[0].Auto_increment,
      Rows: tableStatus[0].Rows,
    });

    console.log("✅ 修復完成！");
    process.exit(0);
  } catch (error) {
    console.error("❌ 修復失敗:", error);
    process.exit(1);
  }
}

fixAutoIncrement();
