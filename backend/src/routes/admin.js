const express = require("express");
const bcrypt = require("bcryptjs");
const pool = require("../db");

const router = express.Router();

/**
 * If your DB uses different enum strings, change these constants ONLY.
 * (These match what you previously used in your code.)
 */
const SPONSOR_DISABLED_STATUS = "DISABLED";
const USER_DISABLED_STATUS = "DISABLED";
const DRIVER_DROPPED_STATUS = "DROPPED";

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

  const params = [
    category,
    actorUserId,
    targetUserId,
    sponsorId,
    success ? 1 : 0,
    details,
  ];

  if (conn) return conn.query(q, params);
  return pool.query(q, params);
}

/**
 * Sanity check endpoint
 * GET /admin/ping
 */
router.get("/ping", (req, res) => {
  res.json({ ok: true, route: "admin" });
});

/**
 * NEW STORY 10889 — Admin can access driver accounts
 * GET /admin/drivers
 * Optional query params: sponsorId, status, email, limit
 */
router.get("/drivers", async (req, res) => {
  const { sponsorId, status, email, limit } = req.query || {};
  const lim = Math.min(parseInt(limit || "100", 10), 500);

  let where = "WHERE u.role = 'DRIVER'";
  const params = [];

  if (sponsorId) {
    where += " AND d.sponsor_id = ?";
    params.push(Number(sponsorId));
  }
  if (status) {
    where += " AND d.status = ?";
    params.push(String(status));
  }
  if (email) {
    where += " AND u.email LIKE ?";
    params.push(`%${String(email)}%`);
  }

  try {
    const [rows] = await pool.query(
      `
      SELECT
        d.id AS driver_id,
        d.user_id,
        u.email,
        u.status AS user_status,
        d.status AS driver_status,
        d.sponsor_id,
        s.name AS sponsor_name,
        d.dropped_reason,
        d.dropped_at
      FROM drivers d
      JOIN users u ON u.id = d.user_id
      LEFT JOIN sponsors s ON s.id = d.sponsor_id
      ${where}
      ORDER BY d.id DESC
      LIMIT ${lim}
      `,
      params
    );

    return res.json({ ok: true, drivers: rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "failed to fetch drivers" });
  }
});

/**
 * NEW STORY 10889 — Admin can access driver accounts (single)
 * GET /admin/drivers/:driverId
 */
router.get("/drivers/:driverId", async (req, res) => {
  const { driverId } = req.params;

  try {
    const [rows] = await pool.query(
      `
      SELECT
        d.id AS driver_id,
        d.user_id,
        u.email,
        u.status AS user_status,
        d.status AS driver_status,
        d.sponsor_id,
        s.name AS sponsor_name,
        d.dropped_reason,
        d.dropped_at
      FROM drivers d
      JOIN users u ON u.id = d.user_id
      LEFT JOIN sponsors s ON s.id = d.sponsor_id
      WHERE d.id = ?
      LIMIT 1
      `,
      [Number(driverId)]
    );

    if (!rows[0]) return res.status(404).json({ ok: false, error: "driver not found" });
    return res.json({ ok: true, driver: rows[0] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "failed to fetch driver" });
  }
});

/**
 * TASK 4 (old) — Admin can test user login credentials (no password reveal)
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
      ok = false;
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
 * TASK 1 (old) — Admin creates driver accounts
 * POST /admin/drivers
 * Body: { email, password, sponsorId }
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
      [Number(sponsorId)]
    );
    if (!sRows[0]) {
      await writeAudit({
        category: "CREATE_DRIVER",
        sponsorId: Number(sponsorId),
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
        sponsorId: Number(sponsorId),
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
      [email, passwordHash, Number(sponsorId)]
    );
    const userId = uRes.insertId;

    // Insert driver profile
    await conn.query(
      `INSERT INTO drivers (user_id, sponsor_id, status)
       VALUES (?, ?, 'ACTIVE')`,
      [userId, Number(sponsorId)]
    );

    // Audit
    await writeAudit({
      category: "CREATE_DRIVER",
      targetUserId: userId,
      sponsorId: Number(sponsorId),
      success: 1,
      details: `created driver user for ${email}`,
      conn,
    });

    await conn.commit();
    return res.status(201).json({ ok: true, userId });
  } catch (err) {
    await conn.rollback();

    if (err && err.code === "ER_DUP_ENTRY") {
      await writeAudit({
        category: "CREATE_DRIVER",
        sponsorId: sponsorId ? Number(sponsorId) : null,
        success: 0,
        details: `failed: duplicate email ${email}`,
      });
      return res.status(409).json({ ok: false, error: "email already exists" });
    }

    console.error(err);
    await writeAudit({
      category: "CREATE_DRIVER",
      sponsorId: sponsorId ? Number(sponsorId) : null,
      success: 0,
      details: `failed: ${err.message}`,
    });

    return res.status(500).json({ ok: false, error: "failed to create driver" });
  } finally {
    conn.release();
  }
});

/**
 * TASK 2 (old) — Admin can validate/test API keys
 * POST /admin/api-keys/test
 */
router.post("/api-keys/test", async (req, res) => {
  const { provider, apiKey } = req.body || {};
  if (!provider || !apiKey) {
    return res.status(400).json({ ok: false, error: "provider and apiKey required" });
  }

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
 * TASK 3 (old) — Admin can view API error logs
 * GET /admin/api-error-logs
 */
router.get("/api-error-logs", async (req, res) => {
  const { from, to } = req.query || {};

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

/**
 * NEW STORY 10864 — Admin can delete sponsor accounts
 * DELETE /admin/sponsors/:sponsorId
 *
 * Safe “soft delete”:
 *  - sponsors.status -> DISABLED
 *  - users.status (where sponsor_id=...) -> DISABLED
 *  - drivers.status (where sponsor_id=...) -> DROPPED + reason + dropped_at
 *  - audit_logs category DELETE_SPONSOR
 */
router.delete("/sponsors/:sponsorId", async (req, res) => {
  const sponsorId = Number(req.params.sponsorId);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [sRows] = await conn.query(
      "SELECT id, name, status FROM sponsors WHERE id = ? LIMIT 1",
      [sponsorId]
    );
    if (!sRows[0]) {
      await conn.rollback();
      return res.status(404).json({ ok: false, error: "sponsor not found" });
    }

    // Disable sponsor
    await conn.query("UPDATE sponsors SET status = ? WHERE id = ?", [
      SPONSOR_DISABLED_STATUS,
      sponsorId,
    ]);

    // Disable all users under sponsor
    const [uUp] = await conn.query("UPDATE users SET status = ? WHERE sponsor_id = ?", [
      USER_DISABLED_STATUS,
      sponsorId,
    ]);

    // Drop all drivers under sponsor
    const [dUp] = await conn.query(
      `
      UPDATE drivers
      SET status = ?,
          dropped_reason = 'Sponsor deleted by admin',
          dropped_at = NOW()
      WHERE sponsor_id = ? AND status <> ?
      `,
      [DRIVER_DROPPED_STATUS, sponsorId, DRIVER_DROPPED_STATUS]
    );

    await writeAudit({
      category: "DELETE_SPONSOR",
      sponsorId,
      success: 1,
      details: `soft-deleted sponsor=${sponsorId}; usersDisabled=${uUp.affectedRows}; driversDropped=${dUp.affectedRows}`,
      conn,
    });

    await conn.commit();
    return res.json({
      ok: true,
      sponsorId,
      usersDisabled: uUp.affectedRows,
      driversDropped: dUp.affectedRows,
    });
  } catch (err) {
    await conn.rollback();
    console.error(err);

    await writeAudit({
      category: "DELETE_SPONSOR",
      sponsorId,
      success: 0,
      details: `failed: ${err.message}`,
    });

    return res.status(500).json({ ok: false, error: "failed to delete sponsor" });
  } finally {
    conn.release();
  }
});

/**
 * NEW STORY 10954 — Admin can monitor failed background jobs
 * GET /admin/job-failures
 * Optional: ?from=YYYY-MM-DD&to=YYYY-MM-DD&limit=200
 *
 * Uses audit_logs:
 *  category = 'JOB_RUN'
 *  success  = 0
 */
router.get("/job-failures", async (req, res) => {
  const { from, to, limit } = req.query || {};
  const lim = Math.min(parseInt(limit || "200", 10), 500);

  let where = "WHERE category = 'JOB_RUN' AND success = 0";
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
      `
      SELECT id, created_at, category, success, details
      FROM audit_logs
      ${where}
      ORDER BY created_at DESC
      LIMIT ${lim}
      `,
      params
    );

    return res.json({ ok: true, failures: rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "failed to fetch job failures" });
  }
});

/**
 * DEV helper for 10954 (so you can demo it now):
 * POST /admin/jobs/simulate-failure
 * Body: { job: "name", message: "error text" }
 */
router.post("/jobs/simulate-failure", async (req, res) => {
  const { job, message } = req.body || {};
  if (!job || !message) {
    return res.status(400).json({ ok: false, error: "job and message required" });
  }

  try {
    await writeAudit({
      category: "JOB_RUN",
      success: 0,
      details: `job=${job}; error=${message}`,
    });
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "failed to log job failure" });
  }
});

/**
 * NEW STORY 10961 — Admin can generate sandbox environments
 * POST /admin/sandboxes
 * Body optional: { name: "SANDBOX_X" }
 *
 * Sprint-safe meaning: create a new Sponsor row that represents a sandbox “environment”.
 */
router.post("/sandboxes", async (req, res) => {
  const { name } = req.body || {};
  const sandboxName =
    name && String(name).trim().length > 0 ? String(name).trim() : `SANDBOX_${Date.now()}`;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [ins] = await conn.query("INSERT INTO sponsors (name, status) VALUES (?, 'ACTIVE')", [
      sandboxName,
    ]);
    const sponsorId = ins.insertId;

    await writeAudit({
      category: "CREATE_SANDBOX",
      sponsorId,
      success: 1,
      details: `created sandbox sponsor=${sandboxName} (id=${sponsorId})`,
      conn,
    });

    await conn.commit();
    return res.status(201).json({ ok: true, sandbox: { sponsorId, name: sandboxName } });
  } catch (err) {
    await conn.rollback();
    console.error(err);

    await writeAudit({
      category: "CREATE_SANDBOX",
      success: 0,
      details: `failed: ${err.message}`,
    });

    return res.status(500).json({ ok: false, error: "failed to create sandbox" });
  } finally {
    conn.release();
  }
});

module.exports = router;
