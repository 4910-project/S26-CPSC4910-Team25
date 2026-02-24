const express = require("express");
const pool = require("../db");
const requireActiveSession = require("../middleware/requireActiveSession");

const router = express.Router();

const APP_STATUSES = new Set(["PENDING", "APPROVED", "REJECTED"]);
const DRIVER_FILTERS = new Set(["ACTIVE", "DROPPED", "PENDING"]);

function parsePositiveInt(value) {
  const n = Number.parseInt(String(value), 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function getSponsorIdFromSession(req) {
  return parsePositiveInt(req.user?.sponsor_id);
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
        contact_phone AS contactPhone
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
        da.applied_at AS appliedAt,
        da.decided_at AS decidedAt
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
 * Body: { action: "approve" | "reject" }
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
      SET status = ?, decided_at = NOW(), decided_by_user_id = ?
      WHERE id = ?
      `,
      [targetStatus, req.user.id, applicationId]
    );

    if (targetStatus === "APPROVED") {
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

      await conn.query(
        "UPDATE users SET sponsor_id = ? WHERE id = ? LIMIT 1",
        [sponsorId, app.driver_user_id]
      );
    }

    const [updatedRows] = await conn.query(
      `
      SELECT
        id AS applicationId,
        driver_user_id AS driverUserId,
        sponsor_id AS sponsorId,
        status,
        applied_at AS appliedAt,
        decided_at AS decidedAt
      FROM driver_applications
      WHERE id = ?
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

  try {
    if (requestedStatusRaw === "PENDING") {
      const [pendingRows] = await pool.query(
        `
        SELECT
          NULL AS driverId,
          SUBSTRING_INDEX(u.email, '@', 1) AS name,
          u.email,
          'pending' AS status,
          NULL AS joinedOn
        FROM driver_applications da
        JOIN users u ON u.id = da.driver_user_id
        WHERE da.sponsor_id = ? AND da.status = 'PENDING'
        ORDER BY da.applied_at DESC
        `,
        [sponsorId]
      );

      return res.json({ drivers: pendingRows });
    }

    if (requestedStatusRaw === "ACTIVE" || requestedStatusRaw === "DROPPED") {
      const [rows] = await pool.query(
        `
        SELECT
          d.id AS driverId,
          SUBSTRING_INDEX(u.email, '@', 1) AS name,
          u.email,
          LOWER(d.status) AS status,
          d.joined_on AS joinedOn
        FROM drivers d
        JOIN users u ON u.id = d.user_id
        WHERE d.sponsor_id = ? AND d.status = ?
        ORDER BY d.id DESC
        `,
        [sponsorId, requestedStatusRaw]
      );

      return res.json({ drivers: rows });
    }

    const [driverRows] = await pool.query(
      `
      SELECT
        d.id AS driverId,
        SUBSTRING_INDEX(u.email, '@', 1) AS name,
        u.email,
        LOWER(d.status) AS status,
        d.joined_on AS joinedOn
      FROM drivers d
      JOIN users u ON u.id = d.user_id
      WHERE d.sponsor_id = ?
      ORDER BY d.id DESC
      `,
      [sponsorId]
    );

    const [pendingRows] = await pool.query(
      `
      SELECT
        NULL AS driverId,
        SUBSTRING_INDEX(u.email, '@', 1) AS name,
        u.email,
        'pending' AS status,
        NULL AS joinedOn
      FROM driver_applications da
      JOIN users u ON u.id = da.driver_user_id
      WHERE da.sponsor_id = ? AND da.status = 'PENDING'
      ORDER BY da.applied_at DESC
      `,
      [sponsorId]
    );

    return res.json({ drivers: driverRows.concat(pendingRows) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "failed to fetch sponsor drivers" });
  }
});

module.exports = router;
