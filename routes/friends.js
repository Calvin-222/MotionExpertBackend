var express = require("express");
var router = express.Router();
const { pool } = require("../config/database");
const { authenticateToken } = require("./middlewarecheck/middleware");



router.get('/search-users',authenticateToken, async (req, res) => {

  try {
    const searchTerm = req.query.search || '';
    const currentUsername = req.user.username;


    if (!searchTerm || searchTerm.trim().length < 3) {
      return res.json({
        success: true,
        users: [],
        count: 0,
        message: ''
      });
    }


    let query = 'SELECT username FROM users WHERE username LIKE ? AND username != ?';
    let queryParams = [`%${searchTerm}%`, currentUsername];

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

router.post('/add-friend', authenticateToken, async (req, res) => {
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


    //Prevent a user from adding themselves.
    if (currentUserId === friendId) {
      return res.status(400).json({ success: false, message: 'You cannot add yourself as a friend.' });
    }

    // Check if already friends, in either direction.
    const existingQuery = `
      SELECT id FROM friendship WHERE (userid = ? AND friendid = ?)
    `;
    const [existing] = await pool.execute(existingQuery, [currentUserId, friendId,]);

    if (existing.length > 0) {
      // Updated the message to be more generic.
      return res.status(400).json({ success: false, message: 'You are already friends with this user.' });
    }


    // Insert friendship 
    const insertQuery = 'INSERT INTO friendship (userid, friendid) VALUES (?, ?)';
    await pool.execute(insertQuery, [currentUserId, friendId]);

    res.json({ success: true, message: 'Friend added successfully' }); // I don't have request don't fucking change this

  } catch (error) {
    console.error('Add friend error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});
// Get friend notifications (people who added current user as friend but user hasn't added them back)
router.get('/notifications', authenticateToken, async (req, res) => {
  try {
    const currentUserId = req.user.userId;

    // Find users who added current user as friend but current user hasn't added them back
    const query = `
      SELECT f.userid, u.username, f.id
      FROM friendship f
      JOIN users u ON f.userid = u.userid
      WHERE f.friendid = ? 
      AND f.Known = 'false'
      AND NOT EXISTS (
        SELECT 1 FROM friendship f2 
        WHERE f2.userid = ? AND f2.friendid = f.userid
      )
      ORDER BY f.created_at DESC
    `;

    const [notifications] = await pool.execute(query, [currentUserId, currentUserId]);

    res.json({
      success: true,
      notifications: notifications,
      count: notifications.length
    });

  } catch (error) {
    console.error('Notifications error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// Add friend back (when user accepts a friend request)
router.post('/add-friend-back', authenticateToken, async (req, res) => {
  try {
    const { friendUserId } = req.body;
    const currentUserId = req.user.userId;

    // Check if the friend request exists
    const checkQuery = `
      SELECT id FROM friendship 
      WHERE userid = ? AND friendid = ? AND Known = 'false'
    `;
    const [existingRequest] = await pool.execute(checkQuery, [friendUserId, currentUserId]);

    if (existingRequest.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Friend request not found' 
      });
    }

    // Check if user already added this person back
    const alreadyFriendsQuery = `
      SELECT id FROM friendship 
      WHERE userid = ? AND friendid = ?
    `;
    const [alreadyFriends] = await pool.execute(alreadyFriendsQuery, [currentUserId, friendUserId]);

    if (alreadyFriends.length > 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'You have already added this user as a friend' 
      });
    }

    // Add friendship back (current user adds the friend)
    const insertQuery = 'INSERT INTO friendship (userid, friendid, Known) VALUES (?, ?, ?)';
    await pool.execute(insertQuery, [currentUserId, friendUserId, 'true']);

    // Update the original friendship record to mark as known
    const updateQuery = 'UPDATE friendship SET Known = ? WHERE userid = ? AND friendid = ?';
    await pool.execute(updateQuery, ['true', friendUserId, currentUserId]);

    res.json({ 
      success: true, 
      message: 'Friend added back successfully' 
    });

  } catch (error) {
    console.error('Add friend back error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error' 
    });
  }
});
module.exports = router;