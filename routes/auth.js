const express = require('express')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const router = express.Router()
const db = require('../config/database')

// Login route (keep existing)
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body

    const [users] = await db.execute(
      'SELECT * FROM users WHERE username = ?',
      [username]
    )

    if (users.length === 0) {
      return res.json({ success: false, message: 'Invalid username or password' })
    }

    const user = users[0]
    const isValidPassword = await bcrypt.compare(password, user.password)

    if (!isValidPassword) {
      return res.json({ success: false, message: 'Invalid username or password' })
    }

    const token = jwt.sign(
      { userId: user.userid, username: user.username },
      process.env.JWT_SECRET || 'fheisbwfiwghbtjdkwajedfegrjefujhub41354trhj',
      { expiresIn: '30' }
    )

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        userid: user.userid,
        username: user.username
      }
    })

  } catch (error) {
    console.error('Login error:', error)
    res.status(500).json({ success: false, message: 'Server error' })
  }
})

// NEW: Registration route
router.post('/register', async (req, res) => {
  try {
    const { username, password, confirmPassword } = req.body

    // Validation
    if (!username || !password || !confirmPassword) {
      return res.json({ success: false, message: 'All fields are required' })
    }

    if (password !== confirmPassword) {
      return res.json({ success: false, message: 'Sorry, Passwords do not match' })
    }

    if (password.length < 6) {
      return res.json({ success: false, message: 'Password must be at least 6 characters long' })
    }

    // Check if username already exists
    const [existingUsers] = await db.execute(
      'SELECT userid FROM users WHERE username = ?',
      [username]
    )

    if (existingUsers.length > 0) {
      return res.json({ success: false, message: 'Username already exists' })
    }

    // Hash password
    const saltRounds = 10
    const hashedPassword = await bcrypt.hash(password, saltRounds)

    // Insert new user
    const [result] = await db.execute(
      'INSERT INTO users (username, password) VALUES (?, ?)',
      [username, hashedPassword]
    )

    // Create JWT token for immediate login
    const token = jwt.sign(
      { userId: result.insertId, username: username },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '24h' }
    )

    res.json({
      success: true,
      message: 'Registration successful',
      token,
      user: {
        userid: result.insertId,
        username: username
      }
    })

  } catch (error) {
    console.error('Registration error:', error)
    res.status(500).json({ success: false, message: 'Server error' })
  }
})

// Keep existing /me route
router.get('/me', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1]
    
    if (!token) {
      return res.status(401).json({ success: false, message: 'No token provided' })
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key')
    
    const [users] = await db.execute(
      'SELECT userid, username FROM users WHERE userid = ?',
      [decoded.userId]
    )

    if (users.length === 0) {
      return res.status(401).json({ success: false, message: 'User not found' })
    }

    res.json({
      success: true,
      user: users[0]
    })

  } catch (error) {
    console.error('Auth check error:', error)
    res.status(401).json({ success: false, message: 'Invalid token' })
  }
})

module.exports = router