const FileOperations = require("./fileOperations");
const QueryOperations = require("./queryOperations");
const EngineManagement = require("./engineManagement");
// 🔧 修正路徑 - 從 config 目錄引入資料庫連接
const { pool } = require("../../config/database");

class MultiUserRAGSystem {
  constructor() {
    this.fileOps = new FileOperations();
    this.queryOps = new QueryOperations();
    this.engineMgmt = new EngineManagement();
    this.pool = pool; // 直接使用資料庫連接池
  }

  // 🔧 添加缺失的方法：獲取用戶的 RAG engines
  async getUserRAGEngines(userId) {
    try {
      console.log(`📊 Getting RAG engines for user: ${userId}`);

      const query = `
        SELECT ragid, ragname, visibility, created_at, updated_at 
        FROM rag 
        WHERE userid = ? 
        ORDER BY created_at DESC
      `;

      const [results] = await this.pool.execute(query, [userId]);

      return results || [];
    } catch (error) {
      console.error("Error getting user RAG engines:", error);
      return [];
    }
  }

  // 🔧 修正：創建用戶 RAG engine - 使用真正的 Google Cloud corpus 創建
  async createUserRAGEngine(userId, engineName, description = "") {
    try {
      console.log(`🏗️ Creating RAG engine for user ${userId}: ${engineName}`);

      // 使用 EngineManagement 創建真正的 Google Cloud RAG Corpus
      const result = await this.engineMgmt.createUserRAGEngine(
        userId,
        engineName,
        description
      );

      if (result.success) {
        return {
          success: true,
          message: result.message,
          engine: {
            ragid: result.corpusId, // 重要：使用真正的 corpus ID
            id: result.corpusId,
            name: result.ragName,
            displayName: result.displayName,
            ragName: result.ragName,
            visibility: result.visibility,
            description: description,
            createdAt: result.createdAt,
            corpusName: result.corpusName, // 添加 corpus 名稱供調試
          },
          // 保持向後兼容
          engineId: result.corpusId,
          corpusName: result.corpusName, // 添加頂層 corpusName
        };
      } else {
        return {
          success: false,
          error: result.error,
        };
      }
    } catch (error) {
      console.error("Error creating RAG engine:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  // 🔧 檢查用戶是否可以訪問 RAG
  // async canUserAccessRAG(userId, ragId) {
  //   try {
  //     const query = `
  //       SELECT COUNT(*) as count
  //       FROM rag
  //       WHERE ragid = ? AND userid = ?
  //     `;

  //     const [results] = await this.pool.execute(query, [ragId, userId]);

  //     return results[0].count > 0;
  //   } catch (error) {
  //     console.error("Error checking RAG access:", error);
  //     return false;
  //   }
  // }

  async canUserAccessRAG(ragId, userId) {
    try {
      // 查自己或被分享
      const query = `
      SELECT COUNT(*) as count FROM rag WHERE ragid = ? AND userid = ?
      UNION ALL
      SELECT COUNT(*) as count FROM private_rag WHERE ragid = ? AND userid = ?
    `;
      const [results] = await this.pool.execute(query, [
        ragId,
        userId,
        ragId,
        userId,
      ]);
      return results.some((r) => r.count > 0);
    } catch (error) {
      console.error("Error checking RAG access:", error);
      return false;
    }
  }

  // 🔧 從資料庫獲取 RAG Engine
  async getRAGEngineFromDB(ragId, userId) {
    try {
      // 先查自己擁有的
      const queryOwn = `
        SELECT r.*
        FROM rag r 
        WHERE r.ragid = ?
      `;
      const [ownResults] = await this.pool.execute(queryOwn, [ragId]);
      if (ownResults.length > 0) {
        return { success: true, ragEngine: ownResults[0] };
      }

      // 查被分享的
      const queryShared = `
        SELECT r.*, u.username 
        FROM private_rag pr
        JOIN rag r ON pr.ragid = r.ragid
        JOIN users u ON r.userid = u.userid
        WHERE pr.ragid = ? AND pr.userid = ?
      `;
      const [sharedResults] = await this.pool.execute(queryShared, [
        ragId,
        userId,
      ]);
      if (sharedResults.length > 0) {
        return { success: true, ragEngine: sharedResults[0] };
      }

      return { success: false, error: "找不到指定的 RAG Engine" };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // 🔧 修正：上傳文檔到用戶 RAG - 傳遞完整參數
  async uploadToUserRAG(userId, file, fileName, engineId) {
    try {
      console.log(
        `📤 Uploading file to RAG engine ${engineId} for user: ${userId}`
      );

      // 檢查用戶權限
      const hasAccess = await this.canUserAccessRAG(engineId, userId);
      if (!hasAccess) {
        return {
          success: false,
          error: "您沒有權限上傳文檔到此 RAG Engine",
        };
      }

      // 🔧 修正：傳遞完整的參數列表
      const result = await this.fileOps.uploadToUserRAG(
        userId,
        file,
        fileName,
        engineId,
        // 傳遞 createUserRAGEngine 回調
        (userId, engineName, description, visibility) =>
          this.createUserRAGEngine(userId, engineName, description),
        // 傳遞 getRAGEngineFromDB 回調
        (ragId) => this.getRAGEngineFromDB(ragId)
      );

      // 🔴 新增：如果導入失敗，將詳細錯誤訊息回傳
      if (!result.success) {
        return {
          success: false,
          error: result.error,
          details: result.details,
        };
      }

      return result;
    } catch (error) {
      console.error("Error uploading to user RAG:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  // 🔧 添加缺失的方法：查詢用戶 RAG
  async queryUserRAG(userId, question, engineId) {
    try {
      console.log(`💬 User ${userId} querying RAG engine: ${engineId}`);

      // 使用查詢操作進行查詢
      const result = await this.queryOps.queryUserRAG(
        userId,
        question,
        engineId,
        // (ragId, userId) => this.canUserAccessRAG(ragId, userId),
        (ragId) => this.getRAGEngineFromDB(ragId, userId)
      );

      return result;
    } catch (error) {
      console.error("Error querying user RAG:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  // 🔧 添加缺失的方法：刪除用戶文檔
  async deleteUserDocument(userId, fileId, ragId) {
    try {
      console.log(
        `🗑️ User ${userId} deleting document ${fileId} from RAG ${ragId}`
      );

      // 使用檔案操作刪除文檔
      const result = await this.fileOps.deleteUserDocument(
        userId,
        fileId,
        ragId,
        (ragId, userId) => this.canUserAccessRAG(ragId, userId)
      );

      return result;
    } catch (error) {
      console.error("Error deleting user document:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  // 📥 導入多個文件到用戶 RAG
  async importFiles(userId, engineId, files) {
    try {
      console.log(
        `📥 Importing ${files.length} files to RAG engine ${engineId} for user: ${userId}`
      );

      // 檢查用戶是否有權限訪問此 engine
      const canAccess = await this.canUserAccessRAG(engineId, userId);
      if (!canAccess) {
        return {
          success: false,
          error: "您無權限訪問此 RAG Engine",
        };
      }

      // 使用 FileOperations 的新 importFilesFromContent 方法
      const result = await this.fileOps.importFilesFromContent(
        userId,
        engineId,
        files
      );

      if (result.success) {
        return {
          success: true,
          message: result.message,
          importedFiles: result.results.filter((r) => r.success),
          summary: result.summary,
        };
      } else {
        return {
          success: false,
          error: result.error,
          details: result.results,
        };
      }
    } catch (error) {
      console.error("Error importing files to user RAG:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }
}

module.exports = MultiUserRAGSystem;
