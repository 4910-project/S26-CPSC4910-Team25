const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const pool = require("../db");

const router = express.Router();

/**
 * Helpers
 */
function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function requireEnv(name) {
  if (!process.env[name]) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return process.env[name];
}

/**
 * REGISTER
 * POST /auth/register
 */
router.post("/register", async (req, res) => {
  try {
    requireEnv("JWT_SECRET"); // fail fast if misconfigured

    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || "");
    const role = req.body?.role || "DRIVER";

    if (!email || !password) {
      return res.status(400).json({ ok: false, error: "Missing email or password" });
    }

    const [existing] = await pool.query("SELECT id FROM users WHERE email = ? LIMIT 1", [email]);
    if (existing.length) {
      return res.status(409).json({ ok: false, error: "Email already exists" });
    }

    const password_hash = await bcrypt.hash(password, 10);

    await pool.query(
      "INSERT INTO users (email, password_hash, role, status) VALUES (?, ?, ?, 'ACTIVE')",
      [email, password_hash, role]
    );

    return res.json({ ok: true, status: "ok" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

/**
 * LOGIN (WITH SESSION LIMIT + jti)
 * POST /auth/login
 *
 * Behavior:
 * - checks email/password
 * - counts active sessions
 * - if count >= SESSION_LIMIT, revokes oldest until there is room
 * - inserts new session
 * - returns JWT containing jti
 */
router.post("/login", async (req, res) => {
  try {
    const JWT_SECRET = requireEnv("JWT_SECRET");
    const SESSION_LIMIT = Number(process.env.SESSION_LIMIT || 2);
    const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "2h";

    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || "");

    if (!email || !password) {
      return res.status(400).json({ ok: false, error: "Missing email or password" });
    }

    const [rows] = await pool.query(
      "SELECT id, email, password_hash, role, sponsor_id, status FROM users WHERE email = ? LIMIT 1",
      [email]
    );

    if (!rows.length) {
      return res.status(401).json({ ok: false, error: "Invalid credentials" });
    }

    const user = rows[0];

    if (user.status !== "ACTIVE") {
      return res.status(403).json({ ok: false, error: `Account is ${user.status}` });
    }

    const okPw = await bcrypt.compare(password, user.password_hash);
    if (!okPw) {
      return res.status(401).json({ ok: false, error: "Invalid credentials" });
    }

    // ---- SESSION LIMIT ENFORCEMENT ----
    // Fetch active sessions oldest -> newest
    const [active] = await pool.query(
      `SELECT id, jti, created_at
       FROM sessions
       WHERE user_id = ? AND revoked_at IS NULL
       ORDER BY created_at ASC`,
      [user.id]
    );

    // Revoke oldest sessions until we are below limit
    // (so we can insert a fresh one)
    while (active.length >= SESSION_LIMIT) {
      const oldest = active.shift();
      await pool.query("UPDATE sessions SET revoked_at = NOW() WHERE id = ?", [oldest.id]);
    }

    // Create a new session
    const jti = crypto.randomBytes(16).toString("hex");

    // If your schema stores expires_at (recommended):
    // Set expires_at to match JWT expiration window.
    // (Using 2 hours by default)
    await pool.query(
      "INSERT INTO sessions (user_id, jti, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 2 HOUR))",
      [user.id, jti]
    );

    const token = jwt.sign(
      { id: user.id, role: user.role, sponsor_id: user.sponsor_id, jti },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    return res.json({
      ok: true,
      status: "ok",
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

/**
 * LOGOUT
 * POST /auth/logout
 *
 * Revokes the session represented by the JWT's jti.
 */
router.post("/logout", async (req, res) => {
  try {
    const JWT_SECRET = requireEnv("JWT_SECRET");

    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ ok: false, error: "missing token" });

    const payload = jwt.verify(token, JWT_SECRET);
    const { id, jti } = payload || {};

    if (!id || !jti) return res.status(400).json({ ok: false, error: "missing session id" });

    await pool.query(
      "UPDATE sessions SET revoked_at = NOW() WHERE user_id = ? AND jti = ? AND revoked_at IS NULL",
      [id, jti]
    );

    return res.json({ ok: true });
  } catch (err) {
    return res.status(401).json({ ok: false, error: "invalid token" });
  }
});

/**
 * FORGOT USERNAME
 * POST /auth/forgot-username
 *
 * Note: This endpoint does NOT actually email anything by itself.
 * It returns a generic message to avoid leaking whether an email exists.
 * If you have an email service, hook it up where indicated.
 */
router.post("/forgot-username", async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    if (!email) return res.status(400).json({ ok: false, error: "Invalid email" });

    // If you store username in DB, you can fetch it:
    const [rows] = await pool.query(
      "SELECT username FROM users WHERE email = ? LIMIT 1",
      [email]
    );

    // Don't reveal if account exists
    // If you have email service, send rows[0]?.username to email here.
    // e.g., if (rows.length) await sendEmail(email, ...)

    return res.json({ ok: true, message: "If that email exists, instructions have been sent." });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

/**
 * CHANGE USERNAME
 * PATCH /auth/users/:userId/username
 */
router.patch("/users/:userId/username", async (req, res) => {
  try {
    const userId = Number(req.params.userId);
    const newUsername = String(req.body?.username || "").trim();

    if (!userId) return res.status(400).json({ ok: false, error: "Invalid userId" });
    if (!newUsername) return res.status(400).json({ ok: false, error: "Missing username" });

    const [result] = await pool.query(
      "UPDATE users SET username = ? WHERE id = ? LIMIT 1",
      [newUsername, userId]
    );

    return res.json({ ok: true, message: "Username updated", affectedRows: result.affectedRows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

/**
 * CHANGE EMAIL
 * PATCH /auth/users/:userId/email
 */
router.patch("/users/:userId/email", async (req, res) => {
  try {
    const userId = Number(req.params.userId);
    const newEmail = normalizeEmail(req.body?.email);

    if (!userId) return res.status(400).json({ ok: false, error: "Invalid userId" });
    if (!newEmail) return res.status(400).json({ ok: false, error: "Missing email" });

    // Optional: prevent duplicates
    const [existing] = await pool.query("SELECT id FROM users WHERE email = ? LIMIT 1", [newEmail]);
    if (existing.length) return res.status(409).json({ ok: false, error: "Email already exists" });

    const [result] = await pool.query(
      "UPDATE users SET email = ? WHERE id = ? LIMIT 1",
      [newEmail, userId]
    );

    return res.json({ ok: true, message: "Email updated", affectedRows: result.affectedRows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

module.exports = router;
