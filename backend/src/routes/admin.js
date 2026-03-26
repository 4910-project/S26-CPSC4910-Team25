const express = require("express");
const bcrypt = require("bcryptjs");
const pool = require("../db");

const requireActiveSession = require("../middleware/requireActiveSession");


const router = express.Router();
router.use(requireActiveSession);
router.use((req, res, next) => {
  if (req.user?.role !== "ADMIN") {
    return res.status(403).json({ ok: false, error: "admin only" });
  }
  return next();
});

/**
 * If your DB uses different enum strings, change these constants ONLY.
 * (These match what you previously used in your code.)
 */
const SPONSOR_DISABLED_STATUS = "DEACTIVATED";
const USER_DISABLED_STATUS = "DISABLED";
const DRIVER_DROPPED_STATUS = "DROPPED";

function parsePositiveInt(value) {
  const n = Number.parseInt(String(value), 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function parseLimit(value, fallback, max = 500) {
  const parsed = parsePositiveInt(value);
  if (!parsed) return fallback;
  return Math.min(parsed, max);
}

function parseRequiredReason(value) {
  const reason = String(value ?? "").trim();
  if (!reason) return null;
  return reason.slice(0, 500);
}

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
  const lim = parseLimit(limit, 100);

  let where = "WHERE u.role = 'DRIVER'";
  const params = [];

  if (sponsorId) {
    const sponsorIdInt = parsePositiveInt(sponsorId);
    if (!sponsorIdInt) {
      return res.status(400).json({ ok: false, error: "invalid sponsorId" });
    }
    where += " AND d.sponsor_id = ?";
    params.push(sponsorIdInt);
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
        u.id AS user_id,
        u.email,
        u.status AS user_status,
        d.status AS driver_status,
        d.sponsor_id,
        s.name AS sponsor_name,
        d.dropped_reason,
        d.dropped_at,
        d.flagged
      FROM users u
      LEFT JOIN drivers d ON d.user_id = u.id
      LEFT JOIN sponsors s ON s.id = d.sponsor_id
      WHERE u.role = 'DRIVER'
      ORDER BY u.id DESC
      LIMIT ${lim}
      `,
      params
    );

    return res.json({ ok: true, drivers: rows });
  } catch (err) {
    console.error("GET /admin/drivers error:", err); // for debugging
    return res.status(500).json({ ok: false, error: "failed to fetch drivers" });
  }
});

/**
 * NEW STORY 10889 — Admin can access driver accounts (single)
 * GET /admin/drivers/:driverId
 */
router.get("/drivers/:driverId", async (req, res) => {
  const driverId = parsePositiveInt(req.params.driverId);
  if (!driverId) {
    return res.status(400).json({ ok: false, error: "invalid driverId" });
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
        d.dropped_at,
        d.flagged
      FROM users u
      JOIN users u ON u.id = d.user_id
      LEFT JOIN sponsors s ON s.id = d.sponsor_id
      WHERE d.id = ?
      LIMIT 1
      `,
      [driverId]
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
 *  - sponsors.status -> DEACTIVATED
 *  - users.status (where sponsor_id=...) -> DISABLED
 *  - drivers.status (where sponsor_id=...) -> DROPPED + reason + dropped_at
 *  - audit_logs category DELETE_SPONSOR
 */
router.delete("/sponsors/:sponsorId", async (req, res) => {
  const sponsorId = parsePositiveInt(req.params.sponsorId);
  if (!sponsorId) {
    return res.status(400).json({ ok: false, error: "invalid sponsorId" });
  }

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
      actorUserId: req.user.id,
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
      actorUserId: req.user.id,
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
  const lim = parseLimit(limit, 200);

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
      actorUserId: req.user.id,
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
      actorUserId: req.user.id,
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
      actorUserId: req.user.id,
      success: 0,
      details: `failed: ${err.message}`,
    });

    return res.status(500).json({ ok: false, error: "failed to create sandbox" });
  } finally {
    conn.release();
  }
});

/**
 * GET /admin/feedback
 * List all feedback submissions with submitter info.
 * Query params: ?status=open|reviewed|resolved&category=...&page=1&limit=20
 */
router.get("/feedback", async (req, res) => {
  try {
    const status   = req.query.status   ? String(req.query.status).trim()   : null;
    const category = req.query.category ? String(req.query.category).trim() : null;
    const page     = Math.max(1, parseInt(req.query.page  || "1", 10));
    const limit    = Math.min(50, Math.max(1, parseInt(req.query.limit || "20", 10)));
    const offset   = (page - 1) * limit;

    const conditions = [];
    const params     = [];

    if (status)   { conditions.push("f.status = ?");   params.push(status);   }
    if (category) { conditions.push("f.category = ?"); params.push(category); }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const [rows] = await pool.query(
      `SELECT
         f.id, f.category, f.message, f.status, f.admin_note,
         f.created_at, f.updated_at,
         u.email AS submitter_email,
         u.role  AS submitter_role
       FROM feedback f
       JOIN users u ON u.id = f.user_id
       ${where}
       ORDER BY f.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM feedback f ${where}`,
      params
    );

    return res.json({ ok: true, feedback: rows, total, page, limit });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "failed to fetch feedback" });
  }
});

/**
 * PATCH /admin/feedback/:id
 * Update status or add admin note.
 * Body: { status?: string, adminNote?: string }
 */
router.patch("/feedback/:id", async (req, res) => {
  const feedbackId = parseInt(req.params.id, 10);
  if (!feedbackId) return res.status(400).json({ ok: false, error: "invalid id" });

  const VALID_STATUSES = ["open", "reviewed", "resolved"];
  const status    = req.body?.status    ? String(req.body.status).trim()    : null;
  const adminNote = req.body?.adminNote ? String(req.body.adminNote).trim() : null;

  if (status && !VALID_STATUSES.includes(status)) {
    return res.status(400).json({ ok: false, error: "invalid status" });
  }

  try {
    const updates = [];
    const params  = [];
    if (status)    { updates.push("status = ?");     params.push(status);    }
    if (adminNote !== null) { updates.push("admin_note = ?"); params.push(adminNote); }

    if (!updates.length) {
      return res.status(400).json({ ok: false, error: "nothing to update" });
    }

    params.push(feedbackId);
    await pool.query(
      `UPDATE feedback SET ${updates.join(", ")} WHERE id = ? LIMIT 1`,
      params
    );

    return res.json({ ok: true, message: "Feedback updated" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "failed to update feedback" });
  }
});

/**
 * NEW STORY 10917 — Admin can lock sponsors from acceptng new drivers
 * PATCH /admin/sponsors/:sponsorId/lock
 */
 router.patch("/sponsors/:sponsorId/lock", async (req, res) => {
  const sponsorId = parsePositiveInt(req.params.sponsorId);
  if (!sponsorId) {
    return res.status(400).json({ ok: false, error: "invalid sponsorId"});
  }

  const accepting = req.body?.accepting_drivers;
  if (typeof accepting !== "boolean") {
    return res.status(400).json({ ok: false, error: "accepting_drivers must be true or false"});
  }

  try {
    const [result] = await pool.query(
      "UPDATE sponsors SET accepting_drivers =? WHERE id = ? LIMIT 1",
      [accepting, sponsorId]
    );

    if (!result.affectedRows) {
      return res.status(404).json({ ok: false, error: "sponsor not found"});
    }

    await writeAudit({
      category: "SPONSOR_LOCK_TOGGLE",
      actorUserId: req.user.id,
      sponsorId,
      success: 1,
      details: `admin set accepting_drivers=${accepting} for sposnorId=${sponsorId}`
    });

    return res.json({ ok: true, accepting_drivers: accepting});
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "failed to update sponsor"});
  }
 });

 router.get("/sponsors", async (req, res) => {
  try {
    const [rows] = await pool.query(
      `
      SELECT
        id, 
        name, 
        status, 
        accepting_drivers,
        flagged
      FROM sponsors
      ORDER BY name ASC
      `
    );
    return res.json({ ok: true, sponsors: rows});
  } catch(err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "failed to fetch sponsors"});
  }
 });

 /**
 * NEW STORY 10907 — Admin can flag a sponsor
 * PATCH /admin/sponsors/:sponsorId/flag
 */
router.patch("/sponsors/:sponsorId/flag", async (req, res) => {
  const sponsorId = parsePositiveInt(req.params.sponsorId);
  if (!sponsorId) {
    return res.status(400).json({ ok: false, error: "invalid sponsorId "});
  }

  const { flagged } = req.body;
  if (typeof flagged !== "boolean") {
    return res.status(400).json({ ok: false, error: "flagged must be true or false"});
  }

  try {
    const [result] = await pool.query(
      "UPDATE sponsors SET flagged = ? WHERE id = ? LIMIT 1",
      [flagged, sponsorId]
    );

    if (!result.affectedRows) {
      return res.status(404).json({ ok: false, error: "sponsor not found"});
    }

    await writeAudit({
      category: "SPONSOR_FLAG_TOGGLE",
      actorUserId: req.user.id,
      sponsorId,
      success: 1,
      details: `admin set flagged=${flagged} for sponsorId=${sponsorId}`,
    });

    return res.json({ ok: true, flagged});
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "failed to update sponsor"});
  }
});

/**
 * NEW STORY 10910 — Admin can flag a driver
 * PATCH /admin/drivers/:driverId/flag
 */
router.patch("/drivers/:driverId/flag", async (req, res) => {
  const driverId = parsePositiveInt(req.params.driverId);
  if (!driverId) {
    return res.status(400).json({ ok: false, error: "invalid driverId "});
  }

  const { flagged } = req.body;
  if (typeof flagged !== "boolean") {
    return res.status(400).json({ ok: false, error: "flagged must be true or false"});
  }

  try {
    const [result] = await pool.query(
      "UPDATE drivers SET flagged = ? WHERE id = ? LIMIT 1",
      [flagged, driverId]
    );

    if (!result.affectedRows) {
      return res.status(404).json({ ok: false, error: "driver not found"});
    }

    await writeAudit({
      category: "DRIVER_FLAG_TOGGLE",
      actorUserId: req.user.id,
      targetUserId:driverId,
      success: 1,
      details: `admin set flagged=${flagged} for driverId=${driverId}`,
    });

    return res.json({ ok: true, flagged});
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "failed to update driver"});
  }
});

/**
 * NEW STORY 10908 — Admin can issue formal warnings to sponsors
 * POST /admin/sponsors/:sponsorId/warn
 * Body: { reason: string }
 */
router.post("/sponsors/:sponsorId/warn", async (req, res) => {
  const sponsorId = parsePositiveInt(req.params.sponsorId);
  if (!sponsorId) {
    return res.status(400).json({ ok: false, error: "invalid sponsorId " });
  }

  const reason = parseRequiredReason(req.body?.reason);
  if (!reason) {
    return res.status(400).json({ ok: false, error: "warning reason is required" });
  }

  try {
    const [result] = await pool.query(
      "UPDATE sponsors SET flagged = 1 WHERE id = ? LIMIT 1",
      [sponsorId]
    );

    if (!result.affectedRows) {
      return res.status(404).json({ ok: false, error: "sponsor not found" });
    }

    await writeAudit({
      category: "SPONSOR_WARNING",
      actorUserId: req.user.id,
      sponsorId,
      success: 1,
      details: `formal warning issued to sponsorId=${sponsorId}; reason=${reason}`,
    });

    return res.json({ ok: true, sponsorId, flagged: true, reason });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "failed to issue sponsor warning" });
  }
});

/**
 * NEW STORY 10909 — Admin can issue formal warnings to drivers
 * POST /admin/drivers/:driverId/warn
 * Body: { reason: string }
 */
router.post("/drivers/:driverId/warn", async (req, res) => {
  const driverId = parsePositiveInt(req.params.driverId);
  if (!driverId) {
    return res.status(400).json({ ok: false, error: "invalid driverId " });
  }

  const reason = parseRequiredReason(req.body?.reason);
  if (!reason) {
    return res.status(400).json({ ok: false, error: "warning reason is required" });
  }

  try {
    const [driverRows] = await pool.query(
      "SELECT id, user_id FROM drivers WHERE id = ? LIMIT 1",
      [driverId]
    );
    const driver = driverRows[0];
    if (!driver) {
      return res.status(404).json({ ok: false, error: "driver not found" });
    }

    await pool.query("UPDATE drivers SET flagged = 1 WHERE id = ? LIMIT 1", [driverId]);

    await writeAudit({
      category: "DRIVER_WARNING",
      actorUserId: req.user.id,
      targetUserId: driver.user_id,
      success: 1,
      details: `formal warning issued to driverId=${driverId}; reason=${reason}`,
    });

    return res.json({ ok: true, driverId, flagged: true, reason });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "failed to issue driver warning" });
  }
});

/**
 * NEW STORY 10955 — Admin can disable notifications system-wide
 * GET /admin/settings/notifications
 * PATCH /admin/settings/notifications
 */
router.get("/settings/notifications", async (req, res) => {
  const [rows] = await pool.query(
    `
    SELECT setting_value 
    FROM system_settings 
    WHERE setting_key = 'notifications_enabled'
    LIMIT 1
    `
  );
  return res.json({ok: true, notifications_enabled: rows[0]?.setting_value === "true"});
});

router.patch("/settings/notifications", async (req, res) => {
  const { notifications_enabled } = req.body;
  if (typeof notifications_enabled !== "boolean")
    return res.status(400).json({ ok: false, error: "notifications_enabled must be true or false" });
  
  await pool.query(
    `
    UPDATE system_settings
    SET setting_value = ?
    WHERE setting_key = 'notifications_enabled'
    `,
    [notifications_enabled ? "true" : "false"]
  );
  await writeAudit({
    category: "NOTIFICATIONS_TOGGLE",
    actorUserId: req.user.id,
    success: 1,
    details: `admin set notifications_enabled=${notifications_enabled}`,
  });
  return res.json({ok: true, notifications_enabled});
})

/**
* NEW STORY 10899 — Admin can add notes to sponsor accounts
* PATCH /admin/sponsors/:sponsorId/note
*/
router.patch("/sponsors/:sponsorId/note", async (req, res) => {
 const sponsorId = parsePositiveInt(req.params.sponsorId);
 if(!sponsorId) return res.status(400).json({ok: false, error: "invalid sponsorId"});
 const adminNote = req.body?.adminNote !== undefined ? String(req.body.adminNote).trim() : null;


 try {
   await pool.query(
     `UPDATE sponsors
     SET admin_note = ?
     WHERE id = ?
     LIMIT 1`,
     [adminNote, sponsorId]
   );
   await writeAudit({
     category: "SPONSOR_NOTE_UPDATE",
     actorUserId: req.user.id,
     sponsorId,
     success: 1,
     details: `admin updated note for sponsorId=${sponsorId}`,
   });
   return res.json({ ok: true});
 } catch (err) {
   console.error(err);
   return res.status(500).json({ ok: false, error: "failed to save note"});
 }
});

/**
* NEW STORY 10900 — Admin can add notes to driver accounts
* PATCH /admin/drivers/:driverId/note
*/
router.patch("/drivers/:driverId/note", async (req, res) => {
 const driverId = parsePositiveInt(req.params.driverId);
 if(!driverId) return res.status(400).json({ok: false, error: "invalid driverId"});
 const adminNote = req.body?.adminNote !== undefined ? String(req.body.adminNote).trim() : null;


 try {
   await pool.query(
     `UPDATE drivers
     SET admin_note = ?
     WHERE id = ?
     LIMIT 1`,
     [adminNote, driverId]
   );
   await writeAudit({
     category: "DRIVER_NOTE_UPDATE",
     actorUserId: req.user.id,
     driverId,
     success: 1,
     details: `admin updated note for driverId=${driverId}`,
   });
   return res.json({ ok: true});
 } catch (err) {
   console.error(err);
   return res.status(500).json({ ok: false, error: "failed to save note"});
 }
});

module.exports = router;
