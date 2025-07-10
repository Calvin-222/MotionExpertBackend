var express = require("express");
var router = express.Router();
const { pool } = require("../config/database");
const { authenticateToken } = require("./middlewarecheck/middleware");


router.get('/api/search-users',authenticateToken, async (req, res) => {
  try {
    const searchTerm = req.query.search || '';

    if (!searchTerm || searchTerm.trim().length < 3) {
      return res.json({
        success: true,
        users: [],
        count: 0,
        message: ''
      });
    }
    //if(searchTerm == username){}
    
    let query = 'SELECT username FROM users';
    let queryParams = [];
    
    if (searchTerm) {
      query += ' WHERE username LIKE ?';
      queryParams.push(`%${searchTerm}%`);
    }
    
    query += ' ORDER BY created_at DESC LIMIT 50';
    
    const [users] = await pool.execute(query, queryParams);
    
    res.json({
      success: true,
      users: users,
      count: users.length
    });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error' 
    });
  }
});

router.post('/api/add-friend', authenticateToken, async (req, res) => {
  try {
    const { friendUsername } = req.body;
    const currentUserId = req.user.userId; // From JWT
    // Get friend's userid
    const friendQuery = 'SELECT userid FROM users WHERE username = ?';
    const [friendResult] = await pool.execute(friendQuery, [friendUsername]);

    if (friendResult.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const friendId = friendResult[0].userid;

    // Check if already friends (single direction only)
    const existingQuery = 'SELECT id FROM friendship WHERE userid = ? AND friendid = ?';
    const [existing] = await pool.execute(existingQuery, [currentUserId, friendId]);

    if (existing.length > 0) {
      return res.status(400).json({ success: false, message: 'Already friends' });
    }

    // Insert friendship
    const insertQuery = 'INSERT INTO friendship (userid, friendid) VALUES (?, ?)';
    await pool.execute(insertQuery, [currentUserId, friendId]);

    res.json({ success: true, message: 'Friend added successfully' });

  } catch (error) {
    console.error('Add friend error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
