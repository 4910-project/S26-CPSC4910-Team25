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

module.exports = router;