const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const router = express.Router();
const db = require("../config/database");

// Login route 修正
router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    const [users] = await db.execute("SELECT * FROM users WHERE username = ?", [
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
      process.env.JWT_SECRET || "fheisbwfiwghbtjdkwajedfegrjefujhub41354trhj",
      { expiresIn: "24h" } // 修正：改為 24 小時
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
router.post("/register", async (req, res) => {
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
    const [existingUsers] = await db.execute(
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
    const [result] = await db.execute(
      "INSERT INTO users (username, password) VALUES (?, ?)",
      [username, hashedPassword]
    );

    // 獲取新創建的用戶信息（包括自動生成的 UUID）
    const [newUser] = await db.execute(
      "SELECT userid, username FROM users WHERE username = ?",
      [username]
    );

    if (newUser.length === 0) {
      throw new Error("Failed to retrieve new user information");
    }

    // Create JWT token for immediate login
    const token = jwt.sign(
      { userId: newUser[0].userid, username: username },
      process.env.JWT_SECRET || "fheisbwfiwghbtjdkwajedfegrjefujhub41354trhj",
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

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "fheisbwfiwghbtjdkwajedfegrjefujhub41354trhj"
    );

    const [users] = await db.execute(
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

module.exports = router;
