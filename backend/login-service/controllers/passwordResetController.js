const crypto = require("crypto");
const { hashPassword } = require("../utils/hash");
const { findUserByEmail } = require("../models/loginModel");
const profileModel = require("../models/profileModel");

// ============================
// Password Reset Token Helpers
// ============================

/**
 * Generate a secure random token
 * @returns {string} 32-character hex token
 */
const generateResetToken = () => {
  return crypto.randomBytes(32).toString("hex");
};

/**
 * Create password reset token in database
 * @param {number} userId
 * @param {string} token
 * @returns {Promise<void>}
 */
const createResetToken = (userId, token) => {
  return new Promise((resolve, reject) => {
    // Token expires in 1 hour
    const expiresAt = new Date(Date.now() + 3600000).toISOString();

    const query = `
      INSERT INTO password_reset_tokens (user_id, token, expires_at)
      VALUES (?, ?, ?)
    `;

    profileModel.db.run(query, [userId, token, expiresAt], function(err) {
      if (err) reject(err);
      else resolve();
    });
  });
};

/**
 * Find valid reset token
 * @param {string} token
 * @returns {Promise<Object|null>}
 */
const findResetToken = (token) => {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT * FROM password_reset_tokens
      WHERE token = ?
        AND used = 0
        AND expires_at > datetime('now')
    `;

    profileModel.db.get(query, [token], (err, row) => {
      if (err) reject(err);
      else resolve(row || null);
    });
  });
};

/**
 * Mark token as used
 * @param {string} token
 * @returns {Promise<void>}
 */
const markTokenUsed = (token) => {
  return new Promise((resolve, reject) => {
    const query = "UPDATE password_reset_tokens SET used = 1 WHERE token = ?";
    profileModel.db.run(query, [token], function(err) {
      if (err) reject(err);
      else resolve();
    });
  });
};

/**
 * Delete old/expired tokens for user
 * @param {number} userId
 * @returns {Promise<void>}
 */
const deleteOldTokens = (userId) => {
  return new Promise((resolve, reject) => {
    const query = `
      DELETE FROM password_reset_tokens
      WHERE user_id = ?
        AND (used = 1 OR expires_at < datetime('now'))
    `;
    profileModel.db.run(query, [userId], function(err) {
      if (err) reject(err);
      else resolve();
    });
  });
};

// ============================
// Password Reset Controllers
// ============================

/**
 * Request password reset
 * Generates a reset token and returns it (in production, send via email)
 * @route POST /api/password-reset/request
 * @access Public
 */
const requestPasswordReset = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    // Find user by email
    const user = await findUserByEmail(email);

    // SECURITY: Don't reveal if email exists or not
    if (!user) {
      return res.json({ 
        message: "If an account exists with this email, a reset link has been sent." 
      });
    }

    // Delete old tokens for this user
    await deleteOldTokens(user.id);

    // Generate new token
    const token = generateResetToken();

    // Save token to database
    await createResetToken(user.id, token);

    // Log the reset request
    await new Promise((resolve, reject) => {
      const query = `
        INSERT INTO audit_log (user_id, action_type, details)
        VALUES (?, 'PASSWORD_RESET_REQUEST', 'User requested password reset')
      `;
      profileModel.db.run(query, [user.id], function(err) {
        if (err) reject(err);
        else resolve();
      });
    });

    // PRODUCTION: Send email with reset link
    // For development, return token in response
    const isDevelopment = process.env.NODE_ENV !== 'production';
    
    if (isDevelopment) {
      return res.json({
        message: "Password reset token generated",
        token: token, // REMOVE IN PRODUCTION
        resetUrl: `http://localhost:3000/reset-password?token=${token}` // REMOVE IN PRODUCTION
      });
    }

    res.json({ 
      message: "If an account exists with this email, a reset link has been sent." 
    });
  } catch (err) {
    console.error("Password reset request error:", err);
    res.status(500).json({ message: "Failed to process password reset request" });
  }
};

/**
 * Verify reset token
 * @route GET /api/password-reset/verify/:token
 * @access Public
 */
const verifyResetToken = async (req, res) => {
  try {
    const { token } = req.params;

    if (!token) {
      return res.status(400).json({ message: "Token is required" });
    }

    // Find valid token
    const resetToken = await findResetToken(token);

    if (!resetToken) {
      return res.status(400).json({ 
        message: "Invalid or expired reset token" 
      });
    }

    res.json({ 
      valid: true,
      message: "Token is valid" 
    });
  } catch (err) {
    console.error("Verify token error:", err);
    res.status(500).json({ message: "Failed to verify token" });
  }
};

/**
 * Reset password with token
 * @route POST /api/password-reset/reset
 * @access Public
 */
const resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ 
        message: "Token and new password are required" 
      });
    }

    // Validate password complexity
    if (newPassword.length < 8) {
      return res.status(400).json({ 
        message: "Password must be at least 8 characters long" 
      });
    }

    // Find valid token
    const resetToken = await findResetToken(token);

    if (!resetToken) {
      return res.status(400).json({ 
        message: "Invalid or expired reset token" 
      });
    }

    // Hash new password
    const hashedPassword = await hashPassword(newPassword);

    // Update password
    await new Promise((resolve, reject) => {
      const query = "UPDATE users SET password = ? WHERE id = ?";
      profileModel.db.run(query, [hashedPassword, resetToken.user_id], function(err) {
        if (err) reject(err);
        else resolve();
      });
    });

    // Mark token as used
    await markTokenUsed(token);

    // Log password reset
    await new Promise((resolve, reject) => {
      const query = `
        INSERT INTO audit_log (user_id, action_type, details)
        VALUES (?, 'PASSWORD_RESET_COMPLETE', 'User reset password via token')
      `;
      profileModel.db.run(query, [resetToken.user_id], function(err) {
        if (err) reject(err);
        else resolve();
      });
    });

    res.json({ message: "Password reset successfully" });
  } catch (err) {
    console.error("Reset password error:", err);
    res.status(500).json({ message: "Failed to reset password" });
  }
};

module.exports = {
  requestPasswordReset,
  verifyResetToken,
  resetPassword
};