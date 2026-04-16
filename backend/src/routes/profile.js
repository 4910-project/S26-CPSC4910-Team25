/**
 * Profile Routes
 * File: backend/src/routes/profile.js
 *
 * Mounted in index.js as:
 *   app.use("/api/profile", profileRoutes);
 */

const express = require("express");
const bcrypt = require("bcryptjs");
const pool = require("../db");
const requireActiveSession = require("../middleware/requireActiveSession");

const router = express.Router();

router.use(requireActiveSession);

/**
 * Password complexity validator — same rules as auth.js.
 * Returns an error string, or null if valid.
 */
function validatePasswordComplexity(password) {
  if (!password || password.length < 8)  return "Password must be at least 8 characters";
  if (!/[A-Z]/.test(password))           return "Password must contain at least one uppercase letter";
  if (!/[a-z]/.test(password))           return "Password must contain at least one lowercase letter";
  if (!/[0-9]/.test(password))           return "Password must contain at least one number";
  if (!/[^A-Za-z0-9]/.test(password))   return "Password must contain at least one special character (!@#$%^&* etc.)";
  return null;
}

async function writeAudit({ category, actorUserId = null, targetUserId = null, success = 0, details = "" }) {
  try {
    await pool.query(
      `INSERT INTO audit_logs (category, actor_user_id, target_user_id, success, details)
       VALUES (?, ?, ?, ?, ?)`,
      [category, actorUserId, targetUserId, success ? 1 : 0, details]
    );
  } catch (_) { /* never crash the request over an audit failure */ }
}

/**
 * POST /api/profile/change-username
 * Body: { newUsername: string }
 */
router.post("/change-username", async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ ok: false, message: "Unauthorized" });

    const newUsername = String(req.body?.newUsername || "").trim();
    if (!newUsername || newUsername.length < 3) {
      return res.status(400).json({ ok: false, message: "Username must be at least 3 characters" });
    }

    // Check for duplicates
    const [existing] = await pool.query(
      "SELECT id FROM users WHERE username = ? AND id != ? LIMIT 1",
      [newUsername, userId]
    );
    if (existing.length) {
      return res.status(409).json({ ok: false, message: "Username already taken" });
    }

    await pool.query(
      "UPDATE users SET username = ? WHERE id = ? LIMIT 1",
      [newUsername, userId]
    );

    return res.json({ ok: true, message: "Username updated successfully" });
  } catch (err) {
    console.error("change-username error:", err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

/**
 * POST /api/profile/change-password
 * Body: { currentPassword: string, newPassword: string }
 */
router.post("/change-password", async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ ok: false, message: "Unauthorized" });

    const currentPassword = String(req.body?.currentPassword || "");
    const newPassword = String(req.body?.newPassword || "");

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ ok: false, message: "Both current and new password are required" });
    }

    // Full complexity enforcement (not just length)
    const complexityError = validatePasswordComplexity(newPassword);
    if (complexityError) {
      return res.status(400).json({ ok: false, message: complexityError });
    }

    const [rows] = await pool.query(
      "SELECT password_hash FROM users WHERE id = ? LIMIT 1",
      [userId]
    );
    if (!rows.length) return res.status(404).json({ ok: false, message: "User not found" });

    const valid = await bcrypt.compare(currentPassword, rows[0].password_hash);
    if (!valid) {
      await writeAudit({ category: "PASSWORD_CHANGE_FAIL", actorUserId: userId, targetUserId: userId, success: 0, details: "incorrect current password" });
      return res.status(401).json({ ok: false, message: "Current password is incorrect" });
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    await pool.query(
      "UPDATE users SET password_hash = ? WHERE id = ? LIMIT 1",
      [newHash, userId]
    );

    await writeAudit({ category: "PASSWORD_CHANGE", actorUserId: userId, targetUserId: userId, success: 1, details: `password changed by userId=${userId}` });

    const notification = {
      type: "success",
      message: "Notification sent: your password change was successful.",
    };

    return res.json({
      ok: true,
      message: "Password updated successfully.",
      notification,
    });
  } catch (err) {
    console.error("change-password error:", err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

module.exports = router;
