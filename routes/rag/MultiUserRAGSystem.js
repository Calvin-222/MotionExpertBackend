const FileOperations = require("./fileOperations");
const QueryOperations = require("./queryOperations");
const EngineManagement = require("./engineManagement");
// 🔧 Fix path - import database connection from config directory
const { pool } = require("../../config/database");
const { all } = require("../friends");

class MultiUserRAGSystem {
  constructor() {
    this.fileOps = new FileOperations();
    this.queryOps = new QueryOperations();
    this.engineMgmt = new EngineManagement();
    this.pool = pool; // Directly use database connection pool
  }

  // 🔧 Add missing method: Get user's RAG engines
  async getAllUserEngines(userId) {
    try {
      const allEngines = [];

      // Get own engines
      const queryOwn = `SELECT r.* FROM rag r WHERE r.userid = ?`;
      const [ownResults] = await this.pool.execute(queryOwn, [userId]);
      allEngines.push(
        ...ownResults.map((e) => ({
          ...e,
          isOwner: true,
          comingFrom: "yourself",
        }))
      );
      // Get public engines
      const queryPublic = `  
      SELECT *
      FROM rag 
      where visibility = 'Public' And userid != ?
      `;
      const [publicResults] = await this.pool.execute(queryPublic, [userId]);
      allEngines.push(
        ...publicResults.map((e) => ({
          ...e,
          isOwner: false,
          comingFrom: "Public",
        }))
      );
      // Get shared engines
      const queryShared = `
      SELECT r.*, u.username as owner_name
      FROM private_rag pr
      JOIN rag r ON pr.ragid = r.ragid
      JOIN users u ON r.userid = u.userid
      WHERE pr.userid = ?
    `;
      const [sharedResults] = await this.pool.execute(queryShared, [userId]);
      allEngines.push(
        ...sharedResults.map((e) => ({
          ...e,
          isOwner: false,
          comingFrom: e.owner_name,
        }))
      );

      // Get friend engines
      const queryFriends = `
     SELECT r.*, u.username as owner_name
    FROM rag r
    JOIN users u ON r.userid = u.userid
    WHERE r.visibility = 'Friend' 
      AND r.userid != ?
      AND r.userid IN (SELECT userid FROM friendship WHERE friendid = ?)
    `;

      const [friendResults] = await this.pool.execute(queryFriends, [
        userId,
        userId,
      ]);
      allEngines.push(
        ...friendResults.map((e) => ({
          ...e,
          isOwner: false,
          comingFrom: `${e.owner_name} (Friends)`,
        }))
      );

      return { success: true, engines: allEngines };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
  async updateEngineVisibility(userId, engineId, visibility) {
    try {
      console.log(
        `🔧 Updating visibility for engine ${engineId} to ${visibility}`
      );

      // Validate visibility value
      const allowedVisibilities = ["Private", "Public", "Friend"];
      if (!allowedVisibilities.includes(visibility)) {
        return {
          success: false,
          error: "Invalid visibility value",
        };
      }

      // Check if user owns the engine
      const checkQuery = "SELECT * FROM rag WHERE ragid = ? AND userid = ?";
      const [engineResults] = await this.pool.execute(checkQuery, [
        engineId,
        userId,
      ]);

      if (engineResults.length === 0) {
        return {
          success: false,
          error: "Engine not found or no permission",
        };
      }

      // Update visibility
      const updateQuery = `UPDATE rag SET visibility = '${visibility}', updated_at = NOW() WHERE ragid = ? AND userid = ?`;
      await this.pool.execute(updateQuery, [engineId, userId]);

      return {
        success: true,
        message: "Visibility updated successfully",
        engine: {
          id: engineId,
          visibility: visibility,
        },
      };
    } catch (error) {
      console.error("Error updating engine visibility:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }
  // 🔧 Fix: Create user RAG engine - using real Google Cloud corpus creation
  async createUserRAGEngine(userId, engineName, description = "") {
    try {
      console.log(`🏗️ Creating RAG engine for user ${userId}: ${engineName}`);

      // Use EngineManagement to create real Google Cloud RAG Corpus
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
            ragid: result.corpusId, // Important: use real corpus ID
            id: result.corpusId,
            name: result.ragName,
            displayName: result.displayName,
            ragName: result.ragName,
            visibility: result.visibility,
            description: description,
            createdAt: result.createdAt,
            corpusName: result.corpusName, // Add corpus name for debugging
          },
          // Maintain backward compatibility
          engineId: result.corpusId,
          corpusName: result.corpusName, // Add top-level corpusName
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

  // 🔧 Check if user can access RAG
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
      // Check own or shared
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

  // 🔧 Get RAG Engine from database
  async getRAGEngineFromDB(ragId, userId) {
    try {
      // First check own engines
      const queryOwn = `
        SELECT r.*
        FROM rag r 
        WHERE r.ragid = ?
      `;
      const [ownResults] = await this.pool.execute(queryOwn, [ragId]);
      if (ownResults.length > 0) {
        return { success: true, ragEngine: ownResults[0] };
      }

      // Check shared engines
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
      // Friendship function
      const queryFriends = `
        SELECT r.*, u.username 
        FROM rag r
        JOIN users u ON r.userid = u.userid
        JOIN friendship f ON f.friendid = ?
        WHERE r.ragid = ? 
        AND r.visibility = 'Friend' 
        AND r.userid != ?
      `;
      const [friendResults] = await this.pool.execute(queryFriends, [
        userId,
        ragId,
        userId,
      ]);
      if (friendResults.length > 0) {
        return {
          success: true,
          ragEngine: friendResults[0],
          accessType: "friend",
        };
      }

      return { success: false, error: "Cannot find specified RAG Engine" };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async uploadToUserRAG(userId, file, fileName, engineId) {
    try {
      console.log(
        `📤 Uploading file to RAG engine ${engineId} for user: ${userId}`
      );

      // Check user permissions
      const hasAccess = await this.canUserAccessRAG(engineId, userId);
      if (!hasAccess) {
        return {
          success: false,
          error:
            "You do not have permission to upload documents to this RAG Engine",
        };
      }

      // 🔧 Fix: Pass complete parameter list
      const result = await this.fileOps.uploadToUserRAG(
        userId,
        file,
        fileName,
        engineId,
        // Pass createUserRAGEngine callback
        (userId, engineName, description, visibility) =>
          this.createUserRAGEngine(userId, engineName, description),
        // Pass getRAGEngineFromDB callback
        (ragId) => this.getRAGEngineFromDB(ragId)
      );

      // 🔴 New: If import fails, return detailed error message
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

  // 🔧 Add missing method: Query user RAG
  async queryUserRAG(userId, question, engineId, model = null) {
    try {
      console.log(
        `💬 User ${userId} querying RAG engine: ${engineId} with model: ${model || "default"}`
      );

      // Use query operations to perform query
      const result = await this.queryOps.queryUserRAG(
        userId,
        question,
        engineId,
        // (ragId, userId) => this.canUserAccessRAG(ragId, userId),
        (ragId) => this.getRAGEngineFromDB(ragId, userId),
        model
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

  // 🔧 Add missing method: Delete user document
  async deleteUserDocument(userId, fileId, ragId) {
    try {
      console.log(
        `🗑️ User ${userId} deleting document ${fileId} from RAG ${ragId}`
      );

      // Use file operations to delete document
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

  // 📥 Import multiple files to user RAG
  async importFiles(userId, engineId, files) {
    try {
      console.log(
        `📥 Importing ${files.length} files to RAG engine ${engineId} for user: ${userId}`
      );

      // Check if user has permission to access this engine
      const canAccess = await this.canUserAccessRAG(engineId, userId);
      if (!canAccess) {
        return {
          success: false,
          error: "You do not have permission to access this RAG Engine",
        };
      }

      // Use FileOperations' new importFilesFromContent method
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
