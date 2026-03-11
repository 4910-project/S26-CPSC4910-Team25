// POST /api/driver/drop-sponsor
router.post("/drop-sponsor", async (req, res) => {
  if (req.user?.role !== "DRIVER") {
    return res.status(403).json({ ok: false, error: "driver only" });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    await conn.query(
      `UPDATE drivers
       SET status='DROPPED', dropped_at=NOW(), dropped_reason=?
       WHERE user_id=? LIMIT 1`,
      ["Driver dropped sponsor", req.user.id]
    );

    await conn.query(
      "UPDATE users SET sponsor_id=NULL WHERE id=? LIMIT 1",
      [req.user.id]
    );

    await conn.commit();
    res.json({ ok: true });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ ok: false, error: "failed to drop sponsor" });
  } finally {
    conn.release();
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
  const message = String(req.body?.message || "").trim();

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
    return res.json({ ok: true, applications: rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "failed to fetch" });
  }
});

/*
GET /api/driver/status
Returns the current driver status and dropped reason
*/
router.get("/driver/status", async (req, res) => {
  const driverUserId = parsePositiveInt(req.user?.id);
  if (!driverUserId) return res.status(401).json({ ok: false, error: "invalid session" });

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
    return res.json({ ok: true, driver: rows[0] || null });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "failed to fetch driver status" });
  }
});

module.exports = router;