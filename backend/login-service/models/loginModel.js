const sqlite3 = require("sqlite3").verbose();
const path = require("path");

// FIX: Use DATABASE_PATH from environment variable (set by tests)
const dbPath = process.env.DATABASE_PATH || path.join(__dirname, "..", "db", "login.sqlite");

console.log(`[Model] Connecting to database at: ${dbPath}`);

const db = new sqlite3.Database(dbPath, (err) => 
{
  if (err) 
  {
    console.error("Failed to connect to DB:", err.message);
  } 
  else 
  {
    console.log("Connected to the SQLite database.");
  }
});

// ============================
// User Model Functions
// ============================

/**
 * Create a new user
 * @param {string} username
 * @param {string} email
 * @param {string} hashedPassword
 * @returns {Promise<Object>} Resolves with the new user object
 */
const createUser = (username, email, hashedPassword) => 
  {
    return new Promise((resolve, reject) => 
    {
      const query = `INSERT INTO users (username, email, password) VALUES (?, ?, ?)`;

      db.run(query, [username, email, hashedPassword], function(err) 
      {
        if (err) 
        {
          reject(err);
          return;
        }

      resolve({
        id: this.lastID,
        username,
        email,
      });
    });
  });
};

/**
 * Find a user by email
 * @param {string} email
 * @returns {Promise<Object|null>} Resolves with the user object or null if not found
 */
const findUserByEmail = (email) => {
  return new Promise((resolve, reject) => {
    const query = `SELECT * FROM users WHERE email = ? AND (is_deleted = 0 OR is_deleted IS NULL)`;
    db.get(query, [email], (err, row) => {
      if (err) reject(err);
      else resolve(row || null); // Return null if not found
    });
  });
};

/**
 * Find a user by username
 * @param {string} username
 * @returns {Promise<Object|null>} Resolves with the user object or null if not found
 */
const findUserByUsername = (username) => {
  return new Promise((resolve, reject) => {
    const query = `SELECT * FROM users WHERE username = ? AND (is_deleted = 0 OR is_deleted IS NULL)`;
    db.get(query, [username], (err, row) => {
      if (err) reject(err);
      else resolve(row || null); // Return null if not found
    });
  });
};

const findUserByIdIncludeDeleted = (userId) => 
{
  return new Promise((resolve, reject) => 
    {
    db.get(`SELECT * FROM users WHERE id = ?`, [userId], (err, row) => 
    {
      if (err) reject(err);
      else resolve(row || null);
    });
  });
};

const hideDeletedUser = (userId, deletedBy = null) => 
{
  return new Promise((resolve, reject) => 
  {
    db.run(
      `UPDATE users SET is_deleted = 1, deleted_at = CURRENT_TIMESTAMP, deleted_by = ? WHERE id = ?`,
      [deletedBy, userId],
      function(err) 
      {
        if (err) reject(err);
        else if (this.changes === 0) reject(new Error("User not found"));
        else resolve();
      }
    );
  });
};

const restoreUser = (userId) => 
{
  return new Promise((resolve, reject) => 
  {
    db.run(
      `UPDATE users SET is_deleted = 0, deleted_at = NULL, deleted_by = NULL WHERE id = ?`,
      [userId],
      function(err) 
      {
        if (err) reject(err);
        else if (this.changes === 0) reject(new Error("User not found"));
        else resolve();
      }
    );
  });
};

const listDeletedUsers = () => 
{
  return new Promise((resolve, reject) => 
  {
    db.all(
      `SELECT id, username, email, role, deleted_at, deleted_by FROM users WHERE is_deleted = 1 ORDER BY deleted_at DESC`,
      [],
      (err, rows) => 
      {
        if (err) reject(err);
        else resolve(rows || []);
      }
    );
  });
};

// Export functions and DB connection
module.exports = {
  createUser,
  findUserByEmail,
  findUserByUsername,
  findUserByIdIncludeDeleted,
  hideDeletedUser,  
  restoreUser,  
  listDeletedUsers,    
  db
};