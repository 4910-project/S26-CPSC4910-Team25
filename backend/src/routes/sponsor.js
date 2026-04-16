const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const jwt = require("jsonwebtoken");
const upload = multer({ storage: multer.memoryStorage() });
const bcrypt = require("bcryptjs");
const pool = require("../db");
const requireActiveSession = require("../middleware/requireActiveSession");
const PDFDocument = require("pdfkit");

const router = express.Router();

// ── Multer setup for org photos (same uploads dir as driver photos) ──────────
const uploadsDir = path.join(__dirname, "../../uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const orgPhotoStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `sponsor-${req.user.id}-${Date.now()}${ext}`);
  },
});

const orgPhotoUpload = multer({
  storage: orgPhotoStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only image files are allowed"));
  },
});

const APP_STATUSES = new Set(["PENDING", "APPROVED", "REJECTED"]);
const DRIVER_FILTERS = new Set(["ACTIVE", "DROPPED", "PROBATION", "PENDING"]);
const DECISION_MESSAGE_MAX = 500;
const POST_TITLE_MAX = 150;
const POST_BODY_MAX = 2000;

function parsePositiveInt(value) {
  const n = Number.parseInt(String(value), 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function parseNonNegativeInt(value) {
  const n = Number.parseInt(String(value), 10);
  return Number.isInteger(n) && n >= 0 ? n : null;
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

function normalizeSearchTerm(value) {
  const s = String(value || "").trim().toLowerCase();
  return s ? `%${s}%` : "";
}

function getDriverNameFilter(searchTerm) {
  if (!searchTerm) {
    return { clause: "", params: [] };
  }
  return {
    clause:
      " AND (LOWER(SUBSTRING_INDEX(u.email, '@', 1)) LIKE ? OR LOWER(u.email) LIKE ?)",
    params: [searchTerm, searchTerm],
  };
}

function getSponsorIdFromSession(req) {
  return parsePositiveInt(req.user?.sponsor_id);
}

function escapeCsvCell(value) {
  const raw = String(value ?? "");
  if (/[",\n]/.test(raw)) return `"${raw.replace(/"/g, '""')}"`;
  return raw;
}

async function loadSponsorPointsReportData(sponsorId) {
  const [[sponsor]] = await pool.query(
    "SELECT id, name FROM sponsors WHERE id = ? LIMIT 1",
    [sponsorId]
  );
  if (!sponsor) return null;

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
        GROUP BY d.id, u.email, d.status, u.points
        ORDER BY u.email ASC
        `,
        [sponsorId]
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
        ORDER BY u.email ASC
        `,
        [sponsorId]
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
        ORDER BY h.created_at DESC
        LIMIT 120
        `,
        [sponsorId]
      )
    : [[]];

  return { sponsor, driverRows, historyRows };
}

router.use(requireActiveSession);
router.use((req, res, next) => {
  if (req.user?.role !== "SPONSOR") {
    return res.status(403).json({ ok: false, error: "sponsor only" });
  }
  return next();
});

/**
 * GET /sponsor/org
 * Read-only sponsor organization details.
 */
router.get("/org", async (req, res) => {
  const sponsorId = getSponsorIdFromSession(req);
  if (!sponsorId) {
    return res.status(400).json({ ok: false, error: "sponsor account is not linked" });
  }

  try {
    const [rows] = await pool.query(
      `
      SELECT
        id AS sponsorId,
        name AS sponsorName,
        status AS sponsorStatus,
        address,
        contact_name AS contactName,
        contact_email AS contactEmail,
        contact_phone AS contactPhone,
        org_photo_url AS orgPhotoUrl
      FROM sponsors
      WHERE id = ?
      LIMIT 1
      `,
      [sponsorId]
    );

    if (!rows[0]) {
      return res.status(404).json({ ok: false, error: "sponsor not found" });
    }

    return res.json(rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "failed to fetch sponsor org details" });
  }
});

/**
 * PATCH /sponsor/org
 * Update sponsor organization details.
 */
router.patch("/org", async (req, res) => {
  const sponsorId = getSponsorIdFromSession(req);
  if (!sponsorId) {
    return res.status(400).json({ ok: false, error: "sponsor account is not linked" });
  }

  const { name, contactName, contactPhone, contactEmail, address } = req.body || {};

  if (!name || !String(name).trim()) {
    return res.status(400).json({ ok: false, error: "Company name is required" });
  }

  try {
    const [result] = await pool.query(
      `UPDATE sponsors
       SET name = ?,
           contact_name = ?,
           contact_phone = ?,
           contact_email = ?,
           address = ?
       WHERE id = ?
       LIMIT 1`,
      [
        String(name).trim(),
        contactName ? String(contactName).trim() : null,
        contactPhone ? String(contactPhone).trim() : null,
        contactEmail ? String(contactEmail).trim() : null,
        address ? String(address).trim() : null,
        sponsorId,
      ]
    );

    if (!result.affectedRows) {
      return res.status(404).json({ ok: false, error: "sponsor not found" });
    }

    const [rows] = await pool.query(
      `SELECT id AS sponsorId, name AS sponsorName, status AS sponsorStatus,
              address, contact_name AS contactName,
              contact_email AS contactEmail, contact_phone AS contactPhone
       FROM sponsors WHERE id = ? LIMIT 1`,
      [sponsorId]
    );

    return res.json({ ok: true, message: "Profile updated successfully", sponsor: rows[0] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "failed to update sponsor profile" });
  }
});

/**
 * POST /sponsor/org/photo
 * Upload or replace the org logo/photo for the authenticated sponsor.
 * Expects multipart/form-data with field name "photo".
 *
 * TODO: This photo can later be surfaced in the driver-facing catalogue header
 *       to show the driver's active sponsor branding alongside the catalogue title.
 */
router.post("/org/photo", (req, res, next) => {
  orgPhotoUpload.single("photo")(req, res, (err) => {
    if (err) {
      const msg = err.code === "LIMIT_FILE_SIZE"
        ? "File size must be under 5MB"
        : err.message || "Upload failed";
      return res.status(400).json({ ok: false, error: msg });
    }
    next();
  });
}, async (req, res) => {
  const sponsorId = getSponsorIdFromSession(req);
  if (!sponsorId) return res.status(400).json({ ok: false, error: "sponsor account is not linked" });
  if (!req.file) return res.status(400).json({ ok: false, error: "No file uploaded" });

  const orgPhotoUrl = `/uploads/${req.file.filename}`;
  try {
    await pool.query(
      "UPDATE sponsors SET org_photo_url = ? WHERE id = ? LIMIT 1",
      [orgPhotoUrl, sponsorId]
    );
    return res.json({ ok: true, orgPhotoUrl });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Failed to save photo" });
  }
});

/**
 * GET /sponsor/posts
 * Returns sponsor-authored posts for management.
 */
router.get("/posts", async (req, res) => {
  const sponsorId = getSponsorIdFromSession(req);
  if (!sponsorId) return res.status(400).json({ ok: false, error: "sponsor account is not linked" });

  try {
    const [rows] = await pool.query(
      `
      SELECT
        sp.id AS postId,
        sp.title,
        sp.body,
        sp.created_at AS createdAt,
        sp.updated_at AS updatedAt,
        COUNT(c.id) AS commentCount
      FROM sponsor_posts sp
      LEFT JOIN sponsor_post_comments c ON c.post_id = sp.id
      WHERE sp.sponsor_id = ?
      GROUP BY sp.id, sp.title, sp.body, sp.created_at, sp.updated_at
      ORDER BY sp.created_at DESC
      `,
      [sponsorId]
    );

    return res.json({ ok: true, posts: rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "failed to fetch sponsor posts" });
  }
});

/**
 * POST /sponsor/posts
 * Body: { title, body }
 * Creates a new sponsor-authored post.
 */
router.post("/posts", async (req, res) => {
  const sponsorId = getSponsorIdFromSession(req);
  if (!sponsorId) return res.status(400).json({ ok: false, error: "sponsor account is not linked" });

  const title = String(req.body?.title || "").trim();
  const body = String(req.body?.body || "").trim();

  if (!title) return res.status(400).json({ ok: false, error: "title is required" });
  if (!body) return res.status(400).json({ ok: false, error: "body is required" });
  if (title.length > POST_TITLE_MAX) {
    return res.status(400).json({ ok: false, error: `title must be ${POST_TITLE_MAX} characters or fewer` });
  }
  if (body.length > POST_BODY_MAX) {
    return res.status(400).json({ ok: false, error: `body must be ${POST_BODY_MAX} characters or fewer` });
  }

  try {
    const [result] = await pool.query(
      `
      INSERT INTO sponsor_posts (sponsor_id, author_user_id, title, body)
      VALUES (?, ?, ?, ?)
      `,
      [sponsorId, req.user.id, title, body]
    );

    const [rows] = await pool.query(
      `
      SELECT
        id AS postId,
        title,
        body,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM sponsor_posts
      WHERE id = ?
      LIMIT 1
      `,
      [result.insertId]
    );

    return res.status(201).json({
      ok: true,
      message: "Post published successfully",
      post: rows[0],
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "failed to create post" });
  }
});

/**
 * DELETE /sponsor/posts/:postId
 * Removes one of the sponsor's own posts.
 */
router.delete("/posts/:postId", async (req, res) => {
  const sponsorId = getSponsorIdFromSession(req);
  const postId = parsePositiveInt(req.params.postId);
  if (!sponsorId) return res.status(400).json({ ok: false, error: "sponsor account is not linked" });
  if (!postId) return res.status(400).json({ ok: false, error: "invalid postId" });

  try {
    const [result] = await pool.query(
      "DELETE FROM sponsor_posts WHERE id = ? AND sponsor_id = ? LIMIT 1",
      [postId, sponsorId]
    );
    if (!result.affectedRows) {
      return res.status(404).json({ ok: false, error: "post not found" });
    }

    return res.json({ ok: true, message: "Post deleted" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "failed to delete post" });
  }
});

/**
 * GET /sponsor/driver-applications?status=pending
 * Defaults to pending applications for the current sponsor.
 */
router.get("/driver-applications", async (req, res) => {
  const sponsorId = getSponsorIdFromSession(req);
  if (!sponsorId) {
    return res.status(400).json({ ok: false, error: "sponsor account is not linked" });
  }

  const status = String(req.query?.status || "pending").trim().toUpperCase();
  if (!APP_STATUSES.has(status)) {
    return res.status(400).json({ ok: false, error: "invalid status" });
  }

  try {
    const [rows] = await pool.query(
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
      LEFT JOIN drivers d ON d.user_id = da.driver_user_id
      WHERE da.sponsor_id = ? AND da.status = ?
      ORDER BY da.applied_at DESC
      `,
      [sponsorId, status]
    );

    return res.json({ applications: rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "failed to fetch driver applications" });
  }
});

/**
 * PATCH /sponsor/driver-applications/:applicationId
 * Body: { action: "approve" | "reject", message?: string, startingPoints?: number }
 */
router.patch("/driver-applications/:applicationId", async (req, res) => {
  const sponsorId = getSponsorIdFromSession(req);
  if (!sponsorId) {
    return res.status(400).json({ ok: false, error: "sponsor account is not linked" });
  }

  const applicationId = parsePositiveInt(req.params.applicationId);
  if (!applicationId) {
    return res.status(400).json({ ok: false, error: "invalid applicationId" });
  }

  const action = String(req.body?.action || "").trim().toLowerCase();
  if (action !== "approve" && action !== "reject") {
    return res.status(400).json({ ok: false, error: "action must be approve or reject" });
  }

  const messageRaw = req.body?.message;
  let decisionMessage = null;
  if (messageRaw !== undefined && messageRaw !== null) {
    if (typeof messageRaw !== "string") {
      return res.status(400).json({ ok: false, error: "message must be a string" });
    }
    const cleaned = messageRaw.trim();
    if (cleaned.length > DECISION_MESSAGE_MAX) {
      return res.status(400).json({
        ok: false,
        error: `message must be ${DECISION_MESSAGE_MAX} characters or fewer`,
      });
    }
    decisionMessage = cleaned || null;
  }

  const hasStartingPoints = req.body?.startingPoints !== undefined && req.body?.startingPoints !== null;
  const startingPoints = hasStartingPoints ? parseNonNegativeInt(req.body.startingPoints) : null;
  if (hasStartingPoints && startingPoints === null) {
    return res.status(400).json({ ok: false, error: "startingPoints must be a non-negative integer" });
  }
  if (action === "reject" && hasStartingPoints) {
    return res.status(400).json({ ok: false, error: "startingPoints can only be set when approving" });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [appRows] = await conn.query(
      `
      SELECT id, driver_user_id, sponsor_id, status
      FROM driver_applications
      WHERE id = ? AND sponsor_id = ?
      LIMIT 1
      FOR UPDATE
      `,
      [applicationId, sponsorId]
    );

    const app = appRows[0];
    if (!app) {
      await conn.rollback();
      return res.status(404).json({ ok: false, error: "application not found" });
    }

    if (app.status !== "PENDING") {
      await conn.rollback();
      return res.status(409).json({ ok: false, error: "application already decided" });
    }

    const targetStatus = action === "approve" ? "APPROVED" : "REJECTED";

    await conn.query(
      `
      UPDATE driver_applications
      SET status = ?, decided_at = NOW(), decided_by_user_id = ?, decision_message = ?
      WHERE id = ?
      `,
      [targetStatus, req.user.id, decisionMessage, applicationId]
    );

    if (targetStatus === "APPROVED") {
      if (hasStartingPoints) {
        await conn.query(
          `
          INSERT INTO drivers (
            user_id, sponsor_id, status, joined_on, dropped_reason, dropped_at, starting_points
          )
          VALUES (?, ?, 'ACTIVE', NOW(), NULL, NULL, ?)
          ON DUPLICATE KEY UPDATE
            sponsor_id = VALUES(sponsor_id),
            status = 'ACTIVE',
            joined_on = VALUES(joined_on),
            dropped_reason = NULL,
            dropped_at = NULL,
            starting_points = VALUES(starting_points)
          `,
          [app.driver_user_id, sponsorId, startingPoints]
        );
      } else {
        await conn.query(
          `
          INSERT INTO drivers (user_id, sponsor_id, status, joined_on, dropped_reason, dropped_at)
          VALUES (?, ?, 'ACTIVE', NOW(), NULL, NULL)
          ON DUPLICATE KEY UPDATE
            sponsor_id = VALUES(sponsor_id),
            status = 'ACTIVE',
            joined_on = VALUES(joined_on),
            dropped_reason = NULL,
            dropped_at = NULL
          `,
          [app.driver_user_id, sponsorId]
        );
      }

      await conn.query(
        "UPDATE users SET sponsor_id = ? WHERE id = ? LIMIT 1",
        [sponsorId, app.driver_user_id]
      );
    }

    const [updatedRows] = await conn.query(
      `
      SELECT
        da.id AS applicationId,
        da.driver_user_id AS driverUserId,
        da.sponsor_id AS sponsorId,
        da.status,
        da.decision_message AS decisionMessage,
        da.applied_at AS appliedAt,
        da.decided_at AS decidedAt,
        d.starting_points AS startingPoints
      FROM driver_applications da
      LEFT JOIN drivers d ON d.user_id = da.driver_user_id AND d.sponsor_id = da.sponsor_id
      WHERE da.id = ?
      LIMIT 1
      `,
      [applicationId]
    );

    await conn.commit();
    return res.json(updatedRows[0]);
  } catch (err) {
    await conn.rollback();
    console.error(err);
    return res.status(500).json({ ok: false, error: "failed to update application" });
  } finally {
    conn.release();
  }
});

/**
 * GET /sponsor/drivers?status=active|dropped|pending
 */
router.get("/drivers", async (req, res) => {
  const sponsorId = getSponsorIdFromSession(req);
  if (!sponsorId) {
    return res.status(400).json({ ok: false, error: "sponsor account is not linked" });
  }

  const requestedStatusRaw = req.query?.status ? String(req.query.status).trim().toUpperCase() : "";
  if (requestedStatusRaw && !DRIVER_FILTERS.has(requestedStatusRaw)) {
    return res.status(400).json({ ok: false, error: "invalid status filter" });
  }
  const searchTerm = normalizeSearchTerm(req.query?.name || req.query?.q);
  const { clause: nameFilterClause, params: nameFilterParams } = getDriverNameFilter(searchTerm);

  try {
    if (requestedStatusRaw === "PENDING") {
      const [pendingRows] = await pool.query(
        `
        SELECT
          NULL AS driverId,
          NULL AS userId,
          SUBSTRING_INDEX(u.email, '@', 1) AS name,
          u.email,
          'pending' AS status,
          NULL AS joinedOn,
          NULL AS startingPoints,
          NULL AS currentPoints
        FROM driver_applications da
        JOIN users u ON u.id = da.driver_user_id
        WHERE da.sponsor_id = ? AND da.status = 'PENDING'
        ${nameFilterClause}
        ORDER BY da.applied_at DESC
        `,
        [sponsorId, ...nameFilterParams]
      );

      return res.json({ drivers: pendingRows });
    }

    if (requestedStatusRaw === "ACTIVE" || requestedStatusRaw === "DROPPED" || requestedStatusRaw === "PROBATION") {
      const [rows] = await pool.query(
        `
        SELECT
          d.id AS driverId,
          d.user_id AS userId,
          SUBSTRING_INDEX(u.email, '@', 1) AS name,
          u.email,
          LOWER(d.status) AS status,
          d.joined_on AS joinedOn,
          d.starting_points AS startingPoints,
          d.flagged,
          u.points AS currentPoints
        FROM drivers d
        JOIN users u ON u.id = d.user_id
        WHERE d.sponsor_id = ? AND d.status = ?
        ${nameFilterClause}
        ORDER BY d.id DESC
        `,
        [sponsorId, requestedStatusRaw, ...nameFilterParams]
      );

      return res.json({ drivers: rows });
    }

    const [driverRows] = await pool.query(
      `
      SELECT
        d.id AS driverId,
        d.user_id AS userId,
        SUBSTRING_INDEX(u.email, '@', 1) AS name,
        u.email,
        LOWER(d.status) AS status,
        d.joined_on AS joinedOn,
        d.starting_points AS startingPoints,
        d.flagged,
        u.points AS currentPoints,
        d.admin_note AS adminNote
      FROM drivers d
      JOIN users u ON u.id = d.user_id
      WHERE d.sponsor_id = ?
      ${nameFilterClause}
      ORDER BY d.id DESC
      `,
      [sponsorId, ...nameFilterParams]
    );

    const [pendingRows] = await pool.query(
      `
      SELECT
        NULL AS driverId,
        NULL AS userId,
        SUBSTRING_INDEX(u.email, '@', 1) AS name,
        u.email,
        'pending' AS status,
        NULL AS joinedOn,
        NULL AS startingPoints,
        NULL AS currentPoints
      FROM driver_applications da
      JOIN users u ON u.id = da.driver_user_id
      WHERE da.sponsor_id = ? AND da.status = 'PENDING'
      ${nameFilterClause}
      ORDER BY da.applied_at DESC
      `,
      [sponsorId, ...nameFilterParams]
    );

    return res.json({ drivers: driverRows.concat(pendingRows) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "failed to fetch sponsor drivers" });
  }
});

// ---------------------------------------------------------------------------
// Helper: write audit log entry
// ---------------------------------------------------------------------------
async function writeAudit({ category, actorUserId = null, targetUserId = null, sponsorId = null, success = 0, details = "", conn = null }) {
  const q = `INSERT INTO audit_logs (category, actor_user_id, target_user_id, sponsor_id, success, details) VALUES (?, ?, ?, ?, ?, ?)`;
  const params = [category, actorUserId, targetUserId, sponsorId, success ? 1 : 0, details];
  if (conn) return conn.query(q, params);
  return pool.query(q, params);
}

/**
 * POST /sponsor/drivers/:driverId/block
 * Story #4 — Sponsor blocks a driver.
 * Body: { reason: "string" }  (required)
 */
router.post("/drivers/:driverId/block", async (req, res) => {
  const sponsorId = getSponsorIdFromSession(req);
  if (!sponsorId) return res.status(400).json({ ok: false, error: "sponsor account is not linked" });

  const driverId = parsePositiveInt(req.params.driverId);
  if (!driverId) return res.status(400).json({ ok: false, error: "invalid driverId" });

  const reason = String(req.body?.reason || "").trim();
  if (!reason) return res.status(400).json({ ok: false, error: "reason is required to block a driver" });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [dRows] = await conn.query(
      "SELECT id, user_id, status FROM drivers WHERE id = ? AND sponsor_id = ? LIMIT 1 FOR UPDATE",
      [driverId, sponsorId]
    );
    if (!dRows[0]) {
      await conn.rollback();
      return res.status(404).json({ ok: false, error: "driver not found under your sponsor" });
    }
    if (dRows[0].status === "BLOCKED") {
      await conn.rollback();
      return res.status(409).json({ ok: false, error: "driver is already blocked" });
    }

    await conn.query(
      "UPDATE drivers SET status = 'BLOCKED', dropped_reason = ?, dropped_at = NOW() WHERE id = ?",
      [reason, driverId]
    );

    await writeAudit({
      category: "DRIVER_BLOCKED",
      actorUserId: req.user.id,
      targetUserId: dRows[0].user_id,
      sponsorId,
      success: 1,
      details: `sponsor blocked driverId=${driverId}; reason=${reason}`,
      conn,
    });

    await conn.commit();
    return res.json({ ok: true, message: "Driver blocked successfully" });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    return res.status(500).json({ ok: false, error: "failed to block driver" });
  } finally {
    conn.release();
  }
});

/**
 * POST /sponsor/drivers/:driverId/unblock
 * Story #5 — Sponsor unblocks a driver.
 */
router.post("/drivers/:driverId/unblock", async (req, res) => {
  const sponsorId = getSponsorIdFromSession(req);
  if (!sponsorId) return res.status(400).json({ ok: false, error: "sponsor account is not linked" });

  const driverId = parsePositiveInt(req.params.driverId);
  if (!driverId) return res.status(400).json({ ok: false, error: "invalid driverId" });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [dRows] = await conn.query(
      "SELECT id, user_id, status FROM drivers WHERE id = ? AND sponsor_id = ? LIMIT 1 FOR UPDATE",
      [driverId, sponsorId]
    );
    if (!dRows[0]) {
      await conn.rollback();
      return res.status(404).json({ ok: false, error: "driver not found under your sponsor" });
    }
    if (dRows[0].status !== "BLOCKED") {
      await conn.rollback();
      return res.status(409).json({ ok: false, error: "driver is not currently blocked" });
    }

    await conn.query(
      "UPDATE drivers SET status = 'ACTIVE', dropped_reason = NULL, dropped_at = NULL WHERE id = ?",
      [driverId]
    );

    await writeAudit({
      category: "DRIVER_UNBLOCKED",
      actorUserId: req.user.id,
      targetUserId: dRows[0].user_id,
      sponsorId,
      success: 1,
      details: `sponsor unblocked driverId=${driverId}`,
      conn,
    });

    await conn.commit();
    return res.json({ ok: true, message: "Driver unblocked successfully" });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    return res.status(500).json({ ok: false, error: "failed to unblock driver" });
  } finally {
    conn.release();
  }
});

/**
 * POST /sponsor/driver-applications/:applicationId/reopen
 * Story #1 — Sponsor reopens a rejected application.
 */
router.post("/driver-applications/:applicationId/reopen", async (req, res) => {
  const sponsorId = getSponsorIdFromSession(req);
  if (!sponsorId) return res.status(400).json({ ok: false, error: "sponsor account is not linked" });

  const applicationId = parsePositiveInt(req.params.applicationId);
  if (!applicationId) return res.status(400).json({ ok: false, error: "invalid applicationId" });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [aRows] = await conn.query(
      "SELECT id, driver_user_id, status FROM driver_applications WHERE id = ? AND sponsor_id = ? LIMIT 1 FOR UPDATE",
      [applicationId, sponsorId]
    );
    if (!aRows[0]) {
      await conn.rollback();
      return res.status(404).json({ ok: false, error: "application not found" });
    }
    if (aRows[0].status !== "REJECTED") {
      await conn.rollback();
      return res.status(409).json({ ok: false, error: "only REJECTED applications can be reopened" });
    }

    await conn.query(
      "UPDATE driver_applications SET status = 'PENDING', decided_at = NULL, decided_by_user_id = NULL WHERE id = ?",
      [applicationId]
    );

    await writeAudit({
      category: "APPLICATION_STATUS_CHANGE",
      actorUserId: req.user.id,
      targetUserId: aRows[0].driver_user_id,
      sponsorId,
      success: 1,
      details: `sponsor reopened applicationId=${applicationId} (REJECTED -> PENDING)`,
      conn,
    });

    await conn.commit();
    return res.json({ ok: true, message: "Application reopened successfully" });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    return res.status(500).json({ ok: false, error: "failed to reopen application" });
  } finally {
    conn.release();
  }
});

/**
 * PATCH /sponsor/drivers/:driverId/starting-points
 * Body: { startingPoints: number }
 */
router.patch("/drivers/:driverId/starting-points", async (req, res) => {
  const sponsorId = getSponsorIdFromSession(req);
  if (!sponsorId) {
    return res.status(400).json({ ok: false, error: "sponsor account is not linked" });
  }

  const driverId = parsePositiveInt(req.params.driverId);
  if (!driverId) {
    return res.status(400).json({ ok: false, error: "invalid driverId" });
  }

  const startingPoints = parseNonNegativeInt(req.body?.startingPoints);
  if (startingPoints === null) {
    return res.status(400).json({ ok: false, error: "startingPoints must be a non-negative integer" });
  }

  try {
    const [updateResult] = await pool.query(
      `
      UPDATE drivers
      SET starting_points = ?
      WHERE id = ? AND sponsor_id = ?
      LIMIT 1
      `,
      [startingPoints, driverId, sponsorId]
    );

    if (!updateResult.affectedRows) {
      return res.status(404).json({ ok: false, error: "driver not found for sponsor" });
    }

    const [rows] = await pool.query(
      `
      SELECT
        d.id AS driverId,
        d.user_id AS userId,
        SUBSTRING_INDEX(u.email, '@', 1) AS name,
        u.email,
        LOWER(d.status) AS status,
        d.joined_on AS joinedOn,
        d.starting_points AS startingPoints,
        u.points AS currentPoints
      FROM drivers d
      JOIN users u ON u.id = d.user_id
      WHERE d.id = ? AND d.sponsor_id = ?
      LIMIT 1
      `,
      [driverId, sponsorId]
    );

    return res.json(rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "failed to set starting points" });
  }
});

/**
 * POST /sponsor/drivers/:driverId/reverse-points
 * Body: { points: number, reason?: string }
 * Story 10781 — Sponsor reverses points that were awarded by mistake.
 */
router.post("/drivers/:driverId/reverse-points", async (req, res) => {
  const sponsorId = getSponsorIdFromSession(req);
  if (!sponsorId) return res.status(400).json({ ok: false, error: "sponsor account is not linked" });

  const driverId = parsePositiveInt(req.params.driverId);
  if (!driverId) return res.status(400).json({ ok: false, error: "invalid driverId" });

  const points = parsePositiveInt(req.body?.points);
  if (!points) {
    return res.status(400).json({ ok: false, error: "points must be a positive integer" });
  }

  const reasonInput = req.body?.reason != null ? String(req.body.reason).trim() : "";
  const reason =
    (reasonInput || "Points reversed by sponsor due to mistaken award").slice(0, 255);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [driverRows] = await conn.query(
      `
      SELECT d.id, d.user_id, u.points AS currentPoints
      FROM drivers d
      JOIN users u ON u.id = d.user_id
      WHERE d.id = ? AND d.sponsor_id = ?
      LIMIT 1
      FOR UPDATE
      `,
      [driverId, sponsorId]
    );

    const driver = driverRows[0];
    if (!driver) {
      await conn.rollback();
      return res.status(404).json({ ok: false, error: "driver not found under your sponsor" });
    }

    const currentPoints = Number(driver.currentPoints || 0);
    if (currentPoints < points) {
      await conn.rollback();
      return res.status(409).json({
        ok: false,
        error: "driver does not have enough points to reverse this amount",
        currentPoints,
      });
    }

    const newBalance = currentPoints - points;
    await conn.query("UPDATE users SET points = ? WHERE id = ? LIMIT 1", [newBalance, driver.user_id]);

    if (await tableExists("driver_points_history", conn)) {
      await conn.query(
        `
        INSERT INTO driver_points_history (driver_user_id, points_change, reason, created_at)
        VALUES (?, ?, ?, NOW())
        `,
        [driver.user_id, -points, `Sponsor reversal: ${reason}`]
      );
    }

    await writeAudit({
      category: "POINTS_REVERSED",
      actorUserId: req.user.id,
      targetUserId: driver.user_id,
      sponsorId,
      success: 1,
      details: `reversed ${points} points for driverId=${driverId}; reason=${reason}`,
      conn,
    });

    await conn.commit();
    return res.json({
      ok: true,
      driverId,
      reversedPoints: points,
      newBalance,
      reason,
    });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    return res.status(500).json({ ok: false, error: "failed to reverse points" });
  } finally {
    conn.release();
  }
});

/**
 * GET /sponsor/reports/points.csv
 * Sponsor can export the points report as CSV.
 */
router.get("/reports/points.csv", async (req, res) => {
  const sponsorId = getSponsorIdFromSession(req);
  if (!sponsorId) return res.status(400).json({ ok: false, error: "sponsor account is not linked" });

  try {
    const reportData = await loadSponsorPointsReportData(sponsorId);
    if (!reportData) return res.status(404).json({ ok: false, error: "sponsor not found" });

    const { sponsor, driverRows, historyRows } = reportData;
    const dateLabel = new Date().toISOString().slice(0, 10);
    const filename = `sponsor-points-report-${dateLabel}.csv`;

    const summaryRows = [
      ["Sponsor", sponsor.name],
      [],
      ["Driver Email", "Status", "Current Points", "Total Awarded", "Total Reversed", "Net Change"],
      ...driverRows.map((row) => [
        row.email,
        row.driverStatus,
        row.currentPoints,
        row.totalAwarded,
        row.totalReversed,
        row.netChange,
      ]),
      [],
      ["Occurred At", "Driver Email", "Points Change", "Reason"],
      ...historyRows.map((row) => [row.occurredAt, row.email, row.pointsChange, row.reason]),
    ];

    const csv = summaryRows
      .map((row) => row.map((cell) => escapeCsvCell(cell)).join(","))
      .join("\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.status(200).send(csv);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "failed to export report csv" });
  }
});

/**
 * GET /sponsor/reports/points.pdf
 * Story 10791 — Sponsor can export points report as a PDF.
 */
router.get("/reports/points.pdf", async (req, res) => {
  const sponsorId = getSponsorIdFromSession(req);
  if (!sponsorId) return res.status(400).json({ ok: false, error: "sponsor account is not linked" });

  try {
    const reportData = await loadSponsorPointsReportData(sponsorId);
    if (!reportData) return res.status(404).json({ ok: false, error: "sponsor not found" });

    const { sponsor, driverRows, historyRows } = reportData;

    const now = new Date();
    const dateLabel = now.toISOString().slice(0, 10);
    const filename = `sponsor-points-report-${dateLabel}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    const doc = new PDFDocument({ size: "LETTER", margin: 40 });
    doc.pipe(res);

    doc.fontSize(18).text("Sponsor Points Report");
    doc.moveDown(0.3);
    doc.fontSize(11).text(`Sponsor: ${sponsor.name}`);
    doc.text(`Generated: ${now.toLocaleString()}`);
    doc.moveDown(1);

    const totalDrivers = driverRows.length;
    const awarded = driverRows.reduce((sum, row) => sum + Number(row.totalAwarded || 0), 0);
    const reversed = driverRows.reduce((sum, row) => sum + Number(row.totalReversed || 0), 0);
    const currentTotal = driverRows.reduce((sum, row) => sum + Number(row.currentPoints || 0), 0);

    doc.fontSize(12).text(`Total Drivers: ${totalDrivers}`);
    doc.text(`Total Awarded: ${awarded} pts`);
    doc.text(`Total Reversed: ${reversed} pts`);
    doc.text(`Current Points Across Drivers: ${currentTotal} pts`);
    doc.moveDown(1);

    doc.fontSize(13).text("Driver Summary");
    doc.moveDown(0.4);
    driverRows.forEach((row) => {
      const line =
        `${row.email} | status=${row.driverStatus} | ` +
        `current=${row.currentPoints} | awarded=${row.totalAwarded} | reversed=${row.totalReversed}`;
      doc.fontSize(10).text(line, { width: 530 });
    });

    doc.moveDown(1);
    doc.fontSize(13).text("Recent Point Activity");
    doc.moveDown(0.4);
    if (!historyRows.length) {
      doc.fontSize(10).text("No point history rows found.");
    } else {
      historyRows.forEach((row) => {
        const occurred = row.occurredAt ? new Date(row.occurredAt).toLocaleString() : "Unknown date";
        const sign = Number(row.pointsChange || 0) >= 0 ? "+" : "";
        const line = `${occurred} | ${row.email} | ${sign}${row.pointsChange} pts | ${row.reason || "No reason"}`;
        doc.fontSize(9).text(line, { width: 530 });
      });
    }

    doc.end();
  } catch (err) {
    console.error(err);
    if (!res.headersSent) {
      return res.status(500).json({ ok: false, error: "failed to export report pdf" });
    }
    return null;
  }
});

/**
 * POST /sponsor/drivers/:driverId/rate
 * Body: { rating: "thumbs_up" | "thumbs_down" }
 * Upserts a reliability rating for a driver. Sponsor can change their rating at any time.
 */
router.post("/drivers/:driverId/rate", async (req, res) => {
  const sponsorId = getSponsorIdFromSession(req);
  if (!sponsorId) return res.status(400).json({ ok: false, error: "sponsor account is not linked" });

  const driverId = parsePositiveInt(req.params.driverId);
  if (!driverId) return res.status(400).json({ ok: false, error: "invalid driverId" });

  const rating = String(req.body?.rating || "").trim();
  if (rating !== "thumbs_up" && rating !== "thumbs_down") {
    return res.status(400).json({ ok: false, error: "rating must be thumbs_up or thumbs_down" });
  }

  try {
    // Verify driver belongs to this sponsor
    const [dRows] = await pool.query(
      "SELECT id, user_id FROM drivers WHERE id = ? AND sponsor_id = ? LIMIT 1",
      [driverId, sponsorId]
    );
    if (!dRows[0]) return res.status(404).json({ ok: false, error: "driver not found under your sponsor" });

    // Upsert — update if already rated, insert if not
    await pool.query(
      `INSERT INTO driver_ratings (sponsor_id, driver_id, rating)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE rating = VALUES(rating), updated_at = NOW()`,
      [sponsorId, driverId, rating]
    );

    await writeAudit({
      category: "DRIVER_RATED",
      actorUserId: req.user.id,
      targetUserId: dRows[0].user_id,
      sponsorId,
      success: 1,
      details: `sponsor rated driverId=${driverId} as ${rating}`,
    });

    return res.json({ ok: true, message: "Rating saved", rating });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "failed to save rating" });
  }
});

/**
 * GET /sponsor/drivers/:driverId/rate
 * Returns the current rating for a driver from this sponsor.
 */
router.get("/drivers/:driverId/rate", async (req, res) => {
  const sponsorId = getSponsorIdFromSession(req);
  if (!sponsorId) return res.status(400).json({ ok: false, error: "sponsor account is not linked" });

  const driverId = parsePositiveInt(req.params.driverId);
  if (!driverId) return res.status(400).json({ ok: false, error: "invalid driverId" });

  try {
    const [rows] = await pool.query(
      "SELECT rating FROM driver_ratings WHERE sponsor_id = ? AND driver_id = ? LIMIT 1",
      [sponsorId, driverId]
    );
    return res.json({ ok: true, rating: rows[0]?.rating || null });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "failed to fetch rating" });
  }
});


/**
 * POST /sponsor/drivers/:driverId/award-points
 * RC2 — Sponsor awards points to a specific driver.
 * Writes to drivers.points_balance (per-sponsor) and keeps users.points in sync.
 * Body: { points: number, reason: string }
 */
router.post("/drivers/:driverId/award-points", async (req, res) => {
  const sponsorId = getSponsorIdFromSession(req);
  if (!sponsorId) return res.status(400).json({ ok: false, error: "sponsor account is not linked" });

  const driverId = parsePositiveInt(req.params.driverId);
  if (!driverId) return res.status(400).json({ ok: false, error: "invalid driverId" });

  const points = parsePositiveInt(req.body?.points);
  if (!points) return res.status(400).json({ ok: false, error: "points must be a positive integer" });

  const reason = String(req.body?.reason || "").trim();
  if (!reason) return res.status(400).json({ ok: false, error: "reason is required" });

  try {
    // Verify driver belongs to this sponsor and is ACTIVE
    const [[driver]] = await pool.query(
      `SELECT d.id, d.user_id, d.status, d.points_balance
       FROM drivers d
       WHERE d.id = ? AND d.sponsor_id = ?
       LIMIT 1`,
      [driverId, sponsorId]
    );
    if (!driver) return res.status(404).json({ ok: false, error: "Driver not found under your organization" });
    if (driver.status === "PROBATION") {
      return res.status(400).json({ ok: false, error: "Cannot award points to a driver on probation" });
    }
    if (driver.status !== "ACTIVE") {
      return res.status(400).json({ ok: false, error: `Driver must be ACTIVE to receive points (current: ${driver.status})` });
    }

    const driverUserId = driver.user_id;
    const newBalance = (driver.points_balance || 0) + points;

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // Update per-sponsor balance on the drivers row
      await conn.query(
        "UPDATE drivers SET points_balance = ? WHERE id = ? LIMIT 1",
        [newBalance, driverId]
      );

      // Keep legacy users.points in sync for backwards-compat endpoints
      await conn.query(
        "UPDATE users SET points = points + ? WHERE id = ? LIMIT 1",
        [points, driverUserId]
      );

      // Log to driver_points_history for audit trail / report
      if (await tableExists("driver_points_history")) {
        await conn.query(
          `INSERT INTO driver_points_history (driver_user_id, sponsor_id, points_change, reason, created_at)
           VALUES (?, ?, ?, ?, NOW())`,
          [driverUserId, sponsorId, points, reason]
        );
      }

      await writeAudit({
        category: "POINTS_AWARDED",
        actorUserId: req.user.id,
        targetUserId: driverUserId,
        sponsorId,
        success: 1,
        details: `awarded ${points} pts to driverId=${driverId}; reason=${reason}`,
        conn,
      });

      await conn.commit();
      return res.json({ ok: true, awarded: points, newBalance });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Failed to award points" });
  }
});

/**
 * GET /sponsor/catalog/hidden
 * Returns all hidden product IDs and their full details for this sponsor.
 */
router.get("/catalog/hidden", async (req, res) => {
  const sponsorId = getSponsorIdFromSession(req);
  if (!sponsorId) return res.status(400).json({ ok: false, error: "sponsor account is not linked" });

  try {
    const [rows] = await pool.query(
      "SELECT product_id, product_name, artist_name, artwork_url, price FROM sponsor_hidden_products WHERE sponsor_id = ?",
      [sponsorId]
    );
    const hiddenIds = rows.map((r) => r.product_id);
    return res.json({ ok: true, hiddenIds, hiddenProducts: rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "failed to fetch hidden products" });
  }
});

/**
 * POST /sponsor/catalog/hide
 * Body: { productId, productName, artistName, artworkUrl, price }
 * Hides a product for this sponsor's drivers.
 */
router.post("/catalog/hide", async (req, res) => {
  const sponsorId = getSponsorIdFromSession(req);
  if (!sponsorId) return res.status(400).json({ ok: false, error: "sponsor account is not linked" });

  const productId = String(req.body?.productId || "").trim();
  if (!productId) return res.status(400).json({ ok: false, error: "productId is required" });

  const productName = String(req.body?.productName || "").trim() || null;
  const artistName  = String(req.body?.artistName  || "").trim() || null;
  const artworkUrl  = String(req.body?.artworkUrl  || "").trim() || null;
  const price       = req.body?.price != null ? parseFloat(req.body.price) : null;

  try {
    await pool.query(
      `INSERT INTO sponsor_hidden_products (sponsor_id, product_id, product_name, artist_name, artwork_url, price)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE product_name = VALUES(product_name), artist_name = VALUES(artist_name),
         artwork_url = VALUES(artwork_url), price = VALUES(price), hidden_at = NOW()`,
      [sponsorId, productId, productName, artistName, artworkUrl, price]
    );
    return res.json({ ok: true, message: "Product hidden" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "failed to hide product" });
  }
});

/**
 * POST /sponsor/catalog/unhide
 * Body: { productId }
 * Removes a product from the hidden list.
 */
router.post("/catalog/unhide", async (req, res) => {
  const sponsorId = getSponsorIdFromSession(req);
  if (!sponsorId) return res.status(400).json({ ok: false, error: "sponsor account is not linked" });

  const productId = String(req.body?.productId || "").trim();
  if (!productId) return res.status(400).json({ ok: false, error: "productId is required" });

  try {
    await pool.query(
      "DELETE FROM sponsor_hidden_products WHERE sponsor_id = ? AND product_id = ?",
      [sponsorId, productId]
    );
    return res.json({ ok: true, message: "Product unhidden" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "failed to unhide product" });
  }
});

/**
 * GET /sponsor/point-value
 * Returns this sponsor's dollar-per-point value.
 */
router.get("/point-value", async (req, res) => {
  const sponsorId = getSponsorIdFromSession(req);
  if (!sponsorId) return res.status(400).json({ ok: false, error: "sponsor account is not linked" });

  try {
    const [[row]] = await pool.query("SELECT point_value FROM sponsors WHERE id = ? LIMIT 1", [sponsorId]);
    if (!row) return res.status(404).json({ ok: false, error: "sponsor not found" });
    return res.json({ ok: true, pointValue: parseFloat(row.point_value) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "failed to fetch point value" });
  }
});

/**
 * PATCH /sponsor/point-value
 * Body: { pointValue: number }  — dollar value per point (e.g. 0.01 = $0.01/pt)
 */
router.patch("/point-value", async (req, res) => {
  const sponsorId = getSponsorIdFromSession(req);
  if (!sponsorId) return res.status(400).json({ ok: false, error: "sponsor account is not linked" });

  const raw = parseFloat(req.body?.pointValue);
  if (isNaN(raw) || raw < 0 || raw > 1) {
    return res.status(400).json({ ok: false, error: "pointValue must be a number between 0 and 1 (e.g. 0.01 = $0.01 per point)" });
  }

  try {
    await pool.query("UPDATE sponsors SET point_value = ? WHERE id = ? LIMIT 1", [raw, sponsorId]);
    await writeAudit({
      category: "POINT_VALUE_CHANGED",
      actorUserId: req.user.id,
      sponsorId,
      success: 1,
      details: `sponsor set point_value=${raw}`,
    });
    return res.json({ ok: true, pointValue: raw });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "failed to update point value" });
  }
});

/**
 * POST /sponsor/assume-driver/:driverUserId
 * Sponsor assumes the identity of one of their own drivers.
 * Returns a short-lived JWT scoped to that driver.
 */
router.post("/assume-driver/:driverUserId", async (req, res) => {
  const sponsorId = getSponsorIdFromSession(req);
  if (!sponsorId) return res.status(400).json({ ok: false, error: "sponsor account is not linked" });

  const driverUserId = parsePositiveInt(req.params.driverUserId);
  if (!driverUserId) return res.status(400).json({ ok: false, error: "invalid driverUserId" });

  try {
    // Confirm this driver actually belongs to this sponsor
    const [dRows] = await pool.query(
      "SELECT d.user_id, u.email, u.role, u.status, u.sponsor_id FROM drivers d JOIN users u ON u.id = d.user_id WHERE d.user_id = ? AND d.sponsor_id = ? AND d.status IN ('ACTIVE','PROBATION') LIMIT 1",
      [driverUserId, sponsorId]
    );
    if (!dRows[0]) return res.status(404).json({ ok: false, error: "driver not found under your sponsor" });

    const target = dRows[0];
    const JWT_SECRET = process.env.JWT_SECRET;
    if (!JWT_SECRET) return res.status(500).json({ ok: false, error: "JWT_SECRET not configured" });

    const token = jwt.sign(
      { id: target.user_id, role: "DRIVER", sponsor_id: sponsorId, assumed_by: req.user.id, assumed_by_role: "SPONSOR" },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    await writeAudit({
      category: "SPONSOR_ASSUME_DRIVER",
      actorUserId: req.user.id,
      targetUserId: target.user_id,
      sponsorId,
      success: 1,
      details: `sponsor userId=${req.user.id} assumed identity of driverUserId=${target.user_id}`,
    });

    return res.json({ ok: true, token, user: { id: target.user_id, email: target.email, role: "DRIVER" } });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "failed to assume driver identity" });
  }
});

//GET /api/settings/notifications
router.get("/settings/notifications", async(req, res) => {
  const [rows] = await pool.query(
    `
    SELECT setting_value
    FROM system_settings
    WHERE setting_key = 'notifications_enabled'
    LIMIT 1
    `
  );
  return res.json({ ok: true, notifications_enabled: rows[0]?.setting_value !== "false" });
});

/**
 * POST /api/feedback
 * Body: { category, message }
 * Submit feedback from the sponsor.
 */
router.post("/feedback", async (req, res) => {
  const userId = parsePositiveInt(req.user?.id);
  if (!userId) return res.status(401).json({ ok: false, error: "invalid session" });

  const VALID_CATEGORIES = [
    "Bug Report", "Feature Request", "Points Issue",
    "Account Problem", "Sponsor Issue", "General Feedback", "Other"
  ];

  const category = String(req.body?.category || "").trim();
  const message  = String(req.body?.message  || "").trim();

  if (!VALID_CATEGORIES.includes(category)) {
    return res.status(400).json({ ok: false, error: "invalid category" });
  }
  if (!message || message.length < 10) {
    return res.status(400).json({ ok: false, error: "message must be at least 10 characters" });
  }
  if (message.length > 2000) {
    return res.status(400).json({ ok: false, error: "message must be under 2000 characters" });
  }

  try {
    await pool.query(
      "INSERT INTO feedback (user_id, category, message) VALUES (?, ?, ?)",
      [userId, category, message]
    );
    return res.json({ ok: true, message: "Feedback submitted successfully. Thank you!" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "failed to submit feedback" });
  }
});

/**
 * POST /sponsor/drivers/:driverId/probation
 * Body: { reason: "string" }
 * Puts a driver on probation
 */
router.post("/drivers/:driverId/probation", async (req, res) => {
  const sponsorId = getSponsorIdFromSession(req);
  if (!sponsorId) return res.status(400).json({ ok: false, error: "sponsor account is not linked "});
  
  const driverId = parsePositiveInt(req.params.driverId);
  if (!driverId) return res.status(400).json({ ok: false, error: "invalid driverId"});
  
  const reason = String(req.body?.reason || "").trim();
  if(!reason) return res.status(400).json({ ok:false, error: "reason is required"});

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [dRows] = await conn.query(
      `SELECT id, user_id, status
      FROM drivers
      WHERE id = ? AND sponsor_id = ?
      LIMIT 1 FOR UPDATE`,
      [driverId, sponsorId]
    );
    if (!dRows[0]) {
      await conn.rollback();
      return res.status(404).json({ ok: false, error: "driver not found" });
    }
    if (dRows[0].status === "PROBATION") {
      await conn.rollback();
      return res.status(409).json({ ok: false, error: "Driver is already on probation"});
    }
    if (dRows[0].status === "DROPPED") {
      await conn.rollback();
      return res.status(409).json({ ok: false, error: "driver is dropped" });
    }
    await conn.query(
      `UPDATE drivers
      SET status = 'PROBATION', probation_reason = ?
      WHERE id = ?`,
      [reason, driverId]
    );

    await writeAudit({
      category: "DRIVER_PROBATION",
      actorUserId: req.user.id,
      targetUserId: dRows[0].user_id,
      sponsorId,
      success: 1,
      details: `sponsor placed driverId=${driverId} on probation; reason=${reason}`,
      conn,
    });

    await conn.commit();
    return res.json({ ok: true, message: "Driver placed on probation and is currently suspended. They will not be able to earn points in this state" });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    return res.status(500).json({ ok: false, error: "failed to place driver on probation" });
  } finally {
    conn.release();
  }
});

/**
 * POST /sponsor/drivers/:driverId/lift-probation
 * Lifts driver from probation and places them on active status
 */
router.post("/drivers/:driverId/lift-probation", async (req, res) => {
  const sponsorId = getSponsorIdFromSession(req);
  if (!sponsorId) return res.status(400).json({ ok: false, error: "sponsor account is not linked "});
  
  const driverId = parsePositiveInt(req.params.driverId);
  if (!driverId) return res.status(400).json({ ok: false, error: "invalid driverId"});

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [dRows] = await conn.query(
      `SELECT id, user_id, status
      FROM drivers
      WHERE id = ? AND sponsor_id = ?
      LIMIT 1 FOR UPDATE`,
      [driverId, sponsorId]
    );
    if (!dRows[0]) {
      await conn.rollback();
      return res.status(404).json({ ok: false, error: "driver not found" });
    }
    if (dRows[0].status !== "PROBATION") {
      await conn.rollback();
      return res.status(409).json({ ok: false, error: "Driver is not on probation"});
    }
    
    await conn.query(
      `UPDATE drivers
      SET status = 'ACTIVE', probation_reason = NULL
      WHERE id = ?`,
      [driverId]
    );

    await writeAudit({
      category: "DRIVER_PROBATION_LIFTED",
      actorUserId: req.user.id,
      targetUserId: dRows[0].user_id,
      sponsorId,
      success: 1,
      details: `sponsor lifted probation for driverId=${driverId}`,
      conn,
    });

    await conn.commit();
    return res.json({ ok: true, message: "probation lifted" });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    return res.status(500).json({ ok: false, error: "failed to lift probation" });
  } finally {
    conn.release();
  }
});

// DROP SPONSOR
/**
 * POST /sponsor/drivers/:driverId/drop
 * Permanently drops a driver from the sponsor
 */
router.post("/drivers/:driverId/drop", async (req, res) => {
  const sponsorId = getSponsorIdFromSession(req);
  if (!sponsorId) return res.status(400).json({ ok: false, error: "sponsor account is not linked "});
  
  const driverId = parsePositiveInt(req.params.driverId);
  if (!driverId) return res.status(400).json({ ok: false, error: "invalid driverId"});
  
  const reason = String(req.body?.reason || "").trim();
  if(!reason) return res.status(400).json({ ok:false, error: "reason is required"});

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [dRows] = await conn.query(
      `SELECT id, user_id, status
      FROM drivers
      WHERE id = ? AND sponsor_id = ?
      LIMIT 1 FOR UPDATE`,
      [driverId, sponsorId]
    );
    if (!dRows[0]) {
      await conn.rollback();
      return res.status(404).json({ ok: false, error: "driver not found" });
    }
    if (dRows[0].status === "DROPPED") {
      await conn.rollback();
      return res.status(409).json({ ok: false, error: "Driver is already dropped"});
    }
  
    await conn.query(
      `UPDATE drivers
      SET status = 'DROPPED', dropped_reason = ?, dropped_at = NOW(), probation_reason = NULL
      WHERE id = ?`,
      [reason, driverId]
    );

    await conn.query(
      `UPDATE drivers
      SET sponsor_id = NULL
      WHERE id = ?
      LIMIT 1`,
      [dRows[0].user_id]
    );

    await writeAudit({
      category: "DRIVER_DROPPED",
      actorUserId: req.user.id,
      targetUserId: dRows[0].user_id,
      sponsorId,
      success: 1,
      details: `sponsor dropped driverId=${driverId}; reason=${reason}`,
      conn,
    });

    // Non-dismissible in-app notification — required by spec
    try {
      await conn.query(
        `INSERT INTO notifications (user_id, type, message, is_dismissible)
         VALUES (?, 'DROPPED', ?, 0)`,
        [dRows[0].user_id, `You have been dropped by your sponsor. Reason: ${reason}`]
      );
    } catch (_) { /* notifications table may not exist yet — never block the drop */ }

    await conn.commit();
    return res.json({ ok: true, message: "Driver dropped successfully" });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    return res.status(500).json({ ok: false, error: "failed to drop driver" });
  } finally {
    conn.release();
  }
});

/**
 * POST /sponsor/bulk-upload
 * Body: pipe delimited text file
 * Requirement Change #1
 */
router.post("/bulk-upload", upload.single("file"), async (req, res) => {
  const sponsorId = getSponsorIdFromSession(req);
  if (!sponsorId) return res.status(400).json({ ok: false, error: "sponsor account is not linked" });
  if (!req.file) return res.status(400).json({ ok: false, error: "no file uploaded" });

  const lines = req.file.buffer
    .toString("utf-8")
    .split("\n")
    .map(l => l.trim())
    .filter(Boolean);
  const errors = [];
  const results = [];

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    const parts = lines[i].split("|");
    const type = parts[0]?.trim().toUpperCase();

    if (type === "O") {
      errors.push({ line: lineNum, error: "Sponsors cannot use the O (organization) type" });
      continue;
    }
    if (type !== "D" && type !== "S") {
      errors.push({ line: lineNum, error: "Invalid type — must be D (driver) or S (sponsor user)" });
      continue;
    }

    // Sponsor file format: TYPE|firstName|lastName|email|points|reason  (6 fields, no org column)
    const firstName = parts[1]?.trim();
    const lastName  = parts[2]?.trim();
    const email     = parts[3]?.trim();
    const points    = parts[4]?.trim();
    const reason    = parts[5]?.trim();

    if (!email) {
      errors.push({ line: lineNum, error: "Email is required" });
      continue;
    }
    if (points && !reason) {
      errors.push({ line: lineNum, error: "A reason is required when points are provided" });
      continue;
    }

    // Track whether S type had points (warn but still create)
    let sPointsWarning = null;
    if (type === "S" && points) {
      sPointsWarning = "Sponsor users cannot receive points — user created without points";
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [existingUsers] = await conn.query(
        `SELECT id FROM users WHERE email = ? LIMIT 1`,
        [email]
      );
      let userId;
      if (existingUsers[0]) {
        userId = existingUsers[0].id;
      } else {
        const tempPassword = await bcrypt.hash(Math.random().toString(36) + Date.now(), 10);
        const role = type === "D" ? "DRIVER" : "SPONSOR";
        const [newUser] = await conn.query(
          `INSERT INTO users (email, password_hash, role, points, first_name, last_name)
           VALUES (?, ?, ?, 0, ?, ?)`,
          [email, tempPassword, role, firstName || null, lastName || null]
        );
        userId = newUser.insertId;
      }

      if (type === "D") {
        const [existingDriver] = await conn.query(
          `SELECT id FROM drivers WHERE user_id = ? AND sponsor_id = ? LIMIT 1`,
          [userId, sponsorId]
        );
        if (!existingDriver[0]) {
          await conn.query(
            `INSERT INTO drivers (user_id, sponsor_id, status, joined_on)
             VALUES (?, ?, 'ACTIVE', NOW())
             ON DUPLICATE KEY UPDATE status = 'ACTIVE', joined_on = NOW()`,
            [userId, sponsorId]
          );
        }

        if (points && reason) {
          const pointsInt = parseNonNegativeInt(points);
          if (pointsInt === null) {
            errors.push({ line: lineNum, error: "Invalid points value — must be a non-negative integer" });
            await conn.rollback();
            conn.release();
            continue;
          }
          await conn.query(
            `UPDATE users SET points = points + ? WHERE id = ? LIMIT 1`,
            [pointsInt, userId]
          );
          if (await tableExists("driver_points_history", conn)) {
            await conn.query(
              `INSERT INTO driver_points_history (driver_user_id, points_change, reason, created_at)
               VALUES (?, ?, ?, NOW())`,
              [userId, pointsInt, reason]
            );
          }
        }
      }

      if (type === "S") {
        await conn.query(
          `UPDATE users SET sponsor_id = ? WHERE id = ? AND sponsor_id IS NULL LIMIT 1`,
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
      conn.release();

      const resultEntry = { line: lineNum, email, type, status: "ok" };
      if (sPointsWarning) resultEntry.warning = sPointsWarning;
      results.push(resultEntry);

      if (sPointsWarning) {
        errors.push({ line: lineNum, error: sPointsWarning });
      }
    } catch (err) {
      await conn.rollback();
      conn.release();
      errors.push({ line: lineNum, error: `Database error: ${err.message}` });
    }
  }

  return res.json({ ok: true, processed: results.length, results, errors });

});




module.exports = router;
