const express = require("express");
const pool = require("../db");
const requireActiveSession = require("../middleware/requireActiveSession");

const router = express.Router();

const APP_STATUSES = new Set(["PENDING", "APPROVED", "REJECTED"]);
const DRIVER_FILTERS = new Set(["ACTIVE", "DROPPED", "PENDING"]);
const DECISION_MESSAGE_MAX = 500;

function parsePositiveInt(value) {
  const n = Number.parseInt(String(value), 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function parseNonNegativeInt(value) {
  const n = Number.parseInt(String(value), 10);
  return Number.isInteger(n) && n >= 0 ? n : null;
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
          SUBSTRING_INDEX(u.email, '@', 1) AS name,
          u.email,
          'pending' AS status,
          NULL AS joinedOn,
          NULL AS startingPoints
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

    if (requestedStatusRaw === "ACTIVE" || requestedStatusRaw === "DROPPED") {
      const [rows] = await pool.query(
        `
        SELECT
          d.id AS driverId,
          SUBSTRING_INDEX(u.email, '@', 1) AS name,
          u.email,
          LOWER(d.status) AS status,
          d.joined_on AS joinedOn,
          d.starting_points AS startingPoints
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
        SUBSTRING_INDEX(u.email, '@', 1) AS name,
        u.email,
        LOWER(d.status) AS status,
        d.joined_on AS joinedOn,
        d.starting_points AS startingPoints
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
        SUBSTRING_INDEX(u.email, '@', 1) AS name,
        u.email,
        'pending' AS status,
        NULL AS joinedOn,
        NULL AS startingPoints
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
        SUBSTRING_INDEX(u.email, '@', 1) AS name,
        u.email,
        LOWER(d.status) AS status,
        d.joined_on AS joinedOn,
        d.starting_points AS startingPoints
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
 * GET /sponsor/catalog/hidden
 * Returns all hidden products with their stored details.
 */
router.get("/catalog/hidden", async (req, res) => {
  try {
    const sponsorId = getSponsorIdFromSession(req);
    if (!sponsorId) return res.status(400).json({ ok: false, error: "sponsor account is not linked" });

    const [rows] = await pool.query(
      `SELECT product_id, product_name, artist_name, artwork_url, price
       FROM sponsor_hidden_products WHERE sponsor_id = ?`,
      [sponsorId]
    );
    return res.json({
      ok: true,
      hiddenIds: rows.map(r => r.product_id),
      hiddenProducts: rows,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "failed to fetch hidden products" });
  }
});

/**
 * POST /sponsor/catalog/hide
 * Body: { productId, productName, artistName, artworkUrl, price }
 */
router.post("/catalog/hide", async (req, res) => {
  try {
    const sponsorId = getSponsorIdFromSession(req);
    if (!sponsorId) return res.status(400).json({ ok: false, error: "sponsor account is not linked" });

    const productId   = String(req.body?.productId   || "").trim();
    const productName = String(req.body?.productName  || "").trim() || null;
    const artistName  = String(req.body?.artistName   || "").trim() || null;
    const artworkUrl  = String(req.body?.artworkUrl   || "").trim() || null;
    const price       = req.body?.price != null ? parseFloat(req.body.price) : null;

    if (!productId) return res.status(400).json({ ok: false, error: "productId required" });

    await pool.query(
      `INSERT INTO sponsor_hidden_products (sponsor_id, product_id, product_name, artist_name, artwork_url, price)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         product_name = VALUES(product_name),
         artist_name  = VALUES(artist_name),
         artwork_url  = VALUES(artwork_url),
         price        = VALUES(price),
         hidden_at    = CURRENT_TIMESTAMP`,
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
 * Body: { productId: string }
 */
router.post("/catalog/unhide", async (req, res) => {
  try {
    const sponsorId = getSponsorIdFromSession(req);
    if (!sponsorId) return res.status(400).json({ ok: false, error: "sponsor account is not linked" });

    const productId = String(req.body?.productId || "").trim();
    if (!productId) return res.status(400).json({ ok: false, error: "productId required" });

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

module.exports = router;