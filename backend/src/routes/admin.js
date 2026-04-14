const express = require("express");
const bcrypt = require("bcryptjs");
const PDFDocument = require("pdfkit");
const pool = require("../db");
const multer = require("multer")
const upload = multer({ storage: multer.memoryStorage() });
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

async function tableExists(tableName, conn = null) {
  const client = conn || pool;
  const [rows] = await client.query(
    `
    SELECT 1
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = ?
    LIMIT 1
    `,
    [tableName]
  );
  return !!rows[0];
}

function escapeCsvCell(value) {
  const raw = String(value ?? "");
  if (/[",\n]/.test(raw)) return `"${raw.replace(/"/g, '""')}"`;
  return raw;
}

async function loadSponsorAccountSnapshot(sponsorId) {
  const [sponsorRows] = await pool.query(
    `
    SELECT
      id,
      name,
      status,
      accepting_drivers AS acceptingDrivers,
      flagged,
      admin_note AS adminNote,
      contact_name AS contactName,
      contact_email AS contactEmail,
      contact_phone AS contactPhone,
      address,
      org_photo_url AS orgPhotoUrl
    FROM sponsors
    WHERE id = ?
    LIMIT 1
    `,
    [sponsorId]
  );
  const sponsor = sponsorRows[0];
  if (!sponsor) return null;

  const [drivers] = await pool.query(
    `
    SELECT
      d.id AS driverId,
      d.user_id AS userId,
      SUBSTRING_INDEX(u.email, '@', 1) AS name,
      u.email,
      LOWER(d.status) AS status,
      d.joined_on AS joinedOn,
      u.points AS currentPoints,
      d.flagged,
      d.admin_note AS adminNote
    FROM drivers d
    JOIN users u ON u.id = d.user_id
    WHERE d.sponsor_id = ?
    ORDER BY
      CASE d.status
        WHEN 'ACTIVE' THEN 0
        WHEN 'PROBATION' THEN 1
        WHEN 'DROPPED' THEN 2
        ELSE 3
      END,
      u.email ASC
    `,
    [sponsorId]
  );

  const [applications] = await pool.query(
    `
    SELECT
      da.id AS applicationId,
      da.driver_user_id AS driverUserId,
      d.id AS driverId,
      SUBSTRING_INDEX(u.email, '@', 1) AS name,
      u.email,
      da.status,
      da.decision_message AS decisionMessage,
      da.applied_at AS appliedAt,
      da.decided_at AS decidedAt,
      d.starting_points AS startingPoints
    FROM driver_applications da
    JOIN users u ON u.id = da.driver_user_id
    LEFT JOIN drivers d ON d.user_id = da.driver_user_id AND d.sponsor_id = da.sponsor_id
    WHERE da.sponsor_id = ?
    ORDER BY da.applied_at DESC
    LIMIT 15
    `,
    [sponsorId]
  );

  const counts = {
    totalDrivers: drivers.length,
    activeDrivers: drivers.filter((driver) => driver.status === "active").length,
    probationDrivers: drivers.filter((driver) => driver.status === "probation").length,
    droppedDrivers: drivers.filter((driver) => driver.status === "dropped").length,
    pendingApplications: applications.filter((application) => String(application.status).toUpperCase() === "PENDING").length,
  };

  return { sponsor, drivers, applications, counts };
}

async function loadAdminSponsorPointsReportData(sponsorId, driverId = null) {
  const [sponsorRows] = await pool.query(
    "SELECT id, name FROM sponsors WHERE id = ? LIMIT 1",
    [sponsorId]
  );
  const sponsor = sponsorRows[0];
  if (!sponsor) return { sponsor: null };

  let filter = { driverId: null, driverEmail: null, label: "All drivers" };
  let driverClause = "";
  const driverParams = [sponsorId];
  const parsedDriverId = driverId == null || driverId === "" ? null : parsePositiveInt(driverId);

  if (driverId != null && driverId !== "" && !parsedDriverId) {
    return { sponsor, invalidDriverFilter: true };
  }

  if (parsedDriverId) {
    const [driverFilterRows] = await pool.query(
      `
      SELECT d.id AS driverId, u.email
      FROM drivers d
      JOIN users u ON u.id = d.user_id
      WHERE d.id = ? AND d.sponsor_id = ?
      LIMIT 1
      `,
      [parsedDriverId, sponsorId]
    );

    const selectedDriver = driverFilterRows[0];
    if (!selectedDriver) {
      return { sponsor, driverNotFound: true };
    }

    filter = {
      driverId: selectedDriver.driverId,
      driverEmail: selectedDriver.email,
      label: selectedDriver.email,
    };
    driverClause = " AND d.id = ?";
    driverParams.push(parsedDriverId);
  }

  const hasHistory = await tableExists("driver_points_history");
  const [driverRows] = hasHistory
    ? await pool.query(
        `
        SELECT
          d.id AS driverId,
          u.email,
          LOWER(d.status) AS driverStatus,
          u.points AS currentPoints,
          COALESCE(SUM(CASE WHEN h.points_change > 0 THEN h.points_change ELSE 0 END), 0) AS totalAwarded,
          COALESCE(SUM(CASE WHEN h.points_change < 0 THEN ABS(h.points_change) ELSE 0 END), 0) AS totalReversed,
          COALESCE(SUM(h.points_change), 0) AS netChange
        FROM drivers d
        JOIN users u ON u.id = d.user_id
        LEFT JOIN driver_points_history h ON h.driver_user_id = d.user_id
        WHERE d.sponsor_id = ?
        ${driverClause}
        GROUP BY d.id, u.email, d.status, u.points
        ORDER BY u.email ASC
        `,
        driverParams
      )
    : await pool.query(
        `
        SELECT
          d.id AS driverId,
          u.email,
          LOWER(d.status) AS driverStatus,
          u.points AS currentPoints,
          0 AS totalAwarded,
          0 AS totalReversed,
          0 AS netChange
        FROM drivers d
        JOIN users u ON u.id = d.user_id
        WHERE d.sponsor_id = ?
        ${driverClause}
        ORDER BY u.email ASC
        `,
        driverParams
      );

  const [historyRows] = hasHistory
    ? await pool.query(
        `
        SELECT
          h.created_at AS occurredAt,
          u.email,
          h.points_change AS pointsChange,
          h.reason
        FROM driver_points_history h
        JOIN users u ON u.id = h.driver_user_id
        JOIN drivers d ON d.user_id = h.driver_user_id
        WHERE d.sponsor_id = ?
        ${driverClause}
        ORDER BY h.created_at DESC
        LIMIT 120
        `,
        driverParams
      )
    : [[]];

  return { sponsor, filter, driverRows, historyRows };
}

function summarizeSponsorReport(reportData) {
  const { sponsor, filter, driverRows, historyRows } = reportData;
  return {
    sponsor,
    filter,
    summary: {
      totalDrivers: driverRows.length,
      totalAwarded: driverRows.reduce((sum, row) => sum + Number(row.totalAwarded || 0), 0),
      totalReversed: driverRows.reduce((sum, row) => sum + Number(row.totalReversed || 0), 0),
      currentTotal: driverRows.reduce((sum, row) => sum + Number(row.currentPoints || 0), 0),
    },
    driverRows,
    historyRows,
  };
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
        d.flagged,
        d.admin_note
      FROM users u
      JOIN drivers d ON d.user_id = u.id
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
        d.flagged,
        d.admin_note
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
        flagged,
        admin_note
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
 * NEW STORY 10888 / 20719 — Admin can securely access sponsor accounts
 * GET /admin/sponsors/:sponsorId/account
 */
router.get("/sponsors/:sponsorId/account", async (req, res) => {
  const sponsorId = parsePositiveInt(req.params.sponsorId);
  if (!sponsorId) {
    return res.status(400).json({ ok: false, error: "invalid sponsorId" });
  }

  try {
    const snapshot = await loadSponsorAccountSnapshot(sponsorId);
    if (!snapshot) {
      return res.status(404).json({ ok: false, error: "sponsor not found" });
    }

    await writeAudit({
      category: "ADMIN_SPONSOR_ACCOUNT_VIEW",
      actorUserId: req.user.id,
      sponsorId,
      success: 1,
      details: `admin opened sponsor workspace for sponsorId=${sponsorId}`,
    });

    return res.json({ ok: true, ...snapshot });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "failed to fetch sponsor account" });
  }
});

/**
 * NEW STORY 10855 / 10923 / 10924 — Admin sponsor workspace report preview
 * GET /admin/sponsors/:sponsorId/reports/points
 * Optional query params: driverId
 */
router.get("/sponsors/:sponsorId/reports/points", async (req, res) => {
  const sponsorId = parsePositiveInt(req.params.sponsorId);
  if (!sponsorId) {
    return res.status(400).json({ ok: false, error: "invalid sponsorId" });
  }

  try {
    const reportData = await loadAdminSponsorPointsReportData(sponsorId, req.query?.driverId);
    if (!reportData.sponsor) {
      return res.status(404).json({ ok: false, error: "sponsor not found" });
    }
    if (reportData.invalidDriverFilter) {
      return res.status(400).json({ ok: false, error: "invalid driverId" });
    }
    if (reportData.driverNotFound) {
      return res.status(404).json({ ok: false, error: "driver not found for sponsor" });
    }

    const payload = summarizeSponsorReport(reportData);
    await writeAudit({
      category: "ADMIN_SPONSOR_REPORT_VIEW",
      actorUserId: req.user.id,
      sponsorId,
      success: 1,
      details: `admin viewed sponsor report for sponsorId=${sponsorId} filter=${payload.filter.label}`,
    });

    return res.json({ ok: true, ...payload });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "failed to fetch sponsor report" });
  }
});

/**
 * NEW STORY 10923 / 10924 — Admin sponsor workspace CSV export
 * GET /admin/sponsors/:sponsorId/reports/points.csv
 * Optional query params: driverId
 */
router.get("/sponsors/:sponsorId/reports/points.csv", async (req, res) => {
  const sponsorId = parsePositiveInt(req.params.sponsorId);
  if (!sponsorId) {
    return res.status(400).json({ ok: false, error: "invalid sponsorId" });
  }

  try {
    const reportData = await loadAdminSponsorPointsReportData(sponsorId, req.query?.driverId);
    if (!reportData.sponsor) {
      return res.status(404).json({ ok: false, error: "sponsor not found" });
    }
    if (reportData.invalidDriverFilter) {
      return res.status(400).json({ ok: false, error: "invalid driverId" });
    }
    if (reportData.driverNotFound) {
      return res.status(404).json({ ok: false, error: "driver not found for sponsor" });
    }

    const payload = summarizeSponsorReport(reportData);
    const dateLabel = new Date().toISOString().slice(0, 10);
    const filterSuffix = payload.filter.driverId ? `driver-${payload.filter.driverId}` : "all-drivers";
    const filename = `admin-sponsor-points-report-${sponsorId}-${filterSuffix}-${dateLabel}.csv`;

    const csvRows = [
      ["Sponsor", payload.sponsor.name],
      ["Driver Filter", payload.filter.label],
      [],
      ["Driver Email", "Status", "Current Points", "Total Awarded", "Total Reversed", "Net Change"],
      ...payload.driverRows.map((row) => [
        row.email,
        row.driverStatus,
        row.currentPoints,
        row.totalAwarded,
        row.totalReversed,
        row.netChange,
      ]),
      [],
      ["Occurred At", "Driver Email", "Points Change", "Reason"],
      ...payload.historyRows.map((row) => [row.occurredAt, row.email, row.pointsChange, row.reason]),
    ];

    const csv = csvRows.map((row) => row.map((cell) => escapeCsvCell(cell)).join(",")).join("\n");

    await writeAudit({
      category: "ADMIN_SPONSOR_REPORT_EXPORT_CSV",
      actorUserId: req.user.id,
      sponsorId,
      success: 1,
      details: `admin exported sponsor report csv for sponsorId=${sponsorId} filter=${payload.filter.label}`,
    });

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.status(200).send(csv);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "failed to export sponsor report csv" });
  }
});

/**
 * NEW STORY 10923 / 10924 — Admin sponsor workspace PDF export
 * GET /admin/sponsors/:sponsorId/reports/points.pdf
 * Optional query params: driverId
 */
router.get("/sponsors/:sponsorId/reports/points.pdf", async (req, res) => {
  const sponsorId = parsePositiveInt(req.params.sponsorId);
  if (!sponsorId) {
    return res.status(400).json({ ok: false, error: "invalid sponsorId" });
  }

  try {
    const reportData = await loadAdminSponsorPointsReportData(sponsorId, req.query?.driverId);
    if (!reportData.sponsor) {
      return res.status(404).json({ ok: false, error: "sponsor not found" });
    }
    if (reportData.invalidDriverFilter) {
      return res.status(400).json({ ok: false, error: "invalid driverId" });
    }
    if (reportData.driverNotFound) {
      return res.status(404).json({ ok: false, error: "driver not found for sponsor" });
    }

    const payload = summarizeSponsorReport(reportData);
    const now = new Date();
    const dateLabel = now.toISOString().slice(0, 10);
    const filterSuffix = payload.filter.driverId ? `driver-${payload.filter.driverId}` : "all-drivers";
    const filename = `admin-sponsor-points-report-${sponsorId}-${filterSuffix}-${dateLabel}.pdf`;

    await writeAudit({
      category: "ADMIN_SPONSOR_REPORT_EXPORT_PDF",
      actorUserId: req.user.id,
      sponsorId,
      success: 1,
      details: `admin exported sponsor report pdf for sponsorId=${sponsorId} filter=${payload.filter.label}`,
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    const doc = new PDFDocument({ size: "LETTER", margin: 40 });
    doc.pipe(res);

    doc.fontSize(18).text("Admin Sponsor Points Report");
    doc.moveDown(0.3);
    doc.fontSize(11).text(`Sponsor: ${payload.sponsor.name}`);
    doc.text(`Driver Filter: ${payload.filter.label}`);
    doc.text(`Generated: ${now.toLocaleString()}`);
    doc.moveDown(1);

    doc.fontSize(12).text(`Total Drivers: ${payload.summary.totalDrivers}`);
    doc.text(`Total Awarded: ${payload.summary.totalAwarded} pts`);
    doc.text(`Total Reversed: ${payload.summary.totalReversed} pts`);
    doc.text(`Current Points Across Drivers: ${payload.summary.currentTotal} pts`);
    doc.moveDown(1);

    doc.fontSize(13).text("Driver Summary");
    doc.moveDown(0.4);
    if (!payload.driverRows.length) {
      doc.fontSize(10).text("No drivers matched the selected filter.");
    } else {
      payload.driverRows.forEach((row) => {
        const line =
          `${row.email} | status=${row.driverStatus} | ` +
          `current=${row.currentPoints} | awarded=${row.totalAwarded} | reversed=${row.totalReversed}`;
        doc.fontSize(10).text(line, { width: 530 });
      });
    }

    doc.moveDown(1);
    doc.fontSize(13).text("Recent Point Activity");
    doc.moveDown(0.4);
    if (!payload.historyRows.length) {
      doc.fontSize(10).text("No point history rows found.");
    } else {
      payload.historyRows.forEach((row) => {
        const occurred = row.occurredAt ? new Date(row.occurredAt).toLocaleString() : "Unknown date";
        const sign = Number(row.pointsChange || 0) >= 0 ? "+" : "";
        const line = `${occurred} | ${row.email} | ${sign}${row.pointsChange} pts | ${row.reason || "No reason"}`;
        doc.fontSize(9).text(line, { width: 530 });
      });
    }

    doc.end();
    return null;
  } catch (err) {
    console.error(err);
    if (!res.headersSent) {
      return res.status(500).json({ ok: false, error: "failed to export sponsor report pdf" });
    }
    return null;
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

/**
 * POST /admin/bulk-upload
 * Requirement Change #1 - Admin bulk load organizations
 */
router.post("/bulk-upload", upload.single("file"), async (req, res) => {
  //const sponsorId = getSponsorIdFromSession(req);
  if (!req.file) return res.status(400).json({ ok: false, error: "no file uploaded" });

  const lines = req.file.buffer
    .toString("utf-8")
    .split("\n")
    .map(l => l.trim())
    .filter(Boolean);
  const errors = [];
  const results = [];
  const sessionOrgs = new Map();

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    const parts = lines[i].split("|");
    const type = parts[0]?.trim().toUpperCase();

    if (!["O", "D", "S"].includes(type)) {
      errors.push({ line: lineNum, error: "Invalid type, must be O, D, or S" });
      continue;
    }

    if (type === "O") {
      const orgName = parts[1]?.trim();
      if (!orgName) {
        errors.push({ line: lineNum, error: "Organization name is required for O type" });
        continue;
      }
      try {
        const [existing] = await pool.query(
          `SELECT id
          FROM sponsors
          WHERE name = ?
          LIMIT 1`,
          [orgName]
        );
        if (existing[0]) {
          sessionOrgs.set(orgName.toLowerCase(), existing[0].id);
          results.push({ line: lineNum, error: "Organization already exists" });
        } else {
          const [ins] = await pool.query(
            `INSERT INTO sponsors (name, status)
            VALUES (?, 'ACTIVE')`,
            [orgName]
          );
          sessionOrgs.set(orgName.toLowerCase(), ins.insertId);
          await writeAudit({
            category: "BULK_UPLOAD_ORG",
            actorUserId: req.user.id,
            sponsorId: ins.insertId,
            success: 1,
            details: `bulk upload created org="${orgName}" (id=${ins.insertId})`,
          });
          results.push({ line: lineNum, type: "O", orgName, status: "ok" });
        }
      } catch (err) {
        errors.push({ line: lineNum, error: `Failed to create org: ${err.message}` });
      }
      continue;
    }

    const orgName = parts[1]?.trim();
    const firstName = parts[2]?.trim();
    const lastName = parts[3]?.trim();
    const email = parts[4]?.trim();
    // points optional
    const points = parts[5]?.trim();
    const reason = parts[6]?.trim();

    if (!orgName) {
      errors.push({ line: lineNum, error: "Organization name is required" });
      continue;
    }
    if (!email) {
      errors.push({ line: lineNum, error: "Email is required"});
      continue;
    }
    if (type === "S" && points) {
      errors.push({ line: lineNum, error: "Points cant be assigned on this line"});
      continue;
    }
    if (points && !reason) {
      errors.push({ line: lineNum, error: "Must provide reason since points have been assigned"});
      continue;
    }

    let sponsorId = sessionOrgs.get(orgName.toLowerCase()) ?? null;
    if(!sponsorId) {
      const [orgRows] = await pool.query(
        `SELECT id
        FROM sponsors
        WHERE name = ?
        LIMIT 1`,
        [orgName]
      );
      if (!orgRows[0]) {
        errors.push({ line: lineNum, error: `Organization "${orgName}" does not exist` });
        continue;
      }
      sponsorId = orgRows[0].id;
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [existingUsers] = await conn.query(
        `SELECT id
        FROM users
        WHERE email = ?
        LIMIT 1`,
        [email]
      );
      let userId;
      if (existingUsers[0]) {
        userId = existingUsers[0].id;
      } else {
        const tempPassword = await bcrypt.hash(Math.random().toString(36) + Date.now(), 10);
        const role = type === "D" ? "DRIVER" : "SPONSOR";
        const [newUser] = await conn.query(
          `INSERT INTO users (email, password_hash, role, points)
          VALUES (?, ?, ?, 0)`,
          [email, tempPassword, role]
        );
        userId = newUser.insertId;
      }

      if (type === "D") {
        const [existingDriver] = await conn.query (
          `SELECT id
          From drivers
          WHERE user_id = ? AND sponsor_id = ?
          LIMIT 1`,
          [userId, sponsorId]
        );
        if (!existingDriver[0]) {
          await conn.query(
            `INSERT INTO drivers (user_id, sponsor_id, status, joined_on)
            VALUES (?, ?, 'ACTIVE', NOW())
            ON DUPLICATE KEY UPDATE status = 'ACTIVE', joined_on = NOW()`,
            [userId, sponsorId]
          );
          await conn.query(
            `UPDATE users
            SET sponsor_id = ?
            WHERE id = ?
            LIMIT 1`,
            [sponsorId, userId]
          );
        }

        if (points && reason) {
          const pointsInt = parsePositiveInt(points);
          if (!pointsInt) {
            errors.push({ line: lineNum, error: "Invalid points value"});
            continue;
          } else {
            await conn.query (
              `UPDATE users
              SET points = points + ?
              WHERE id = ?
              LIMIT 1`,
              [pointsInt, userId]
            );

            if (await tableExists("driver_points_history", conn)) {
              await conn.query(
                `INSERT INTo driver_points_history (driver_user_id, points_change, reason, created_at)
                VALUES (?, ?, ?, NOW())`,
                [userId, pointsInt, reason]
              );
            }
          }
        }
      }

      if (type === "S") {
        await conn.query(
          `UPDATE users
          SET sponsor_id = ?
          WHERE id = ? AND sponsor_id IS NULL
          LIMIT 1`,
          [sponsorId, userId]
        );
      }

      await writeAudit({
        category: "BULK_UPLOAD_ROW",
        actorUserId: req.user.id,
        targetUserId: userId,
        sponsorId,
        success: 1,
        details: `bulk upload line ${lineNum}: type=${type} email=${email}`,
        conn,
      });

      await conn.commit();
      results.push({ line: lineNum, email, type, status: "ok" });
    } catch (err) {
      await conn.rollback();
      errors.push({ line: lineNum, error: `Database error: ${err.message}` });
    } finally {
      conn.release();
    }
  }
  
  return res.json({ ok: true, processed: results.length, errors });

});

module.exports = router;
