const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const router = express.Router();
const { pool }= require("../config/database");
const ratelimit = require("express-rate-limit");
const validator = require("validator");

// Rate limiting middleware
const limiter = ratelimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15, // Limit each IP to 15 requests per windowMs
  message: "Too many requests, please try again later.",
});

const validateInput = (req, res, next) => {
  const { username, password } = req.body;

  // Validate username format
  if (typeof username !== "string" || !/^[a-zA-Z0-9_]+$/.test(username)) {
    return res.status(400).json({
      success: false,
      message: "Invalid username format",
    });
  }

  // Check for dangerous patterns in username
  const dangerousPatterns = [
    /<script/i,
    /javascript:/i,
    /vbscript:/i,
    /on\w+=/i,
    /<iframe/i,
  ];
  if (dangerousPatterns.some((pattern) => pattern.test(username))) {
    return res.status(400).json({
      success: false,
      message: "Invalid characters in username",
    });
  }

  // Sanitize inputs
  req.body.username = validator.escape(username.trim());
  req.body.password = password; // Don't sanitize password, just validate length

  next();
};

// Login route 修正
router.post("/login", limiter, validateInput, async (req, res) => {
  //apply rate limiting and input validation to this route
  try {
    const { username, password } = req.body;

    const [users] = await pool.execute("SELECT * FROM users WHERE username = ?", [
      username,
    ]);

    if (users.length === 0) {
      return res.json({
        success: false,
        message: "Invalid username or password",
      });
    }

    const user = users[0];
    const isValidPassword = await bcrypt.compare(password, user.password);

    if (!isValidPassword) {
      return res.json({
        success: false,
        message: "Invalid username or password",
      });
    }

    const token = jwt.sign(
      { userId: user.userid, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: "24h" } //
    );

    res.json({
      success: true,
      message: "Login successful",
      token,
      user: {
        userid: user.userid,
        username: user.username,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Registration route 修正
router.post("/register", limiter, validateInput, async (req, res) => {
  try {
    const { username, password, confirmPassword } = req.body;

    // Validation
    if (!username || !password || !confirmPassword) {
      return res.json({ success: false, message: "All fields are required" });
    }

    if (password !== confirmPassword) {
      return res.json({
        success: false,
        message: "Sorry, Passwords do not match",
      });
    }

    if (password.length < 6) {
      return res.json({
        success: false,
        message: "Password must be at least 6 characters long",
      });
    }

    // Check if username already exists
    const [existingUsers] = await pool.execute(
      "SELECT userid FROM users WHERE username = ?",
      [username]
    );

    if (existingUsers.length > 0) {
      return res.json({ success: false, message: "Username already exists" });
    }

    // Hash password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Insert new user (userid 會自動生成 UUID)
    const [result] = await pool.execute(
      "INSERT INTO users (username, password) VALUES (?, ?)",
      [username, hashedPassword]
    );

    // 獲取新創建的用戶信息（包括自動生成的 UUID）
    const [newUser] = await pool.execute(
      "SELECT userid, username FROM users WHERE username = ?",
      [username]
    );

    if (newUser.length === 0) {
      throw new Error("Failed to retrieve new user information");
    }

    // Create JWT token for immediate login
    const token = jwt.sign(
      { userId: newUser[0].userid, username: username },
      process.env.JWT_SECRET,
      { expiresIn: "24h" } // 修正：改為 24 小時
    );

    res.json({
      success: true,
      message: "Registration successful",
      token,
      user: {
        userid: newUser[0].userid,
        username: username,
      },
    });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// /me route 修正
router.get("/me", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) {
      return res
        .status(401)
        .json({ success: false, message: "No token provided" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const [users] = await pool.execute(
      "SELECT userid, username FROM users WHERE userid = ?",
      [decoded.userId]
    );

    if (users.length === 0) {
      return res
        .status(401)
        .json({ success: false, message: "User not found" });
    }

    res.json({
      success: true,
      user: users[0],
    });
  } catch (error) {
    console.error("Auth check error:", error);
    res.status(401).json({ success: false, message: "Invalid token" });
  }
});

// Token 驗證端點
router.get("/verify", async (req, res) => {
  try {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Access token required",
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const [users] = await pool.execute(
      "SELECT userid, username FROM users WHERE userid = ?",
      [decoded.userId]
    );

    if (users.length === 0) {
      return res.status(401).json({
        success: false,
        message: "User not found",
      });
    }

    res.json({
      success: true,
      message: "Token is valid",
      user: {
        userId: users[0].userid,
        username: users[0].username,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Token verification error:", error);
    res.status(401).json({
      success: false,
      message: "Invalid token",
    });
  }
});

module.exports = router;
