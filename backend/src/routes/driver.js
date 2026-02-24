const express = require("express");
const pool = require("../db");
const requireActiveSession = require("../middleware/requireActiveSession");

const router = express.Router();

function parsePositiveInt(value) {
  const n = Number.parseInt(String(value), 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}

router.use(requireActiveSession);
router.use((req, res, next) => {
  if (req.user?.role !== "DRIVER") {
    return res.status(403).json({ ok: false, error: "driver only" });
  }
  return next();
});

/**
 * GET /driver/my-sponsor
 * Returns the currently active sponsor relationship for the authenticated driver.
 */
router.get("/my-sponsor", async (req, res) => {
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

module.exports = router;
