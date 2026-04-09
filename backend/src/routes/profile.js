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
    if (newPassword.length < 8) {
      return res.status(400).json({ ok: false, message: "New password must be at least 8 characters" });
    }

    const [rows] = await pool.query(
      "SELECT password_hash FROM users WHERE id = ? LIMIT 1",
      [userId]
    );
    if (!rows.length) return res.status(404).json({ ok: false, message: "User not found" });

    const valid = await bcrypt.compare(currentPassword, rows[0].password_hash);
    if (!valid) {
      return res.status(401).json({ ok: false, message: "Current password is incorrect" });
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    await pool.query(
      "UPDATE users SET password_hash = ? WHERE id = ? LIMIT 1",
      [newHash, userId]
    );

    const notification = {
      type: "success",
      message:
        req.user?.role === "DRIVER"
          ? "Notification sent: your password change was successful."
          : "Notification sent: your password change was successful.",
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
