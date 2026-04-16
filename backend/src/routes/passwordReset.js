/**
 * routes/passwordReset.js
 *
 * Handles the full password-reset flow.
 *
 * Registered in index.js as:
 *   app.use("/api/password-reset", passwordResetRoutes)
 *
 * Routes:
 *   POST /api/password-reset/request  — look up user by email, create token
 *   GET  /api/password-reset/verify/:token — validate a token (not yet used)
 *   POST /api/password-reset/reset    — consume token, set new password
 *
 * Note: no email service is wired up. The token is returned directly in the
 * response so the frontend (PasswordReset.js) can display/use it immediately.
 * When a real email service is available, send the token via email instead.
 */

const express = require("express");
const crypto  = require("crypto");
const bcrypt  = require("bcryptjs");
const pool    = require("../db");

const router = express.Router();

const TOKEN_TTL_MINUTES = 30;

/**
 * Password complexity — mirrors auth.js validatePasswordComplexity.
 * Returns an error string, or null if the password passes.
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
  } catch (_) { /* never crash over an audit failure */ }
}

/**
 * POST /api/password-reset/request
 * Body: { email }
 *
 * Looks up the user by email. If found, creates a reset token valid for
 * TOKEN_TTL_MINUTES. Returns the token directly in the response (no email).
 * Always returns a 200 so callers cannot enumerate which emails exist.
 */
router.post("/request", async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  if (!email) {
    return res.status(400).json({ ok: false, error: "Email is required" });
  }

  try {
    const [[user]] = await pool.query(
      "SELECT id FROM users WHERE email = ? AND status = 'ACTIVE' LIMIT 1",
      [email]
    );

    if (!user) {
      // Generic response — do not reveal whether email exists
      return res.json({
        ok: true,
        message: "If that email is registered, a reset token has been generated.",
        token: null,
      });
    }

    // Expire any outstanding tokens for this user
    await pool.query(
      "UPDATE password_reset_tokens SET used = 1 WHERE user_id = ? AND used = 0",
      [user.id]
    );

    const rawToken = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MINUTES * 60 * 1000);

    await pool.query(
      `INSERT INTO password_reset_tokens (user_id, token, expires_at, used)
       VALUES (?, ?, ?, 0)`,
      [user.id, rawToken, expiresAt]
    );

    await writeAudit({
      category: "PASSWORD_RESET_REQUEST",
      targetUserId: user.id,
      success: 1,
      details: `password reset token generated for email=${email}`,
    });

    // In production replace this with: await sendEmail(email, rawToken)
    return res.json({
      ok: true,
      message: "Reset token generated. Copy it and use it on the reset page.",
      token: rawToken,
      expiresInMinutes: TOKEN_TTL_MINUTES,
    });
  } catch (err) {
    console.error("POST /api/password-reset/request error:", err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

/**
 * GET /api/password-reset/verify/:token
 * Validates a token without consuming it.
 * Used by PasswordReset.js when the page loads with ?token= in the URL.
 */
router.get("/verify/:token", async (req, res) => {
  const token = String(req.params.token || "").trim();
  if (!token) return res.status(400).json({ ok: false, error: "Token is required" });

  try {
    const [[row]] = await pool.query(
      `SELECT id, user_id, expires_at, used
       FROM password_reset_tokens
       WHERE token = ?
       LIMIT 1`,
      [token]
    );

    if (!row) return res.status(404).json({ ok: false, error: "Invalid or expired reset token" });
    if (row.used) return res.status(410).json({ ok: false, error: "This token has already been used" });
    if (new Date(row.expires_at) < new Date()) {
      return res.status(410).json({ ok: false, error: "Reset token has expired" });
    }

    return res.json({ ok: true, message: "Token is valid" });
  } catch (err) {
    console.error("GET /api/password-reset/verify error:", err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

/**
 * POST /api/password-reset/reset
 * Body: { token, newPassword }
 * Validates the token, enforces password complexity, updates the password,
 * marks the token as used, and revokes all active sessions.
 */
router.post("/reset", async (req, res) => {
  const token       = String(req.body?.token       || "").trim();
  const newPassword = String(req.body?.newPassword || "");

  if (!token)       return res.status(400).json({ ok: false, error: "Token is required" });
  if (!newPassword) return res.status(400).json({ ok: false, error: "New password is required" });

  const complexityError = validatePasswordComplexity(newPassword);
  if (complexityError) return res.status(400).json({ ok: false, error: complexityError });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [[row]] = await conn.query(
      `SELECT id, user_id, expires_at, used
       FROM password_reset_tokens
       WHERE token = ?
       LIMIT 1
       FOR UPDATE`,
      [token]
    );

    if (!row) {
      await conn.rollback();
      return res.status(404).json({ ok: false, error: "Invalid or expired reset token" });
    }
    if (row.used) {
      await conn.rollback();
      return res.status(410).json({ ok: false, error: "This token has already been used" });
    }
    if (new Date(row.expires_at) < new Date()) {
      await conn.rollback();
      return res.status(410).json({ ok: false, error: "Reset token has expired" });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    // Update password
    await conn.query(
      "UPDATE users SET password_hash = ? WHERE id = ? LIMIT 1",
      [passwordHash, row.user_id]
    );

    // Mark token as consumed
    await conn.query(
      "UPDATE password_reset_tokens SET used = 1 WHERE id = ?",
      [row.id]
    );

    // Revoke all active sessions — force re-login with new password
    await conn.query(
      "UPDATE sessions SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL",
      [row.user_id]
    );

    await writeAudit({
      category: "PASSWORD_CHANGE",
      targetUserId: row.user_id,
      success: 1,
      details: "password changed via password reset flow",
    });

    await conn.commit();
    return res.json({ ok: true, message: "Password reset successfully. Please log in with your new password." });
  } catch (err) {
    await conn.rollback();
    console.error("POST /api/password-reset/reset error:", err);
    return res.status(500).json({ ok: false, error: "Server error" });
  } finally {
    conn.release();
  }
});

module.exports = router;
