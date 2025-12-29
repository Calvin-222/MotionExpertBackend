const express = require("express");
const router = express.Router();
const { pool } = require("../config/database");
const { authenticateToken } = require("./middlewarecheck/middleware");
const bcrypt = require("bcrypt"); // Added bcrypt for password hashing

// Middleware to check if user is admin
// Checks against a specific ADMIN_USER_ID in environment variables
const isAdmin = (req, res, next) => {
  const userId = req.user.userId;
  const adminId = process.env.ADMIN_USER_ID;

  if (!adminId) {
      console.error("ADMIN_USER_ID is not set in .env");
      return res.status(500).json({ success: false, message: "Server configuration error" });
  }

  if (userId === adminId) {
    next();
  } else {
    return res.status(403).json({ success: false, message: "Admin access required" });
  }
};

// Get all users
router.get("/users", authenticateToken, isAdmin, async (req, res) => {
  try {
    // Fetch userid, username, created_at, and avatarurl
    const [users] = await pool.execute("SELECT userid, username, created_at, avatarurl FROM users");
    res.json({ success: true, users });
  } catch (error) {
    console.error("Get users error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch users" });
  }
});

// Create new user
router.post("/users", authenticateToken, isAdmin, async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ success: false, message: "Username and password are required" });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, message: "Password must be at least 6 characters" });
    }

    // Check if username exists
    const [existing] = await pool.execute("SELECT userid FROM users WHERE username = ?", [username]);
    if (existing.length > 0) {
      return res.status(400).json({ success: false, message: "Username already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    
    await pool.execute(
      "INSERT INTO users (username, password) VALUES (?, ?)",
      [username, hashedPassword]
    );

    res.json({ success: true, message: "User created successfully" });
  } catch (error) {
    console.error("Create user error:", error);
    res.status(500).json({ success: false, message: "Failed to create user" });
  }
});

// Update user (username or password)
router.put("/users/:id", authenticateToken, isAdmin, async (req, res) => {
  try {
    const userId = req.params.id;
    const { username, password } = req.body;

    // Prevent modifying yourself (optional, but safer to use profile settings for self)
    // if (userId == req.user.userId) ...

    const updates = [];
    const values = [];

    if (username) {
      // Check uniqueness if username is changing
      const [existing] = await pool.execute(
        "SELECT userid FROM users WHERE username = ? AND userid != ?", 
        [username, userId]
      );
      if (existing.length > 0) {
        return res.status(400).json({ success: false, message: "Username already taken" });
      }
      updates.push("username = ?");
      values.push(username);
    }

    if (password) {
      if (password.length < 6) {
        return res.status(400).json({ success: false, message: "Password must be at least 6 characters" });
      }
      const hashedPassword = await bcrypt.hash(password, 10);
      updates.push("password = ?");
      values.push(hashedPassword);
    }

    if (updates.length === 0) {
      return res.json({ success: true, message: "No changes made" });
    }

    values.push(userId);
    await pool.execute(`UPDATE users SET ${updates.join(", ")} WHERE userid = ?`, values);

    res.json({ success: true, message: "User updated successfully" });
  } catch (error) {
    console.error("Update user error:", error);
    res.status(500).json({ success: false, message: "Failed to update user" });
  }
});

// --- RAG Engine Management ---

// Get all RAG engines
router.get("/rag", authenticateToken, isAdmin, async (req, res) => {
  try {
    const query = `
      SELECT r.ragid, r.ragname, r.visibility, r.created_at, r.userid, u.username 
      FROM rag r 
      LEFT JOIN users u ON r.userid = u.userid
    `;
    const [engines] = await pool.execute(query);
    res.json({ success: true, engines });
  } catch (error) {
    console.error("Get RAG engines error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch RAG engines" });
  }
});

// Create RAG engine
router.post("/rag", authenticateToken, isAdmin, async (req, res) => {
  try {
    const { ragname, visibility, userid } = req.body;
    
    if (!ragname || !userid) {
      return res.status(400).json({ success: false, message: "RAG Name and Owner (User ID) are required" });
    }

    // Generate a simple ID or use UUID if preferred. 
    // Since ragid is varchar(255), we can use a timestamp-based ID or UUID.
    const crypto = require("crypto");
    const ragid = crypto.randomUUID();

    await pool.execute(
      "INSERT INTO rag (ragid, userid, ragname, visibility) VALUES (?, ?, ?, ?)",
      [ragid, userid, ragname, visibility || 'Private']
    );

    res.json({ success: true, message: "RAG Engine created successfully" });
  } catch (error) {
    console.error("Create RAG error:", error);
    res.status(500).json({ success: false, message: "Failed to create RAG engine" });
  }
});

// Update RAG engine
router.put("/rag/:id", authenticateToken, isAdmin, async (req, res) => {
  try {
    const ragId = req.params.id;
    const { ragname, visibility } = req.body;
    
    const updates = [];
    const values = [];

    if (ragname) {
      updates.push("ragname = ?");
      values.push(ragname);
    }
    if (visibility) {
      updates.push("visibility = ?");
      values.push(visibility);
    }

    if (updates.length === 0) {
      return res.json({ success: true, message: "No changes made" });
    }

    values.push(ragId);
    await pool.execute(`UPDATE rag SET ${updates.join(", ")} WHERE ragid = ?`, values);

    res.json({ success: true, message: "RAG Engine updated successfully" });
  } catch (error) {
    console.error("Update RAG error:", error);
    res.status(500).json({ success: false, message: "Failed to update RAG engine" });
  }
});

// Delete RAG engine
router.delete("/rag/:id", authenticateToken, isAdmin, async (req, res) => {
  try {
    const ragId = req.params.id;
    await pool.execute("DELETE FROM rag WHERE ragid = ?", [ragId]);
    res.json({ success: true, message: "RAG Engine deleted successfully" });
  } catch (error) {
    console.error("Delete RAG error:", error);
    res.status(500).json({ success: false, message: "Failed to delete RAG engine" });
  }
});

// Delete user
router.delete("/users/:id", authenticateToken, isAdmin, async (req, res) => {
  try {
    const userIdToDelete = req.params.id;
    
    // Prevent deleting yourself
    if (userIdToDelete == req.user.userId) {
        return res.status(400).json({ success: false, message: "Cannot delete your own admin account" });
    }

    await pool.execute("DELETE FROM users WHERE userid = ?", [userIdToDelete]);
    res.json({ success: true, message: "User deleted successfully" });
  } catch (error) {
    console.error("Delete user error:", error);
    res.status(500).json({ success: false, message: "Failed to delete user" });
  }
});

// Get System Stats
router.get("/stats", authenticateToken, isAdmin, async (req, res) => {
  try {
    const [userCount] = await pool.execute("SELECT COUNT(*) as count FROM users");
    const [ragCount] = await pool.execute("SELECT COUNT(*) as count FROM rag");
    
    res.json({
      success: true,
      stats: {
        users: userCount[0].count,
        ragEngines: ragCount[0].count
      }
    });
  } catch (error) {
    console.error("Get stats error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch stats" });
  }
});

// Get Google Cloud Console Link
router.get("/gcp-link", authenticateToken, isAdmin, (req, res) => {
    const projectId = process.env.GOOGLE_CLOUD_PROJECT || "motionexpaiweb";
    const link = `https://console.cloud.google.com/home/dashboard?project=${projectId}`;
    res.json({ success: true, link });
});

// Execute Raw SQL (Use with CAUTION)
router.post("/sql", authenticateToken, isAdmin, async (req, res) => {
    const { query } = req.body;
    if (!query) return res.status(400).json({ success: false, message: "Query required" });

    // Basic safety check - prevent DROP/TRUNCATE if needed, but admins usually need full power
    // For this demo, we'll allow it but log it heavily
    console.warn(`[ADMIN SQL EXEC] User ${req.user.username} executed: ${query}`);

    try {
        const [results] = await pool.execute(query);
        res.json({ success: true, results });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});

module.exports = router;
