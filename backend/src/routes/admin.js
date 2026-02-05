const express = require("express");
const bcrypt = require("bcryptjs");
const pool = require("../db");

const router = express.Router();

/**
 * Small helper to write audit logs safely.
 * Table: audit_logs(id, created_at, category, actor_user_id, target_user_id, sponsor_id, success, details)
 */
async function writeAudit({
  category,
  actorUserId = null,
  targetUserId = null,
  sponsorId = null,
  success = 0,
  details = "",
  conn = null, // optional transaction connection
}) {
  const q = `INSERT INTO audit_logs
    (category, actor_user_id, target_user_id, sponsor_id, success, details)
    VALUES (?, ?, ?, ?, ?, ?)`;

  const params = [category, actorUserId, targetUserId, sponsorId, success ? 1 : 0, details];

  if (conn) return conn.query(q, params);
  return pool.query(q, params);
}

/**
 * Sanity check endpoint (keeps your earlier ping)
 * GET /admin/ping
 */
router.get("/ping", (req, res) => {
  res.json({ ok: true, route: "admin" });
});

/**
 * TASK 4 — Admin can test user login credentials (no password reveal)
 * POST /admin/test-login
 * Body: { "email": "...", "password": "..." }
 * Returns: { ok: true/false }
 */
router.post("/test-login", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ ok: false, reason: "email and password required" });
  }

  try {
    const [rows] = await pool.query(
      "SELECT id, password_hash, status FROM users WHERE email = ? LIMIT 1",
      [email]
    );
    const user = rows[0];

    let ok = false;

    if (user && user.status === "ACTIVE") {
      ok = await bcrypt.compare(password, user.password_hash);
    } else {
      ok = false; // user missing or not ACTIVE
    }

    await writeAudit({
      category: "ADMIN_TEST_LOGIN",
      targetUserId: user ? user.id : null,
      success: ok,
      details: user
        ? user.status !== "ACTIVE"
          ? `user not active (status=${user.status})`
          : ok
          ? "credentials valid"
          : "invalid credentials"
        : "user not found",
    });

    return res.json({ ok });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, reason: "server error" });
  }
});

/**
 * TASK 1 — Admin creates driver accounts
 * POST /admin/drivers
 * Body: { email, password, sponsorId }
 *
 * DB actions:
 *  - insert into users (role='DRIVER', sponsor_id=..., status='ACTIVE', password_hash=hashed)
 *  - insert into drivers (user_id, sponsor_id, status='ACTIVE')
 *  - insert audit log (CREATE_DRIVER)
 */
router.post("/drivers", async (req, res) => {
  const { email, password, sponsorId } = req.body || {};

  if (!email || !password || !sponsorId) {
    return res.status(400).json({ ok: false, error: "email, password, sponsorId required" });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Validate sponsor exists and is ACTIVE
    const [sRows] = await conn.query(
      "SELECT id, status FROM sponsors WHERE id = ? LIMIT 1",
      [sponsorId]
    );
    if (!sRows[0]) {
      await writeAudit({
        category: "CREATE_DRIVER",
        sponsorId,
        success: 0,
        details: `failed: sponsorId ${sponsorId} not found`,
        conn,
      });
      await conn.rollback();
      return res.status(400).json({ ok: false, error: "invalid sponsorId" });
    }
    if (sRows[0].status !== "ACTIVE") {
      await writeAudit({
        category: "CREATE_DRIVER",
        sponsorId,
        success: 0,
        details: `failed: sponsorId ${sponsorId} not ACTIVE (status=${sRows[0].status})`,
        conn,
      });
      await conn.rollback();
      return res.status(400).json({ ok: false, error: "sponsorId is not ACTIVE" });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    // Insert user
    const [uRes] = await conn.query(
      `INSERT INTO users (email, password_hash, role, sponsor_id, status)
       VALUES (?, ?, 'DRIVER', ?, 'ACTIVE')`,
      [email, passwordHash, sponsorId]
    );
    const userId = uRes.insertId;

    // Insert driver profile
    await conn.query(
      `INSERT INTO drivers (user_id, sponsor_id, status)
       VALUES (?, ?, 'ACTIVE')`,
      [userId, sponsorId]
    );

    // Audit
    await writeAudit({
      category: "CREATE_DRIVER",
      targetUserId: userId,
      sponsorId,
      success: 1,
      details: `created driver user for ${email}`,
      conn,
    });

    await conn.commit();
    return res.status(201).json({ ok: true, userId });
  } catch (err) {
    await conn.rollback();

    // Duplicate email
    if (err && err.code === "ER_DUP_ENTRY") {
      await writeAudit({
        category: "CREATE_DRIVER",
        sponsorId: sponsorId || null,
        success: 0,
        details: `failed: duplicate email ${email}`,
      });
      return res.status(409).json({ ok: false, error: "email already exists" });
    }

    console.error(err);
    await writeAudit({
      category: "CREATE_DRIVER",
      sponsorId: sponsorId || null,
      success: 0,
      details: `failed: ${err.message}`,
    });

    return res.status(500).json({ ok: false, error: "failed to create driver" });
  } finally {
    conn.release();
  }
});

/**
 * TASK 2 — Admin can validate/test API keys
 * POST /admin/api-keys/test
 * Body: { provider, apiKey }
 *
 * Sprint-friendly implementation:
 *  - simple validity check (length > 10)
 *  - log failures/success to audit_logs as API_KEY_TEST
 */
router.post("/api-keys/test", async (req, res) => {
  const { provider, apiKey } = req.body || {};
  if (!provider || !apiKey) {
    return res.status(400).json({ ok: false, error: "provider and apiKey required" });
  }

  // Simple “test” for sprint (replace with real API call later)
  const ok = String(apiKey).trim().length > 10;

  try {
    await writeAudit({
      category: "API_KEY_TEST",
      success: ok,
      details: ok ? `key valid for provider=${provider}` : `key invalid for provider=${provider}`,
    });

    return res.json({ ok });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "failed to log API key test" });
  }
});

/**
 * TASK 3 — Admin can view API error logs
 * GET /admin/api-error-logs
 * Optional filters:
 *  - ?from=YYYY-MM-DD
 *  - ?to=YYYY-MM-DD
 *
 * For now: reads failed API_KEY_TEST entries from audit_logs.
 */
router.get("/api-error-logs", async (req, res) => {
  const { from, to } = req.query || {};

  // Build WHERE with optional time filter
  let where = "WHERE category = 'API_KEY_TEST' AND success = 0";
  const params = [];

  if (from) {
    where += " AND created_at >= ?";
    params.push(`${from} 00:00:00`);
  }
  if (to) {
    where += " AND created_at <= ?";
    params.push(`${to} 23:59:59`);
  }

  try {
    const [rows] = await pool.query(
      `SELECT id, created_at, category, success, details
       FROM audit_logs
       ${where}
       ORDER BY created_at DESC
       LIMIT 200`,
      params
    );

    return res.json(rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "failed to fetch api error logs" });
  }
});

module.exports = router;
