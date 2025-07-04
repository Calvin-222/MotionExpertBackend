const { dbPool } = require("./config");

class DatabaseOperations {
  constructor() {
    this.db = dbPool;
  }

  // 🔍 獲取用戶可訪問的 RAG Engines（包含分享的）
  async getUserAccessibleRAGEngines(userId) {
    try {
      // 查詢用戶自己的 RAG Engines
      const ownRagsQuery = `
        SELECT r.*, u.username as owner_username
        FROM rag r 
        JOIN users u ON r.userid = u.userid 
        WHERE r.userid = ?
      `;
      const [ownRags] = await this.db.execute(ownRagsQuery, [userId]);

      // 查詢通過好友關係分享的 RAG Engines
      const friendSharedQuery = `
        SELECT r.*, u.username as owner_username
        FROM rag r 
        JOIN users u ON r.userid = u.userid
        JOIN friendship f ON (f.userid = r.userid AND f.friendid = ? AND f.accepted_at IS NOT NULL)
        WHERE r.visibility = 'friends'
      `;
      const [friendSharedRags] = await this.db.execute(friendSharedQuery, [
        userId,
      ]);

      // 查詢私人分享的 RAG Engines
      const privateSharedQuery = `
        SELECT r.*, u.username as owner_username
        FROM rag r 
        JOIN users u ON r.userid = u.userid
        JOIN private_rag pr ON (pr.ragid = r.ragid AND pr.userid = ?)
      `;
      const [privateSharedRags] = await this.db.execute(privateSharedQuery, [
        userId,
      ]);

      return {
        success: true,
        ownRags: ownRags,
        friendSharedRags: friendSharedRags,
        privateSharedRags: privateSharedRags,
        totalAccessible:
          ownRags.length + friendSharedRags.length + privateSharedRags.length,
      };
    } catch (error) {
      console.error("Error getting user accessible RAG engines:", error);
      return {
        success: false,
        error: error.message,
        ownRags: [],
        friendSharedRags: [],
        privateSharedRags: [],
        totalAccessible: 0,
      };
    }
  }

  // 🔍 檢查用戶是否可以訪問特定的 RAG Engine
  async canUserAccessRAG(userId, ragId) {
    try {
      const accessibleRags = await this.getUserAccessibleRAGEngines(userId);

      if (!accessibleRags.success) {
        return false;
      }

      // 檢查是否在用戶自己的 RAG Engines 中
      const isOwner = accessibleRags.ownRags.some((rag) => rag.ragid === ragId);
      if (isOwner) {
        return true;
      }

      // 檢查是否在好友分享的 RAG Engines 中
      const isFriendShared = accessibleRags.friendSharedRags.some(
        (rag) => rag.ragid === ragId
      );
      if (isFriendShared) {
        return true;
      }

      // 檢查是否在私人分享的 RAG Engines 中
      const isPrivateShared = accessibleRags.privateSharedRags.some(
        (rag) => rag.ragid === ragId
      );
      if (isPrivateShared) {
        return true;
      }

      return false;
    } catch (error) {
      console.error("Error checking RAG access:", error);
      return false;
    }
  }

  // 🔍 從資料庫獲取 RAG Engine 信息
  async getRAGEngineFromDB(ragId) {
    try {
      const query = `
        SELECT r.*, u.username 
        FROM rag r 
        JOIN users u ON r.userid = u.userid 
        WHERE r.ragid = ?
      `;
      const [results] = await this.db.execute(query, [ragId]);

      if (results.length > 0) {
        return {
          success: true,
          ragEngine: results[0],
        };
      } else {
        return {
          success: false,
          error: "RAG Engine not found",
        };
      }
    } catch (error) {
      console.error("Error getting RAG engine from DB:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  // 🤝 添加好友
  async addFriend(userId, friendUsername) {
    try {
      // 查找好友用戶
      const userQuery = "SELECT userid FROM users WHERE username = ?";
      const [users] = await this.db.execute(userQuery, [friendUsername]);

      if (users.length === 0) {
        return {
          success: false,
          error: "用戶不存在",
        };
      }

      const friendId = users[0].userid;

      // 檢查是否已經是好友
      const existingQuery = `
        SELECT * FROM friendship 
        WHERE (userid = ? AND friendid = ?) OR (userid = ? AND friendid = ?)
      `;
      const [existing] = await this.db.execute(existingQuery, [
        userId,
        friendId,
        friendId,
        userId,
      ]);

      if (existing.length > 0) {
        return {
          success: false,
          error: "好友關係已存在",
        };
      }

      // 添加好友請求
      const addQuery = `
        INSERT INTO friendship (userid, friendid) 
        VALUES (?, ?)
      `;
      await this.db.execute(addQuery, [userId, friendId]);

      return {
        success: true,
        message: "好友請求已發送",
        friendId: friendId,
      };
    } catch (error) {
      console.error("Error adding friend:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  // 🤝 接受好友邀請
  async acceptFriendRequest(userId, friendId) {
    try {
      const updateQuery = `
        UPDATE friendship 
        SET accepted_at = NOW() 
        WHERE userid = ? AND friendid = ? AND accepted_at IS NULL
      `;
      const [result] = await this.db.execute(updateQuery, [friendId, userId]);

      if (result.affectedRows > 0) {
        return {
          success: true,
          message: "好友請求已接受",
        };
      } else {
        return {
          success: false,
          error: "找不到待處理的好友請求",
        };
      }
    } catch (error) {
      console.error("Error accepting friend request:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  // 🔗 分享 RAG Engine 給特定用戶
  async shareRAGEngineToUser(ownerId, ragId, targetUserId) {
    try {
      const shareQuery = `
        INSERT INTO private_rag (ragid, userid, granted_at) 
        VALUES (?, ?, NOW())
      `;
      await this.db.execute(shareQuery, [ragId, targetUserId]);

      return {
        success: true,
        message: "RAG Engine 已成功分享",
        ragId: ragId,
        targetUserId: targetUserId,
      };
    } catch (error) {
      console.error("Error sharing RAG engine:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  // 檔案名稱映射相關方法
  async getFileNameMapping(ragId) {
    try {
      const query = `
        SELECT fileid, filename, id
        FROM rag_file_name 
        WHERE ragid = ?
        ORDER BY created_at DESC
      `;
      const [results] = await this.db.execute(query, [ragId]);

      const mapping = {};
      results.forEach((row) => {
        mapping[row.fileid] = row.filename;
      });

      return {
        success: true,
        mapping: mapping,
        count: results.length,
      };
    } catch (error) {
      console.error("Error getting file name mapping:", error);
      return {
        success: false,
        error: error.message,
        mapping: {},
      };
    }
  }

  // 根據 fileid 獲取原始文件名
  async getOriginalFileName(ragId, fileId) {
    try {
      const query = `
        SELECT filename, fileid
        FROM rag_file_name 
        WHERE ragid = ? AND fileid = ?
      `;
      const [results] = await this.db.execute(query, [ragId, fileId]);

      if (results.length > 0) {
        return {
          success: true,
          filename: results[0].filename,
          fileid: results[0].fileid,
        };
      } else {
        return {
          success: false,
          error: "File not found",
        };
      }
    } catch (error) {
      console.error("Error getting original filename:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }
}

module.exports = DatabaseOperations;
