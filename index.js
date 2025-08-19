const express = require('express');
const cors = require('cors');
const db = require('./db');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key';

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = 'uploads/';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: function (req, file, cb) {
    // Allow common file types
    const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx|xls|xlsx|txt|zip|rar/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only specific file types are allowed'));
    }
  }
});

const app = express();
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('uploads'));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Auth middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = user;
    next();
  });
}

// Login endpoint
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!password || (!username && !email)) {
      return res.status(400).json({ error: 'Username/email and password required' });
    }
    // Find user by username or email
    const [rows] = await db.query(
      'SELECT * FROM users WHERE username = ? OR email = ? LIMIT 1',
      [username || '', email || '']
    );
    const user = rows[0];
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    // Compare password
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
    // Generate JWT
    const token = jwt.sign({ id: user.id, username: user.username, email: user.email }, JWT_SECRET, { expiresIn: '2h' });
    
    // Create session record
    const userAgent = req.headers['user-agent'] || 'Unknown Browser';
    const ipAddress = req.ip || req.connection.remoteAddress || 'Unknown IP';
    
    // Simple device detection
    let device = 'Unknown Device';
    let browser = 'Unknown Browser';
    let location = 'Unknown Location';
    
    if (userAgent.includes('Chrome')) {
      browser = 'Chrome';
      device = 'Generic Linux chrome';
    } else if (userAgent.includes('Firefox')) {
      browser = 'Firefox';
      device = 'Generic Linux firefox';
    } else if (userAgent.includes('Safari')) {
      browser = 'Safari';
      device = 'Generic Mac safari';
    } else if (userAgent.includes('Edge')) {
      browser = 'Edge';
      device = 'Generic Windows edge';
    }
    
    // For demo purposes, set a sample location
    location = 'Lahore, Punjab, PK';
    
    // Insert session record
    await db.query(`
      INSERT INTO session_history (user_id, session_token, device, browser, location, ip_address, user_agent)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [user.id, token, device, browser, location, ipAddress, userAgent]);
    
    res.json({ token, user: { id: user.id, username: user.username, email: user.email } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Register endpoint
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Username, email, and password required' });
    }
    // Check if user exists
    const [rows] = await db.query('SELECT id FROM users WHERE username = ? OR email = ?', [username, email]);
    if (rows.length > 0) return res.status(409).json({ error: 'User already exists' });
    // Hash password
    const hashed = await bcrypt.hash(password, 10);
    const [result] = await db.query('INSERT INTO users (username, email, password) VALUES (?, ?, ?)', [username, email, hashed]);
    const user = { id: result.insertId, username, email };
    const token = jwt.sign(user, JWT_SECRET, { expiresIn: '2h' });
    res.status(201).json({ token, user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Forgot password endpoint
app.post('/api/auth/forgot', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });
    const [rows] = await db.query('SELECT id, email FROM users WHERE email = ?', [email]);
    if (!rows[0]) return res.status(404).json({ error: 'User not found' });
    // Generate reset token (JWT, 15 min expiry)
    const resetToken = jwt.sign({ id: rows[0].id, email: rows[0].email }, JWT_SECRET, { expiresIn: '15m' });
    // In real app, email this token as a link
    res.json({ resetToken });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Reset password endpoint
app.post('/api/auth/reset', async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ error: 'Token and new password required' });
    let payload;
    try {
      payload = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return res.status(400).json({ error: 'Invalid or expired token' });
    }
    const hashed = await bcrypt.hash(password, 10);
    await db.query('UPDATE users SET password = ? WHERE id = ?', [hashed, payload.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get current user
app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT id, username, email, picture, phone, mobile_phone, location FROM users WHERE id = ?', [req.user.id]);
    if (!rows[0]) return res.status(404).json({ error: 'User not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update user profile
app.put('/api/auth/profile', authenticateToken, async (req, res) => {
  try {
    const { username, phone, mobile_phone, location } = req.body;
    const userId = req.user.id;
    
    // Check if username is already taken by another user
    if (username) {
      const [existingUser] = await db.query(
        'SELECT id FROM users WHERE username = ? AND id != ?',
        [username, userId]
      );
      if (existingUser.length > 0) {
        return res.status(409).json({ error: 'Username already taken' });
      }
    }
    
    // Update user profile
    const updateFields = [];
    const updateValues = [];
    
    if (username !== undefined) {
      updateFields.push('username = ?');
      updateValues.push(username);
    }
    if (phone !== undefined) {
      updateFields.push('phone = ?');
      updateValues.push(phone);
    }
    if (mobile_phone !== undefined) {
      updateFields.push('mobile_phone = ?');
      updateValues.push(mobile_phone);
    }
    if (location !== undefined) {
      updateFields.push('location = ?');
      updateValues.push(location);
    }
    
    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    
    updateValues.push(userId);
    const sql = `UPDATE users SET ${updateFields.join(', ')} WHERE id = ?`;
    await db.query(sql, updateValues);
    
    // Get updated user data
    const [rows] = await db.query(
      'SELECT id, username, email, picture, phone, mobile_phone, location FROM users WHERE id = ?',
      [userId]
    );
    
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update user email
app.put('/api/auth/email', authenticateToken, async (req, res) => {
  try {
    const { currentEmail, newEmail, currentPassword } = req.body;
    const userId = req.user.id;
    
    if (!currentEmail || !newEmail || !currentPassword) {
      return res.status(400).json({ error: 'Current email, new email, and current password are required' });
    }
    
    // Verify current user data
    const [userRows] = await db.query(
      'SELECT email, password FROM users WHERE id = ?',
      [userId]
    );
    
    if (userRows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const user = userRows[0];
    
    // Verify current email matches
    if (user.email !== currentEmail) {
      return res.status(400).json({ error: 'Current email does not match' });
    }
    
    // Verify current password
    const validPassword = await bcrypt.compare(currentPassword, user.password);
    if (!validPassword) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }
    
    // Check if new email is already taken
    const [existingUser] = await db.query(
      'SELECT id FROM users WHERE email = ? AND id != ?',
      [newEmail, userId]
    );
    if (existingUser.length > 0) {
      return res.status(409).json({ error: 'Email already taken' });
    }
    
    // Update email
    await db.query('UPDATE users SET email = ? WHERE id = ?', [newEmail, userId]);
    
    // Get updated user data
    const [rows] = await db.query(
      'SELECT id, username, email, picture, phone, mobile_phone, location FROM users WHERE id = ?',
      [userId]
    );
    
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Upload profile picture
app.post('/api/auth/profile-picture', authenticateToken, upload.single('picture'), async (req, res) => {
  try {
    const userId = req.user.id;
    const file = req.file;
    
    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    // Check if file is an image
    const allowedTypes = /jpeg|jpg|png|gif/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (!mimetype || !extname) {
      // Delete uploaded file
      if (fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }
      return res.status(400).json({ error: 'Only image files are allowed' });
    }
    
    // Get current user to delete old picture if exists
    const [userRows] = await db.query(
      'SELECT picture FROM users WHERE id = ?',
      [userId]
    );
    
    if (userRows.length > 0 && userRows[0].picture) {
      const oldPicturePath = path.join(__dirname, '..', userRows[0].picture);
      if (fs.existsSync(oldPicturePath)) {
        fs.unlinkSync(oldPicturePath);
      }
    }
    
    // Update user with new picture path
    const picturePath = `uploads/${file.filename}`;
    await db.query('UPDATE users SET picture = ? WHERE id = ?', [picturePath, userId]);
    
    // Get updated user data
    const [rows] = await db.query(
      'SELECT id, username, email, picture, phone, mobile_phone, location FROM users WHERE id = ?',
      [userId]
    );
    
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Working Status API Endpoints

// Get user's working status
app.get('/api/auth/working-status', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const [rows] = await db.query(
      'SELECT * FROM working_status WHERE user_id = ? ORDER BY created_at DESC LIMIT 1',
      [userId]
    );
    
    if (rows.length === 0) {
      // Return default status if none exists
      res.json({
        status: 'in-office',
        start_date: new Date().toISOString().split('T')[0],
        end_date: new Date().toISOString().split('T')[0],
        disable_notifications: false,
        disable_online_indication: false
      });
    } else {
      res.json(rows[0]);
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update user's working status
app.put('/api/auth/working-status', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { status, start_date, end_date, disable_notifications, disable_online_indication } = req.body;
    
    console.log('Working status update request:', {
      userId,
      status,
      start_date,
      end_date,
      disable_notifications,
      disable_online_indication
    });
    
    // Validate required fields
    if (!status || !start_date || !end_date) {
      console.log('Validation failed: missing required fields');
      return res.status(400).json({ error: 'Status, start_date, and end_date are required' });
    }
    
    // Check if user already has a working status
    const [existingRows] = await db.query(
      'SELECT id FROM working_status WHERE user_id = ?',
      [userId]
    );
    
    console.log('Existing rows:', existingRows);
    
    if (existingRows.length > 0) {
      // Update existing status
      console.log('Updating existing status for user:', userId);
      await db.query(
        `UPDATE working_status SET 
         status = ?, start_date = ?, end_date = ?, 
         disable_notifications = ?, disable_online_indication = ?,
         updated_at = CURRENT_TIMESTAMP
         WHERE user_id = ?`,
        [status, start_date, end_date, disable_notifications, disable_online_indication, userId]
      );
    } else {
      // Create new status
      console.log('Creating new status for user:', userId);
      await db.query(
        `INSERT INTO working_status 
         (user_id, status, start_date, end_date, disable_notifications, disable_online_indication)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [userId, status, start_date, end_date, disable_notifications, disable_online_indication]
      );
    }
    
    // Get updated status
    const [rows] = await db.query(
      'SELECT * FROM working_status WHERE user_id = ? ORDER BY created_at DESC LIMIT 1',
      [userId]
    );
    
    console.log('Updated status:', rows[0]);
    res.json(rows[0]);
  } catch (err) {
    console.error('Error in working status update:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get all tasks (optionally by section and workplace_id)
app.get('/api/tasks', async (req, res) => {
  try {
    const { section, workplace_id } = req.query;
    let sql = 'SELECT * FROM tasks WHERE 1=1';
    let params = [];
    if (section) {
      sql += ' AND section = ?';
      params.push(section);
    }
    if (workplace_id) {
      sql += ' AND workplace_id = ?';
      params.push(workplace_id);
    }
    sql += ' ORDER BY position ASC, id ASC';
    const [rows] = await db.query(sql, params);
    console.log('GET /api/tasks - Returning tasks:', rows); // Debug log
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a task
app.delete('/api/tasks/:task_id', async (req, res) => {
  try {
    const { task_id } = req.params;
    
    // Check if task exists
    const [taskRows] = await db.query('SELECT * FROM tasks WHERE id = ?', [task_id]);
    if (taskRows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    // Delete related data first (task_updates, task_files, etc.)
    await db.query('DELETE FROM task_updates WHERE task_id = ?', [task_id]);
    await db.query('DELETE FROM task_files WHERE task_id = ?', [task_id]);
    
    // Delete the task
    await db.query('DELETE FROM tasks WHERE id = ?', [task_id]);
    
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add this endpoint to persist task order
app.post('/api/tasks/reorder', async (req, res) => {
  const connection = await db.getConnection(); // For transaction
  try {
    const { orderedIds } = req.body; // e.g., [3, 1, 2, 4]
    console.log('Received reorder request:', orderedIds);
    if (!Array.isArray(orderedIds)) {
      console.error('orderedIds is not an array:', orderedIds);
      return res.status(400).json({ error: 'orderedIds must be an array' });
    }
    await connection.beginTransaction();
    for (let i = 0; i < orderedIds.length; i++) {
      const [result] = await connection.query('UPDATE tasks SET position = ? WHERE id = ?', [i, orderedIds[i]]);
      if (result.affectedRows === 0) {
        await connection.rollback();
        console.error('Task ID not found or not updated:', orderedIds[i]);
        return res.status(404).json({ error: `Task ID ${orderedIds[i]} not found` });
      }
    }
    await connection.commit();
    console.log('Reorder successful');
    res.json({ success: true });
  } catch (err) {
    if (connection) await connection.rollback();
    console.error('Reorder error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    if (connection) connection.release();
  }
});

// Get a single task by ID
app.get('/api/tasks/:id', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM tasks WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Task not found' });
    console.log('GET /api/tasks/:id - Returning task:', rows[0]); // Debug log
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Test endpoint to check database schema
app.get('/api/test-schema', async (req, res) => {
  try {
    const [rows] = await db.query('DESCRIBE tasks');
    console.log('Database schema for tasks table:', rows);
    res.json({ schema: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create a new task
app.post('/api/tasks', async (req, res) => {
  try {
    console.log('Received body:', req.body); // Debug log for workplace_id
    const {
      item, developer, support, requested_by,
      status_label, status_color,
      priority_label, priority_color,
      section, workplace_id, due_date // <-- add due_date
    } = req.body;
    console.log('Creating task with due_date:', due_date); // Debug log
    const [result] = await db.query(
      `INSERT INTO tasks
      (item, developer, support, requested_by, status_label, status_color, priority_label, priority_color, section, workplace_id, due_date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)` ,
      [item, developer, support, requested_by, status_label, status_color, priority_label, priority_color, section, workplace_id, due_date]
    );
    
    // Create activity log entry for task creation
    await db.query(
      `INSERT INTO activity_logs 
       (task_id, action_type, field_name, old_value, new_value, user_id, created_at) 
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [result.insertId, 'task_created', 'item', null, item, 3]
    );
    
    const [rows] = await db.query('SELECT * FROM tasks WHERE id = ?', [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update a task
app.put('/api/tasks/:id', async (req, res) => {
  try {
    const taskId = req.params.id;
    const {
      item, developer, support, requested_by,
      status_label, status_color,
      priority_label, priority_color,
      section, due_date
    } = req.body;
    
    // Get current task data to compare changes
    const [currentTask] = await db.query('SELECT * FROM tasks WHERE id = ?', [taskId]);
    if (currentTask.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    const current = currentTask[0];
    
    // Update the task
    await db.query(
      `UPDATE tasks SET
      item=?, developer=?, support=?, requested_by=?,
      status_label=?, status_color=?,
      priority_label=?, priority_color=?, section=?, due_date=?
      WHERE id=?`,
      [item, developer, support, requested_by, status_label, status_color, priority_label, priority_color, section, due_date, taskId]
    );
    
    // Create activity log entries for changes
    const changes = [];
    
    if (current.status_label !== status_label) {
      changes.push({
        action_type: 'status_change',
        field_name: 'status',
        old_value: current.status_label,
        new_value: status_label
      });
    }
    
    if (current.priority_label !== priority_label) {
      changes.push({
        action_type: 'priority_change',
        field_name: 'priority',
        old_value: current.priority_label,
        new_value: priority_label
      });
    }
    
    if (current.item !== item) {
      changes.push({
        action_type: 'task_updated',
        field_name: 'item',
        old_value: current.item,
        new_value: item
      });
    }
    
    if (current.due_date !== due_date) {
      changes.push({
        action_type: 'due_date_change',
        field_name: 'due_date',
        old_value: current.due_date,
        new_value: due_date
      });
    }
    
    // Insert activity log entries
    for (const change of changes) {
              await db.query(
          `INSERT INTO activity_logs 
           (task_id, action_type, field_name, old_value, new_value, user_id, created_at) 
           VALUES (?, ?, ?, ?, ?, ?, NOW())`,
          [taskId, change.action_type, change.field_name, change.old_value, change.new_value, 3]
        );
    }
    
    const [rows] = await db.query('SELECT * FROM tasks WHERE id = ?', [taskId]);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add a new update to a task
app.post('/api/task_updates', async (req, res) => {
  try {
    const { task_id, text } = req.body;
    if (!task_id || !text) {
      return res.status(400).json({ error: 'task_id and text are required' });
    }
    await db.query(
      'INSERT INTO task_updates (task_id, text, created_at) VALUES (?, ?, NOW())',
      [task_id, text]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all updates for a task
app.get('/api/task_updates/:task_id', async (req, res) => {
  try {
    const { task_id } = req.params;
    const [rows] = await db.query(
      'SELECT * FROM task_updates WHERE task_id = ? ORDER BY created_at DESC',
      [task_id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// React to an update (like Facebook reactions)
app.post('/api/update_reactions', async (req, res) => {
  try {
    const { update_id, reaction_type = 'like', user_id = 1 } = req.body; // Default user_id for now
    if (!update_id) {
      return res.status(400).json({ error: 'update_id is required' });
    }
    
    // Check if user already reacted
    const [existing] = await db.query(
      'SELECT * FROM update_reactions WHERE update_id = ? AND user_id = ?',
      [update_id, user_id]
    );
    
    if (existing.length > 0) {
      if (existing[0].reaction_type === reaction_type) {
        // Remove reaction if same type
        await db.query(
          'DELETE FROM update_reactions WHERE update_id = ? AND user_id = ?',
          [update_id, user_id]
        );
        res.json({ reacted: false, reaction_type: null });
      } else {
        // Change reaction type
        await db.query(
          'UPDATE update_reactions SET reaction_type = ? WHERE update_id = ? AND user_id = ?',
          [reaction_type, update_id, user_id]
        );
        res.json({ reacted: true, reaction_type });
      }
    } else {
      // Add new reaction
      await db.query(
        'INSERT INTO update_reactions (update_id, user_id, reaction_type, created_at) VALUES (?, ?, ?, NOW())',
        [update_id, user_id, reaction_type]
      );
      res.json({ reacted: true, reaction_type });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get reactions for an update
app.get('/api/update_reactions/:update_id', async (req, res) => {
  try {
    const { update_id } = req.params;
    const [rows] = await db.query(
      'SELECT reaction_type, COUNT(*) as count FROM update_reactions WHERE update_id = ? GROUP BY reaction_type',
      [update_id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get user's reaction for an update
app.get('/api/update_reactions/:update_id/user', async (req, res) => {
  try {
    const { update_id } = req.params;
    const { user_id = 1 } = req.query; // Default user_id for now
    const [rows] = await db.query(
      'SELECT reaction_type FROM update_reactions WHERE update_id = ? AND user_id = ?',
      [update_id, user_id]
    );
    res.json({ reaction_type: rows.length > 0 ? rows[0].reaction_type : null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add comment to an update
app.post('/api/update_comments', async (req, res) => {
  try {
    const { update_id, text, user_id = 1 } = req.body; // Default user_id for now
    if (!update_id || !text) {
      return res.status(400).json({ error: 'update_id and text are required' });
    }
    
    await db.query(
      'INSERT INTO update_comments (update_id, text, user_id, created_at) VALUES (?, ?, ?, NOW())',
      [update_id, text, user_id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get likes count for an update
app.get('/api/update_likes/:update_id', async (req, res) => {
  try {
    const { update_id } = req.params;
    const [rows] = await db.query(
      'SELECT COUNT(*) as count FROM update_likes WHERE update_id = ?',
      [update_id]
    );
    res.json({ count: rows[0].count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Toggle like for an update
app.post('/api/update_likes/:update_id', async (req, res) => {
  try {
    const { update_id } = req.params;
    const { user_id = 1 } = req.body; // Default user_id for now
    
    // Check if user already liked this update
    const [existingLikes] = await db.query(
      'SELECT * FROM update_likes WHERE update_id = ? AND user_id = ?',
      [update_id, user_id]
    );
    
    if (existingLikes.length > 0) {
      // Unlike
      await db.query(
        'DELETE FROM update_likes WHERE update_id = ? AND user_id = ?',
        [update_id, user_id]
      );
    } else {
      // Like
      await db.query(
        'INSERT INTO update_likes (update_id, user_id, created_at) VALUES (?, ?, NOW())',
        [update_id, user_id]
      );
    }
    
    // Get updated count
    const [countRows] = await db.query(
      'SELECT COUNT(*) as count FROM update_likes WHERE update_id = ?',
      [update_id]
    );
    
    res.json({ 
      success: true, 
      count: countRows[0].count,
      liked: existingLikes.length === 0 // If we just added a like, user now likes it
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get comments for an update
app.get('/api/update_comments/:update_id', async (req, res) => {
  try {
    const { update_id } = req.params;
    const [rows] = await db.query(
      'SELECT * FROM update_comments WHERE update_id = ? ORDER BY created_at ASC',
      [update_id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update a comment
app.put('/api/update_comments/:comment_id', async (req, res) => {
  try {
    const { comment_id } = req.params;
    const { text } = req.body;
    
    if (!text) {
      return res.status(400).json({ error: 'text is required' });
    }
    
    await db.query(
      'UPDATE update_comments SET text = ? WHERE id = ?',
      [text, comment_id]
    );
    
    // Get updated comment
    const [rows] = await db.query(
      'SELECT * FROM update_comments WHERE id = ?',
      [comment_id]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Comment not found' });
    }
    
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a comment
app.delete('/api/update_comments/:comment_id', async (req, res) => {
  try {
    const { comment_id } = req.params;
    
    await db.query('DELETE FROM update_comments WHERE id = ?', [comment_id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add reaction to an update
app.post('/api/update_reactions', async (req, res) => {
  try {
    const { update_id, reaction_type, user_id = 1 } = req.body;
    
    if (!update_id || !reaction_type) {
      return res.status(400).json({ error: 'update_id and reaction_type are required' });
    }
    
    // Check if user already reacted to this update
    const [existingReactions] = await db.query(
      'SELECT * FROM update_reactions WHERE update_id = ? AND user_id = ?',
      [update_id, user_id]
    );
    
    if (existingReactions.length > 0) {
      // Update existing reaction
      await db.query(
        'UPDATE update_reactions SET reaction_type = ?, updated_at = NOW() WHERE update_id = ? AND user_id = ?',
        [reaction_type, update_id, user_id]
      );
    } else {
      // Add new reaction
      await db.query(
        'INSERT INTO update_reactions (update_id, user_id, reaction_type, created_at, updated_at) VALUES (?, ?, ?, NOW(), NOW())',
        [update_id, user_id, reaction_type]
      );
    }
    
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get reactions for an update
app.get('/api/update_reactions/:update_id', async (req, res) => {
  try {
    const { update_id } = req.params;
    const [rows] = await db.query(
      'SELECT * FROM update_reactions WHERE update_id = ? ORDER BY created_at ASC',
      [update_id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Remove reaction from an update
app.delete('/api/update_reactions/:update_id/:user_id', async (req, res) => {
  try {
    const { update_id, user_id } = req.params;
    
    await db.query(
      'DELETE FROM update_reactions WHERE update_id = ? AND user_id = ?',
      [update_id, user_id]
    );
    
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all workplaces
app.get('/api/workplaces', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM workplaces');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add a new workplace
app.post('/api/workplaces', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    const [result] = await db.query('INSERT INTO workplaces (name) VALUES (?)', [name]);
    const [rows] = await db.query('SELECT * FROM workplaces WHERE id = ?', [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update a workplace (edit name)
app.put('/api/workplaces/:id', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    await db.query('UPDATE workplaces SET name = ? WHERE id = ?', [name, req.params.id]);
    const [rows] = await db.query('SELECT * FROM workplaces WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Workspace not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a workplace
app.delete('/api/workplaces/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM workplaces WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all users
app.get('/api/users', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM users');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Section order endpoints
app.get('/api/section-order', async (req, res) => {
  const { workspace_id } = req.query;
  const [rows] = await db.query(
    'SELECT * FROM section_order WHERE workspace_id = ? ORDER BY updated_at DESC LIMIT 1',
    [workspace_id || 0]
  );
  if (rows.length > 0) {
    res.json(JSON.parse(rows[0].order_json));
  } else {
    // Default order if not set
    res.json(["Priority", "In Progress", "Next", "AWS", "Event Platform", "On Hold", "Completed"]);
  }
});

app.post('/api/section-order', async (req, res) => {
  const { workspace_id, order } = req.body;
  if (!Array.isArray(order)) return res.status(400).json({ error: 'Order must be an array' });
  // Upsert logic: delete old, insert new (or use ON DUPLICATE KEY if unique index on workspace_id)
  await db.query('DELETE FROM section_order WHERE workspace_id = ?', [workspace_id || 0]);
  await db.query(
    'INSERT INTO section_order (workspace_id, order_json) VALUES (?, ?)',
    [workspace_id || 0, JSON.stringify(order)]
  );
  res.json({ success: true });
});

// Upload file for a task
app.post('/api/task_files', upload.single('file'), async (req, res) => {
  try {
    const { task_id, description = '' } = req.body;
    const file = req.file;
    
    if (!task_id || !file) {
      return res.status(400).json({ error: 'task_id and file are required' });
    }
    
    const [result] = await db.query(
      'INSERT INTO task_files (task_id, filename, original_name, file_path, description, file_size, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())',
      [task_id, file.filename, file.originalname, file.path, description, file.size]
    );
    
    const [rows] = await db.query('SELECT * FROM task_files WHERE id = ?', [result.insertId]);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get files for a task
app.get('/api/task_files/:task_id', async (req, res) => {
  try {
    const { task_id } = req.params;
    const [rows] = await db.query(
      'SELECT * FROM task_files WHERE task_id = ? ORDER BY created_at DESC',
      [task_id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Download all files for a task as ZIP
app.get('/api/task_files/:task_id/download-all', async (req, res) => {
  try {
    const { task_id } = req.params;
    
    // Get all files for the task
    const [files] = await db.query(
      'SELECT * FROM task_files WHERE task_id = ?',
      [task_id]
    );
    
    if (files.length === 0) {
      return res.status(404).json({ error: 'No files found for this task' });
    }
    
    // Create ZIP archive
    const archive = archiver('zip', {
      zlib: { level: 9 } // Sets the compression level
    });
    
    // Set response headers
    res.attachment(`task-${task_id}-files.zip`);
    archive.pipe(res);
    
    // Add each file to the archive
    for (const file of files) {
      if (fs.existsSync(file.file_path)) {
        archive.file(file.file_path, { name: file.original_name });
      }
    }
    
    // Finalize the archive
    await archive.finalize();
    
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a file
app.delete('/api/task_files/:file_id', async (req, res) => {
  try {
    const { file_id } = req.params;
    
    // Get file info first
    const [fileRows] = await db.query('SELECT * FROM task_files WHERE id = ?', [file_id]);
    if (fileRows.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    const file = fileRows[0];
    
    // Delete physical file
    if (fs.existsSync(file.file_path)) {
      fs.unlinkSync(file.file_path);
    }
    
    // Delete from database
    await db.query('DELETE FROM task_files WHERE id = ?', [file_id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Activity Log endpoints
app.post('/api/activity_logs', async (req, res) => {
  try {
    const { task_id, action_type, field_name, old_value, new_value, user_id = 1 } = req.body;
    
    if (!task_id || !action_type || !field_name) {
      return res.status(400).json({ error: 'task_id, action_type, and field_name are required' });
    }
    
    const [result] = await db.query(
      `INSERT INTO activity_logs 
       (task_id, action_type, field_name, old_value, new_value, user_id, created_at) 
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [task_id, action_type, field_name, old_value, new_value, user_id]
    );
    
    // Get the created activity log entry
    const [rows] = await db.query(
      'SELECT * FROM activity_logs WHERE id = ?',
      [result.insertId]
    );
    
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get activity logs for a specific task
app.get('/api/activity_logs/:task_id', async (req, res) => {
  try {
    const { task_id } = req.params;
    const [rows] = await db.query(
      `SELECT al.*, u.username, u.email 
       FROM activity_logs al 
       LEFT JOIN users u ON al.user_id = u.id 
       WHERE al.task_id = ? 
       ORDER BY al.created_at DESC`,
      [task_id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all activity logs for a workspace
app.get('/api/activity_logs', async (req, res) => {
  try {
    const { workspace_id } = req.query;
    
    let sql = `
      SELECT al.*, u.username, u.email, t.item as task_name
      FROM activity_logs al 
      LEFT JOIN users u ON al.user_id = u.id 
      LEFT JOIN tasks t ON al.task_id = t.id
    `;
    
    let params = [];
    
    if (workspace_id) {
      sql += ' WHERE t.workplace_id = ?';
      params.push(workspace_id);
    }
    
    sql += ' ORDER BY al.created_at DESC';
    
    const [rows] = await db.query(sql, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all updates with task information for search
app.get('/api/all_updates', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT 
        tu.id,
        tu.text,
        tu.created_at,
        t.id as task_id,
        t.item as task_name,
        t.status_label,
        t.priority_label
      FROM task_updates tu
      JOIN tasks t ON tu.task_id = t.id
      ORDER BY tu.created_at DESC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all files with task information for search
app.get('/api/all_files', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT 
        tf.id,
        tf.filename,
        tf.original_name,
        tf.file_size,
        tf.created_at,
        t.id as task_id,
        t.item as task_name,
        t.status_label,
        t.priority_label
      FROM task_files tf
      JOIN tasks t ON tf.task_id = t.id
      ORDER BY tf.created_at DESC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all boards with task counts for Cross Boards search
app.get('/api/all_boards', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT 
        w.id,
        w.name as board_name,
        COUNT(t.id) as task_count,
        COUNT(CASE WHEN t.status_label = 'Completed' THEN 1 END) as completed_tasks,
        COUNT(CASE WHEN t.status_label != 'Completed' THEN 1 END) as active_tasks
      FROM workplaces w
      LEFT JOIN tasks t ON w.id = t.workplace_id
      GROUP BY w.id, w.name
      ORDER BY w.name ASC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get user preferences
app.get('/api/user_preferences', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    
    const [rows] = await db.query(
      'SELECT * FROM user_preferences WHERE user_id = ?',
      [userId]
    );
    
    if (rows.length === 0) {
      // Return default preferences if none exist
      res.json({
        language: 'en',
        timezone: '(GMT+05:00) Islamabad',
        time_format: '12h',
        date_format: 'MMM DD, YYYY',
        first_day_of_week: 'monday'
      });
    } else {
      res.json(rows[0]);
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update user preferences
app.put('/api/user_preferences', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { language, timezone, time_format, date_format, first_day_of_week } = req.body;
    
    // Validate input
    if (!language || !timezone || !time_format || !date_format || !first_day_of_week) {
      return res.status(400).json({ error: 'All preference fields are required' });
    }
    
    // Check if preferences exist
    const [existing] = await db.query(
      'SELECT id FROM user_preferences WHERE user_id = ?',
      [userId]
    );
    
    if (existing.length > 0) {
      // Update existing preferences
      await db.query(
        `UPDATE user_preferences 
         SET language = ?, timezone = ?, time_format = ?, date_format = ?, first_day_of_week = ?
         WHERE user_id = ?`,
        [language, timezone, time_format, date_format, first_day_of_week, userId]
      );
    } else {
      // Insert new preferences
      await db.query(
        `INSERT INTO user_preferences (user_id, language, timezone, time_format, date_format, first_day_of_week)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [userId, language, timezone, time_format, date_format, first_day_of_week]
      );
    }
    
    res.json({ message: 'Preferences updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Change password endpoint
app.put('/api/auth/change-password', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }
    
    // Get user's current password
    const [rows] = await db.query(
      'SELECT password FROM users WHERE id = ?',
      [userId]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Verify current password
    const valid = await bcrypt.compare(currentPassword, rows[0].password);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid current password' });
    }
    
    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    // Update password
    await db.query(
      'UPDATE users SET password = ? WHERE id = ?',
      [hashedPassword, userId]
    );
    
    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Reset password endpoint (send reset email)
app.post('/api/auth/reset-password', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Get user's email
    const [rows] = await db.query(
      'SELECT email FROM users WHERE id = ?',
      [userId]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const userEmail = rows[0].email;
    
    // Generate reset token (in a real app, you'd use a proper token generation)
    const resetToken = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    
    // Store reset token in database (you'd need a password_resets table)
    // For now, we'll just simulate the email sending
    
    // In a real implementation, you would:
    // 1. Store the reset token in a password_resets table with expiration
    // 2. Send an email with the reset link
    // 3. Create a separate endpoint to handle the actual password reset
    
    console.log(`Password reset email would be sent to: ${userEmail}`);
    console.log(`Reset token: ${resetToken}`);
    
    res.json({ 
      message: 'Password reset email sent successfully',
      note: 'In a real implementation, an email would be sent with a reset link'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get session history for user
app.get('/api/session_history', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    
    const [rows] = await db.query(`
      SELECT 
        id,
        device,
        browser,
        location,
        ip_address,
        is_active,
        last_activity,
        created_at
      FROM session_history 
      WHERE user_id = ? 
      ORDER BY last_activity DESC
    `, [userId]);
    
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Logout specific session
app.delete('/api/session_history/:sessionId', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const sessionId = req.params.sessionId;
    
    // Verify the session belongs to the user
    const [session] = await db.query(
      'SELECT id FROM session_history WHERE id = ? AND user_id = ?',
      [sessionId, userId]
    );
    
    if (session.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    // Mark session as inactive
    await db.query(
      'UPDATE session_history SET is_active = FALSE WHERE id = ?',
      [sessionId]
    );
    
    res.json({ message: 'Session logged out successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Logout all sessions except current
app.delete('/api/session_history/logout-all', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const currentToken = req.headers.authorization.split(' ')[1];
    
    // Mark all other sessions as inactive
    await db.query(
      'UPDATE session_history SET is_active = FALSE WHERE user_id = ? AND session_token != ?',
      [userId, currentToken]
    );
    
    res.json({ message: 'All other sessions logged out successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create new session (called on login)
app.post('/api/session_history', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { device, browser, location, ip_address, user_agent } = req.body;
    const sessionToken = req.headers.authorization.split(' ')[1];
    
    await db.query(`
      INSERT INTO session_history (user_id, session_token, device, browser, location, ip_address, user_agent)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [userId, sessionToken, device, browser, location, ip_address, user_agent]);
    
    res.json({ message: 'Session created successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get user favorites
app.get('/api/favorites', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    
    const [rows] = await db.query(`
      SELECT f.workspace_id, w.name
      FROM favorites f
      JOIN workplaces w ON f.workspace_id = w.id
      WHERE f.user_id = ?
      ORDER BY f.created_at DESC
    `, [userId]);
    
    res.json(rows);
  } catch (err) {
    console.error('Error fetching favorites:', err);
    res.status(500).json({ error: err.message });
  }
});

// Add workspace to favorites
app.post('/api/favorites', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { workspace_id } = req.body;
    
    // Check if workspace exists
    const [workspace] = await db.query('SELECT id FROM workplaces WHERE id = ?', [workspace_id]);
    if (workspace.length === 0) {
      return res.status(404).json({ error: 'Workspace not found' });
    }
    
    // Add to favorites (UNIQUE constraint will prevent duplicates)
    await db.query('INSERT INTO favorites (user_id, workspace_id) VALUES (?, ?)', [userId, workspace_id]);
    
    res.json({ message: 'Added to favorites' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      res.status(409).json({ error: 'Already in favorites' });
    } else {
      res.status(500).json({ error: err.message });
    }
  }
});

// Remove workspace from favorites
app.delete('/api/favorites/:workspace_id', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const workspace_id = req.params.workspace_id;
    
    const [result] = await db.query(
      'DELETE FROM favorites WHERE user_id = ? AND workspace_id = ?',
      [userId, workspace_id]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Favorite not found' });
    }
    
    res.json({ message: 'Removed from favorites' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
