const express = require("express");
const pool = require("../db");
const auth = require("../middleware/auth"); // JWT middleware

const router = express.Router();

function parsePositiveInt(value) {
  const n = Number.parseInt(String(value), 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// Require JWT + driver role for all driver routes in this file
router.use(auth);
router.use((req, res, next) => {
  if (req.user?.role !== "DRIVER") {
    return res.status(403).json({ ok: false, error: "driver only" });
  }
  next();
});

/**
 * GET /api/driver/points
 * Returns current points for the authenticated driver.
 */
router.get("/driver/points", async (req, res) => {
  try {
    // Your JWT middleware sets: req.user = { id: payload.userId, role: payload.role }
    const userId = parsePositiveInt(req.user?.id);
    if (!userId) return res.status(401).json({ ok: false, error: "invalid user" });

    // If your points are stored somewhere else later, swap this query
    const [rows] = await pool.query(
      "SELECT points FROM users WHERE id = ? LIMIT 1",
      [userId]
    );

    if (!rows.length) return res.status(404).json({ ok: false, error: "User not found" });

    return res.json({ points: rows[0].points ?? 0 });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

/**
 * GET /api/driver/my-sponsor
 * Returns the currently active sponsor relationship for the authenticated driver.
 */
router.get("/driver/my-sponsor", async (req, res) => {
  const driverUserId = parsePositiveInt(req.user?.id);
  if (!driverUserId) {
    return res.status(401).json({ ok: false, error: "invalid session user" });
  }

  try {
    const [rows] = await pool.query(
      `
      SELECT
        d.sponsor_id AS sponsorId,
        s.name AS sponsorName,
        s.status AS sponsorStatus,
        d.joined_on AS joinedOn
      FROM drivers d
      JOIN sponsors s ON s.id = d.sponsor_id
      WHERE d.user_id = ? AND d.status = 'ACTIVE'
      ORDER BY d.id DESC
      LIMIT 1
      `,
      [driverUserId]
    );

    if (!rows[0]) {
      return res.status(404).json({ ok: false, error: "active sponsor not found" });
    }

    return res.json(rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "failed to fetch current sponsor" });
  }
});

/**
 * GET /api/driver/sponsors
 * Returns all active sponsors with their details + this driver's review if any.
 */
router.get("/driver/sponsors", async (req, res) => {
  const driverUserId = parsePositiveInt(req.user?.id);
  if (!driverUserId) return res.status(401).json({ ok: false, error: "invalid session" });

  try {
    const [rows] = await pool.query(
      `SELECT
         s.id          AS sponsorId,
         s.name        AS sponsorName,
         s.address,
         s.contact_name  AS contactName,
         s.contact_email AS contactEmail,
         s.contact_phone AS contactPhone,
         sr.rating     AS myRating,
         sr.comment    AS myComment
       FROM sponsors s
       LEFT JOIN sponsor_reviews sr
         ON sr.sponsor_id = s.id AND sr.driver_user_id = ?
       WHERE s.status = 'ACTIVE'
       ORDER BY s.name ASC`,
      [driverUserId]
    );
    return res.json({ ok: true, sponsors: rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "failed to fetch sponsors" });
  }
});

/**
 * POST /api/driver/sponsors/:sponsorId/review
 * Body: { rating: 1-5, comment?: string }
 * Upserts a review for a sponsor.
 */
router.post("/driver/sponsors/:sponsorId/review", async (req, res) => {
  const driverUserId = parsePositiveInt(req.user?.id);
  if (!driverUserId) return res.status(401).json({ ok: false, error: "invalid session" });

  const sponsorId = parsePositiveInt(req.params.sponsorId);
  if (!sponsorId) return res.status(400).json({ ok: false, error: "invalid sponsorId" });

  const rating = Number(req.body?.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return res.status(400).json({ ok: false, error: "rating must be an integer between 1 and 5" });
  }

  const comment = req.body?.comment ? String(req.body.comment).trim() : null;

  try {
    // Verify sponsor exists
    const [sRows] = await pool.query(
      "SELECT id FROM sponsors WHERE id = ? AND status = 'ACTIVE' LIMIT 1",
      [sponsorId]
    );
    if (!sRows[0]) return res.status(404).json({ ok: false, error: "sponsor not found" });

    await pool.query(
      `INSERT INTO sponsor_reviews (driver_user_id, sponsor_id, rating, comment)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE rating = VALUES(rating), comment = VALUES(comment), updated_at = NOW()`,
      [driverUserId, sponsorId, rating, comment]
    );

    return res.json({ ok: true, message: "Review saved" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "failed to save review" });
  }
});

/**
 * POST /api/driver/feedback
 * Body: { category, message }
 * Submit feedback from the driver.
 */
router.post("/driver/feedback", async (req, res) => {
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

/*
GET /api/driver/applications
Returns all applications submitted by the driver
*/
router.get("/driver/applications", async (req, res) => {
  const driverUserId = parsePositiveInt(req.user?.id);
  if (!driverUserId) {
    return res.status(401).json({ ok: false, error: "invalid session" });
  }

  try {
    const [rows] = await pool.query(
      `
      SELECT
        da.id AS applicationId,
        s.name AS sponsorName,
        da.status,
        da.decision_message AS decisionMessage,
        da.decided_at AS decidedAt
      FROM driver_applications da
      JOIN sponsors s ON s.id = da.sponsor_id
      WHERE da.driver_user_id = ?
      ORDER BY da.applied_at DESC
      `,
      [driverUserId]
    );
    return res.json({ ok: true, applicarions: rows });
  } catch(err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "failed to fetch"});
  }
});

/*
GET /api/driver/status
Returns the current driver status and dropped reason
*/
router.get("/driver/status", async (req, res) => {
  const driverUserId = parsePositiveInt(req.user?.id);
  if (!driverUserId) return res.status(401).json({ ok: false, error: "invalid session"});

  try {
    const [rows] = await pool.query(
      `
      SELECT
        d.status,
        d.dropped_reason,
        s.name AS sponsorName
      FROM drivers d
      JOIN sponsors s ON s.id = d.sponsor_id
      WHERE d.user_id = ?
      ORDER BY d.id DESC
      LIMIT 1
      `,
      [driverUserId]
    );
    return res.json({ ok: true, driver: rows[0] || null});
  } catch (err) {
    return res.status(500).json({ ok: false, error: "failed to fetch driver status"});
  }
});


/**
 * GET /api/driver/catalog/hidden
 * Returns the set of product IDs hidden by the driver's active sponsor.
 * Used by the Catalogue page to filter out products the sponsor doesn't want shown.
 */
router.get("/driver/catalog/hidden", async (req, res) => {
  const driverUserId = parsePositiveInt(req.user?.id);
  if (!driverUserId) return res.status(401).json({ ok: false, error: "invalid session" });

  try {
    const [driverRows] = await pool.query(
      `SELECT d.sponsor_id FROM drivers d
       WHERE d.user_id = ? AND d.status = 'ACTIVE'
       ORDER BY d.id DESC LIMIT 1`,
      [driverUserId]
    );

    if (!driverRows[0]) {
      return res.json({ ok: true, hiddenIds: [] });
    }

    const sponsorId = driverRows[0].sponsor_id;
    const [rows] = await pool.query(
      "SELECT product_id FROM sponsor_hidden_products WHERE sponsor_id = ?",
      [sponsorId]
    );

    return res.json({ ok: true, hiddenIds: rows.map(r => r.product_id) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "failed to fetch hidden products" });
  }
});

module.exports = router;