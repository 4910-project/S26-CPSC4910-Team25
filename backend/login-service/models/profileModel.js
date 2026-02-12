const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, "..", "db", "login.sqlite");
console.log(`[Profile Model] Connecting to database at: ${dbPath}`);

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error("Failed to connect to DB:", err.message);
  } else {
    console.log("Profile Model connected to SQLite database.");
  }
});

// ============================
// Driver Profile Functions
// ============================

/**
 * Create a driver profile
 * @param {number} userId
 * @param {Object} profileData
 * @returns {Promise<Object>}
 */
const createDriverProfile = (userId, profileData) => {
  return new Promise((resolve, reject) => {
    const {
      first_name,
      last_name,
      phone,
      license_number,
      address,
      city,
      state,
      zip_code,
      sponsor_id
    } = profileData;

    const query = `
      INSERT INTO driver_profiles 
      (user_id, first_name, last_name, phone, license_number, address, city, state, zip_code, sponsor_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    db.run(
      query,
      [userId, first_name, last_name, phone, license_number, address, city, state, zip_code, sponsor_id],
      function(err) {
        if (err) {
          reject(err);
          return;
        }
        resolve({
          id: this.lastID,
          user_id: userId,
          ...profileData
        });
      }
    );
  });
};

/**
 * Get driver profile by user ID
 * @param {number} userId
 * @returns {Promise<Object|null>}
 */
const getDriverProfile = (userId) => {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT dp.*, u.username, u.email, u.role
      FROM driver_profiles dp
      JOIN users u ON dp.user_id = u.id
      WHERE dp.user_id = ?
    `;

    db.get(query, [userId], (err, row) => {
      if (err) reject(err);
      else resolve(row || null);
    });
  });
};

/**
 * Update driver profile
 * @param {number} userId
 * @param {Object} updates
 * @returns {Promise<Object>}
 */
const updateDriverProfile = (userId, updates) => {
  return new Promise((resolve, reject) => {
    const {
      first_name,
      last_name,
      phone,
      license_number,
      address,
      city,
      state,
      zip_code
    } = updates;

    const query = `
      UPDATE driver_profiles
      SET first_name = ?,
          last_name = ?,
          phone = ?,
          license_number = ?,
          address = ?,
          city = ?,
          state = ?,
          zip_code = ?
      WHERE user_id = ?
    `;

    db.run(
      query,
      [first_name, last_name, phone, license_number, address, city, state, zip_code, userId],
      function(err) {
        if (err) {
          reject(err);
          return;
        }
        if (this.changes === 0) {
          reject(new Error("Driver profile not found"));
          return;
        }
        resolve({ updated: true, changes: this.changes });
      }
    );
  });
};

// ============================
// Sponsor Profile Functions
// ============================

/**
 * Create a sponsor profile
 * @param {number} userId
 * @param {Object} profileData
 * @returns {Promise<Object>}
 */
const createSponsorProfile = (userId, profileData) => {
  return new Promise((resolve, reject) => {
    const {
      company_name,
      contact_name,
      phone,
      address,
      city,
      state,
      zip_code,
      point_value
    } = profileData;

    const query = `
      INSERT INTO sponsor_profiles 
      (user_id, company_name, contact_name, phone, address, city, state, zip_code, point_value)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    db.run(
      query,
      [userId, company_name, contact_name, phone, address, city, state, zip_code, point_value || 0.01],
      function(err) {
        if (err) {
          reject(err);
          return;
        }
        resolve({
          id: this.lastID,
          user_id: userId,
          ...profileData
        });
      }
    );
  });
};

/**
 * Get sponsor profile by user ID
 * @param {number} userId
 * @returns {Promise<Object|null>}
 */
const getSponsorProfile = (userId) => {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT sp.*, u.username, u.email, u.role
      FROM sponsor_profiles sp
      JOIN users u ON sp.user_id = u.id
      WHERE sp.user_id = ?
    `;

    db.get(query, [userId], (err, row) => {
      if (err) reject(err);
      else resolve(row || null);
    });
  });
};

/**
 * Update sponsor profile
 * @param {number} userId
 * @param {Object} updates
 * @returns {Promise<Object>}
 */
const updateSponsorProfile = (userId, updates) => {
  return new Promise((resolve, reject) => {
    const {
      company_name,
      contact_name,
      phone,
      address,
      city,
      state,
      zip_code,
      point_value
    } = updates;

    const query = `
      UPDATE sponsor_profiles
      SET company_name = ?,
          contact_name = ?,
          phone = ?,
          address = ?,
          city = ?,
          state = ?,
          zip_code = ?,
          point_value = ?
      WHERE user_id = ?
    `;

    db.run(
      query,
      [company_name, contact_name, phone, address, city, state, zip_code, point_value, userId],
      function(err) {
        if (err) {
          reject(err);
          return;
        }
        if (this.changes === 0) {
          reject(new Error("Sponsor profile not found"));
          return;
        }
        resolve({ updated: true, changes: this.changes });
      }
    );
  });
};

// ============================
// User Role Functions
// ============================

/**
 * Get user role
 * @param {number} userId
 * @returns {Promise<string|null>}
 */
const getUserRole = (userId) => {
  return new Promise((resolve, reject) => {
    const query = "SELECT role FROM users WHERE id = ?";
    db.get(query, [userId], (err, row) => {
      if (err) reject(err);
      else resolve(row ? row.role : null);
    });
  });
};

/**
 * Update user role
 * @param {number} userId
 * @param {string} role - DRIVER, SPONSOR, or ADMIN
 * @returns {Promise<Object>}
 */
const updateUserRole = (userId, role) => {
  return new Promise((resolve, reject) => {
    if (!['DRIVER', 'SPONSOR', 'ADMIN'].includes(role)) {
      reject(new Error("Invalid role"));
      return;
    }

    const query = "UPDATE users SET role = ? WHERE id = ?";
    db.run(query, [role, userId], function(err) {
      if (err) {
        reject(err);
        return;
      }
      resolve({ updated: true, changes: this.changes });
    });
  });
};

module.exports = {
  createDriverProfile,
  getDriverProfile,
  updateDriverProfile,
  createSponsorProfile,
  getSponsorProfile,
  updateSponsorProfile,
  getUserRole,
  updateUserRole,
  db
};