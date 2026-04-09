const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const pool = require("../db");
const auth = require("../middleware/auth"); // JWT middleware
const { lookupCatalogItems } = require("../lib/itunesLookup");

const router = express.Router();
const COMMENT_TEXT_MAX = 500;

let cachedDriverCartSchema = null;

// ── Multer setup for profile photos ──────────────────────────────────────────
const uploadsDir = path.join(__dirname, "../../uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const photoStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `driver-${req.user.id}-${Date.now()}${ext}`);
  },
});

const photoUpload = multer({
  storage: photoStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only image files are allowed"));
  },
});

function parsePositiveInt(value) {
  const n = Number.parseInt(String(value), 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}

async function tableExists(tableName) {
  const [rows] = await pool.query(
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

function toIso(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function escapeCsvCell(value) {
  const raw = String(value ?? "");
  if (/[",\n]/.test(raw)) return `"${raw.replace(/"/g, '""')}"`;
  return raw;
}

function normalizeFriendPair(userA, userB) {
  const first = Math.min(userA, userB);
  const second = Math.max(userA, userB);
  return [first, second];
}

function isCartItemAvailable(item) {
  return Number(item?.is_available ?? 1) !== 0;
}

async function getDriverCartSchema() {
  if (cachedDriverCartSchema) return cachedDriverCartSchema;

  const [rows] = await pool.query(
    `
    SELECT COLUMN_NAME
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'driver_cart'
    `
  );

  const columns = new Set(rows.map((row) => row.COLUMN_NAME));
  const prefersNewNames = columns.has("driver_user_id");

  cachedDriverCartSchema = prefersNewNames
    ? {
        driverColumn: "driver_user_id",
        itemIdColumn: "product_id",
        imageColumn: "artwork_url",
        priceColumn: "points_cost",
        artistColumn: "artist_name",
        kindColumn: "media_type",
      }
    : {
        driverColumn: "driver_id",
        itemIdColumn: "itunes_track_id",
        imageColumn: "product_image_url",
        priceColumn: "price_in_points",
        artistColumn: "artist",
        kindColumn: "kind",
      };

  return cachedDriverCartSchema;
}

async function loadStoredCartRows(driverUserId) {
  const schema = await getDriverCartSchema();
  const [rows] = await pool.query(
    `
    SELECT
      id,
      ${schema.itemIdColumn} AS itunes_track_id,
      product_name,
      ${schema.imageColumn} AS product_image_url,
      ${schema.priceColumn} AS price_in_points,
      ${schema.artistColumn} AS artist,
      ${schema.kindColumn} AS kind,
      added_at,
      is_available,
      availability_message,
      availability_checked_at,
      availability_changed_at,
      availability_notified_at
    FROM driver_cart
    WHERE ${schema.driverColumn} = ?
    ORDER BY added_at DESC
    `,
    [driverUserId]
  );

  return rows;
}

async function refreshDriverCartAvailability(driverUserId) {
  const schema = await getDriverCartSchema();
  const rows = await loadStoredCartRows(driverUserId);
  if (!rows.length) return { cart: [], notifications: [], warning: "" };

  let lookupResults;
  try {
    lookupResults = await lookupCatalogItems(rows.map((row) => row.itunes_track_id));
  } catch (err) {
    console.warn("driver cart availability refresh failed:", err.message);
    return {
      cart: rows,
      notifications: [],
      warning: "Could not refresh cart availability right now.",
    };
  }

  const checkedAt = new Date();
  const notifications = [];

  await Promise.all(
    rows.map(async (row) => {
      const itemId = String(row.itunes_track_id || "");
      const previousMessage = row.availability_message;
      const previousChangedAt = row.availability_changed_at;
      const previousNotifiedAt = row.availability_notified_at;
      const nextAvailable = lookupResults.has(itemId);
      const previousAvailable = isCartItemAvailable(row);
      const nextMessage = nextAvailable
        ? null
        : 'Item unavailable: this catalog item can no longer be purchased.';
      const shouldNotify = !nextAvailable && (previousAvailable || !row.availability_notified_at);

      row.is_available = nextAvailable ? 1 : 0;
      row.availability_message = nextMessage;
      row.availability_checked_at = checkedAt.toISOString();

      if (shouldNotify) {
        row.availability_notified_at = checkedAt.toISOString();
        notifications.push({
          itemId,
          productName: row.product_name,
          message: nextMessage,
        });
      } else if (nextAvailable) {
        row.availability_notified_at = null;
      }

      const changed = previousAvailable !== nextAvailable;
      if (!changed && previousMessage === nextMessage && row.availability_checked_at) {
        await pool.query(
          `UPDATE driver_cart
           SET availability_checked_at = ?
           WHERE id = ? AND ${schema.driverColumn} = ?`,
          [checkedAt, row.id, driverUserId]
        );
        return;
      }

      await pool.query(
        `
        UPDATE driver_cart
        SET is_available = ?,
            availability_message = ?,
            availability_checked_at = ?,
            availability_changed_at = ?,
            availability_notified_at = ?
        WHERE id = ? AND ${schema.driverColumn} = ?
        `,
        [
          nextAvailable ? 1 : 0,
          nextMessage,
          checkedAt,
          changed ? checkedAt : previousChangedAt || null,
          nextAvailable ? null : row.availability_notified_at || previousNotifiedAt || null,
          row.id,
          driverUserId,
        ]
      );
    })
  );

  return { cart: rows, notifications, warning: "" };
}

async function loadPointHistory(driverUserId) {
  const history = [];

  // Add the latest active driver's starting points as the first known earning event.
  const [startRows] = await pool.query(
    `
    SELECT d.joined_on AS occurredAt, d.starting_points AS startingPoints
    FROM drivers d
    WHERE d.user_id = ? AND d.status = 'ACTIVE'
    ORDER BY d.id DESC
    LIMIT 1
    `,
    [driverUserId]
  );
  if (startRows[0]) {
    const occurredAt = toIso(startRows[0].occurredAt);
    const startingPoints = Number(startRows[0].startingPoints || 0);
    if (occurredAt && startingPoints > 0) {
      history.push({
        id: `start-${driverUserId}`,
        occurredAt,
        direction: "EARNED",
        points: startingPoints,
        signedPoints: startingPoints,
        reason: "Starting points assigned",
        source: "starting_points",
      });
    }
  }

  // Preferred source: point_transactions table if present.
  let hasTransactionRows = false;
  if (await tableExists("point_transactions")) {
    try {
      const [txRows] = await pool.query(
        `
        SELECT
          id,
          created_at AS occurredAt,
          amount,
          type,
          reason
        FROM point_transactions
        WHERE user_id = ?
        ORDER BY created_at ASC
        LIMIT 1000
        `,
        [driverUserId]
      );

      txRows.forEach((row) => {
        const occurredAt = toIso(row.occurredAt);
        const signedPoints = Number(row.amount || 0);
        if (!occurredAt || !signedPoints) return;
        hasTransactionRows = true;
        history.push({
          id: `txn-${row.id}`,
          occurredAt,
          direction: signedPoints >= 0 ? "EARNED" : "SPENT",
          points: Math.abs(signedPoints),
          signedPoints,
          reason: row.reason || row.type || "Point transaction",
          source: "point_transactions",
        });
      });
    } catch (err) {
      // Keep endpoint resilient across schema variations.
      console.warn("driver point history: unable to read point_transactions:", err.message);
    }
  }

  // Fallback source: purchases table for spent history if no transaction rows were found.
  if (!hasTransactionRows && (await tableExists("purchases"))) {
    try {
      const [purchaseRows] = await pool.query(
        `
        SELECT
          id,
          purchased_at AS occurredAt,
          cost,
          item_name AS itemName
        FROM purchases
        WHERE user_id = ?
        ORDER BY purchased_at ASC
        LIMIT 1000
        `,
        [driverUserId]
      );

      purchaseRows.forEach((row) => {
        const occurredAt = toIso(row.occurredAt);
        const cost = Number(row.cost || 0);
        if (!occurredAt || cost <= 0) return;
        history.push({
          id: `purchase-${row.id}`,
          occurredAt,
          direction: "SPENT",
          points: cost,
          signedPoints: -cost,
          reason: row.itemName ? `Purchased: ${row.itemName}` : "Purchase",
          source: "purchases",
        });
      });
    } catch (err) {
      console.warn("driver point history: unable to read purchases:", err.message);
    }
  }

  history.sort((a, b) => new Date(a.occurredAt) - new Date(b.occurredAt));
  return history;
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
 * GET /api/driver/point-history
 * Returns timeline-ready point activity events.
 */
router.get("/driver/point-history", async (req, res) => {
  try {
    const userId = parsePositiveInt(req.user?.id);
    if (!userId) return res.status(401).json({ ok: false, error: "invalid user" });

    const history = await loadPointHistory(userId);
    return res.json({ ok: true, history });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "failed to fetch point history" });
  }
});

/**
 * GET /api/driver/point-history.csv
 * Downloads point history as CSV.
 */
router.get("/driver/point-history.csv", async (req, res) => {
  try {
    const userId = parsePositiveInt(req.user?.id);
    if (!userId) return res.status(401).json({ ok: false, error: "invalid user" });

    const history = await loadPointHistory(userId);
    const rows = [
      ["Date", "Type", "Points", "SignedPoints", "Reason", "Source"],
      ...history.map((event) => [
        event.occurredAt,
        event.direction,
        event.points,
        event.signedPoints,
        event.reason,
        event.source,
      ]),
    ];
    const csv = rows.map((row) => row.map(escapeCsvCell).join(",")).join("\n");

    const filename = `point-history-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename=\"${filename}\"`);
    return res.status(200).send(csv);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "failed to export point history csv" });
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
        da.sponsor_id,
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
 * GET /api/driver/friends
 * Returns the current driver's friends plus other active drivers they can add.
 */
router.get("/driver/friends", async (req, res) => {
  const driverUserId = parsePositiveInt(req.user?.id);
  if (!driverUserId) return res.status(401).json({ ok: false, error: "invalid session" });

  try {
    const [friendRows] = await pool.query(
      `
      SELECT
        CASE
          WHEN df.driver_user_id = ? THEN df.friend_user_id
          ELSE df.driver_user_id
        END AS friendUserId,
        SUBSTRING_INDEX(u.email, '@', 1) AS username,
        u.email,
        s.name AS sponsorName,
        d.status AS driverStatus,
        df.created_at AS friendedAt
      FROM driver_friendships df
      JOIN users u
        ON u.id = CASE
          WHEN df.driver_user_id = ? THEN df.friend_user_id
          ELSE df.driver_user_id
        END
      JOIN drivers d ON d.user_id = u.id AND d.status = 'ACTIVE'
      LEFT JOIN sponsors s ON s.id = d.sponsor_id
      WHERE df.driver_user_id = ? OR df.friend_user_id = ?
      ORDER BY username ASC
      `,
      [driverUserId, driverUserId, driverUserId, driverUserId]
    );

    const [availableRows] = await pool.query(
      `
      SELECT
        u.id AS driverUserId,
        SUBSTRING_INDEX(u.email, '@', 1) AS username,
        u.email,
        s.name AS sponsorName
      FROM users u
      JOIN drivers d ON d.user_id = u.id AND d.status = 'ACTIVE'
      LEFT JOIN sponsors s ON s.id = d.sponsor_id
      WHERE UPPER(u.role) = 'DRIVER'
        AND u.id <> ?
        AND NOT EXISTS (
          SELECT 1
          FROM driver_friendships df
          WHERE df.driver_user_id = LEAST(?, u.id)
            AND df.friend_user_id = GREATEST(?, u.id)
        )
      ORDER BY username ASC
      LIMIT 50
      `,
      [driverUserId, driverUserId, driverUserId]
    );

    return res.json({ ok: true, friends: friendRows, availableDrivers: availableRows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "failed to fetch friends" });
  }
});

/**
 * POST /api/driver/friends/:friendUserId
 * Adds another active driver to this driver's friends list.
 */
router.post("/driver/friends/:friendUserId", async (req, res) => {
  const driverUserId = parsePositiveInt(req.user?.id);
  const friendUserId = parsePositiveInt(req.params.friendUserId);
  if (!driverUserId) return res.status(401).json({ ok: false, error: "invalid session" });
  if (!friendUserId) return res.status(400).json({ ok: false, error: "invalid friendUserId" });
  if (driverUserId === friendUserId) {
    return res.status(400).json({ ok: false, error: "you cannot add yourself" });
  }

  try {
    const [candidateRows] = await pool.query(
      `
      SELECT u.id
      FROM users u
      JOIN drivers d ON d.user_id = u.id AND d.status = 'ACTIVE'
      WHERE u.id = ? AND UPPER(u.role) = 'DRIVER'
      LIMIT 1
      `,
      [friendUserId]
    );

    if (!candidateRows[0]) {
      return res.status(404).json({ ok: false, error: "driver not found" });
    }

    const [firstId, secondId] = normalizeFriendPair(driverUserId, friendUserId);
    await pool.query(
      `
      INSERT INTO driver_friendships (driver_user_id, friend_user_id)
      VALUES (?, ?)
      ON DUPLICATE KEY UPDATE created_at = created_at
      `,
      [firstId, secondId]
    );

    return res.json({ ok: true, message: "Friend added successfully" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "failed to add friend" });
  }
});

/**
 * DELETE /api/driver/friends/:friendUserId
 * Removes a driver from this driver's friends list.
 */
router.delete("/driver/friends/:friendUserId", async (req, res) => {
  const driverUserId = parsePositiveInt(req.user?.id);
  const friendUserId = parsePositiveInt(req.params.friendUserId);
  if (!driverUserId) return res.status(401).json({ ok: false, error: "invalid session" });
  if (!friendUserId) return res.status(400).json({ ok: false, error: "invalid friendUserId" });

  const [firstId, secondId] = normalizeFriendPair(driverUserId, friendUserId);

  try {
    await pool.query(
      "DELETE FROM driver_friendships WHERE driver_user_id = ? AND friend_user_id = ?",
      [firstId, secondId]
    );
    return res.json({ ok: true, message: "Friend removed" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "failed to remove friend" });
  }
});

/**
 * GET /api/driver/sponsor-posts
 * Returns sponsor-authored posts that drivers can browse.
 */
router.get("/driver/sponsor-posts", async (req, res) => {
  try {
    const [rows] = await pool.query(
      `
      SELECT
        sp.id AS postId,
        sp.title,
        sp.body,
        sp.created_at AS createdAt,
        sp.updated_at AS updatedAt,
        s.id AS sponsorId,
        s.name AS sponsorName,
        COUNT(c.id) AS commentCount
      FROM sponsor_posts sp
      JOIN sponsors s ON s.id = sp.sponsor_id
      LEFT JOIN sponsor_post_comments c ON c.post_id = sp.id
      WHERE s.status = 'ACTIVE'
      GROUP BY sp.id, sp.title, sp.body, sp.created_at, sp.updated_at, s.id, s.name
      ORDER BY sp.created_at DESC
      `,
    );

    return res.json({ ok: true, posts: rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "failed to fetch sponsor posts" });
  }
});

/**
 * GET /api/driver/sponsor-posts/:postId/comments
 * Returns comments for a sponsor post.
 */
router.get("/driver/sponsor-posts/:postId/comments", async (req, res) => {
  const postId = parsePositiveInt(req.params.postId);
  if (!postId) return res.status(400).json({ ok: false, error: "invalid postId" });

  try {
    const [postRows] = await pool.query(
      `
      SELECT sp.id
      FROM sponsor_posts sp
      JOIN sponsors s ON s.id = sp.sponsor_id
      WHERE sp.id = ? AND s.status = 'ACTIVE'
      LIMIT 1
      `,
      [postId]
    );
    if (!postRows[0]) return res.status(404).json({ ok: false, error: "post not found" });

    const [rows] = await pool.query(
      `
      SELECT
        c.id AS commentId,
        c.comment_text AS commentText,
        c.created_at AS createdAt,
        c.updated_at AS updatedAt,
        u.id AS driverUserId,
        SUBSTRING_INDEX(u.email, '@', 1) AS driverName,
        u.email AS driverEmail
      FROM sponsor_post_comments c
      JOIN users u ON u.id = c.driver_user_id
      WHERE c.post_id = ?
      ORDER BY c.created_at ASC
      `,
      [postId]
    );

    return res.json({ ok: true, comments: rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "failed to fetch comments" });
  }
});

/**
 * POST /api/driver/sponsor-posts/:postId/comments
 * Body: { commentText }
 * Adds a new driver comment to a sponsor post.
 */
router.post("/driver/sponsor-posts/:postId/comments", async (req, res) => {
  const driverUserId = parsePositiveInt(req.user?.id);
  const postId = parsePositiveInt(req.params.postId);
  if (!driverUserId) return res.status(401).json({ ok: false, error: "invalid session" });
  if (!postId) return res.status(400).json({ ok: false, error: "invalid postId" });

  const commentText = String(req.body?.commentText || "").trim();
  if (!commentText) {
    return res.status(400).json({ ok: false, error: "commentText is required" });
  }
  if (commentText.length > COMMENT_TEXT_MAX) {
    return res.status(400).json({ ok: false, error: `commentText must be ${COMMENT_TEXT_MAX} characters or fewer` });
  }

  try {
    const [postRows] = await pool.query(
      `
      SELECT sp.id
      FROM sponsor_posts sp
      JOIN sponsors s ON s.id = sp.sponsor_id
      WHERE sp.id = ? AND s.status = 'ACTIVE'
      LIMIT 1
      `,
      [postId]
    );
    if (!postRows[0]) return res.status(404).json({ ok: false, error: "post not found" });

    const [result] = await pool.query(
      `
      INSERT INTO sponsor_post_comments (post_id, driver_user_id, comment_text)
      VALUES (?, ?, ?)
      `,
      [postId, driverUserId, commentText]
    );

    const [rows] = await pool.query(
      `
      SELECT
        c.id AS commentId,
        c.comment_text AS commentText,
        c.created_at AS createdAt,
        c.updated_at AS updatedAt,
        u.id AS driverUserId,
        SUBSTRING_INDEX(u.email, '@', 1) AS driverName,
        u.email AS driverEmail
      FROM sponsor_post_comments c
      JOIN users u ON u.id = c.driver_user_id
      WHERE c.id = ?
      LIMIT 1
      `,
      [result.insertId]
    );

    return res.status(201).json({
      ok: true,
      message: "Comment posted successfully",
      comment: rows[0],
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "failed to add comment" });
  }
});

/**
 * GET /api/driver/catalog/hidden
 * Returns the set of product IDs hidden by this driver's active sponsor.
 */
router.get("/driver/catalog/hidden", async (req, res) => {
  const driverUserId = parsePositiveInt(req.user?.id);
  if (!driverUserId) return res.status(401).json({ ok: false, error: "invalid session" });

  try {
    // Find the driver's active sponsor
    const [dRows] = await pool.query(
      "SELECT sponsor_id FROM drivers WHERE user_id = ? AND status = 'ACTIVE' ORDER BY id DESC LIMIT 1",
      [driverUserId]
    );
    if (!dRows[0]) return res.json({ ok: true, hiddenIds: [] });

    const sponsorId = dRows[0].sponsor_id;
    const [rows] = await pool.query(
      "SELECT product_id FROM sponsor_hidden_products WHERE sponsor_id = ?",
      [sponsorId]
    );
    return res.json({ ok: true, hiddenIds: rows.map((r) => r.product_id) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "failed to fetch hidden products" });
  }
});

/**
 * GET /api/driver/cart
 * Returns all cart items for the authenticated driver.
 */
router.get("/driver/cart", async (req, res) => {
  const userId = parsePositiveInt(req.user?.id);
  if (!userId) return res.status(401).json({ ok: false, error: "invalid session" });

  try {
    const { cart, notifications, warning } = await refreshDriverCartAvailability(userId);
    return res.json({ ok: true, cart, notifications, warning });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Failed to fetch cart" });
  }
});

/**
 * POST /api/driver/cart/recheck-availability
 * Forces a fresh availability check against the external catalog API.
 */
router.post("/driver/cart/recheck-availability", async (req, res) => {
  const userId = parsePositiveInt(req.user?.id);
  if (!userId) return res.status(401).json({ ok: false, error: "invalid session" });

  try {
    const { cart, notifications, warning } = await refreshDriverCartAvailability(userId);
    return res.json({ ok: true, cart, notifications, warning });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Failed to recheck cart availability" });
  }
});

/**
 * POST /api/driver/cart
 * Body: { itunes_track_id, product_name, product_image_url, price_in_points, artist, kind }
 * Adds an item; silently no-ops on duplicate (returns existing row id).
 */
router.post("/driver/cart", async (req, res) => {
  const userId = parsePositiveInt(req.user?.id);
  if (!userId) return res.status(401).json({ ok: false, error: "invalid session" });

  const { itunes_track_id, product_name, product_image_url, price_in_points, artist, kind } = req.body || {};
  if (!itunes_track_id || !product_name) {
    return res.status(400).json({ ok: false, error: "itunes_track_id and product_name are required" });
  }

  try {
    const schema = await getDriverCartSchema();
    await pool.query(
      `
      INSERT INTO driver_cart (
        ${schema.driverColumn},
        ${schema.itemIdColumn},
        product_name,
        ${schema.imageColumn},
        ${schema.priceColumn},
        ${schema.artistColumn},
        ${schema.kindColumn},
        is_available,
        availability_message,
        availability_checked_at,
        availability_changed_at,
        availability_notified_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, NULL, NOW(), NULL, NULL)
      ON DUPLICATE KEY UPDATE id = id
      `,
      [
        userId,
        String(itunes_track_id),
        String(product_name),
        product_image_url || null,
        Number(price_in_points) || 0,
        artist || null,
        kind || null,
      ]
    );
    const [rows] = await pool.query(
      `
      SELECT id
      FROM driver_cart
      WHERE ${schema.driverColumn} = ? AND ${schema.itemIdColumn} = ?
      LIMIT 1
      `,
      [userId, String(itunes_track_id)]
    );
    return res.json({ ok: true, id: rows[0]?.id });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Failed to add to cart" });
  }
});

/**
 * DELETE /api/driver/cart/:itemId
 * Removes a cart item by its row id (must belong to the authenticated driver).
 */
router.delete("/driver/cart/:itemId", async (req, res) => {
  const userId = parsePositiveInt(req.user?.id);
  if (!userId) return res.status(401).json({ ok: false, error: "invalid session" });

  const itemId = parsePositiveInt(req.params.itemId);
  if (!itemId) return res.status(400).json({ ok: false, error: "invalid itemId" });

  try {
    const schema = await getDriverCartSchema();
    await pool.query(
      `DELETE FROM driver_cart WHERE id = ? AND ${schema.driverColumn} = ?`,
      [itemId, userId]
    );
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Failed to remove from cart" });
  }
});

/**
 * GET /api/driver/wishlist
 * Returns all wishlist items for the authenticated driver.
 */
router.get("/driver/wishlist", async (req, res) => {
  const userId = parsePositiveInt(req.user?.id);
  if (!userId) return res.status(401).json({ ok: false, error: "invalid session" });

  try {
    const [rows] = await pool.query(
      `SELECT id, itunes_track_id, product_name, product_image_url, price_in_points, added_at
       FROM driver_wishlist WHERE driver_id = ? ORDER BY added_at DESC`,
      [userId]
    );
    return res.json({ ok: true, wishlist: rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Failed to fetch wishlist" });
  }
});

/**
 * POST /api/driver/wishlist
 * Body: { itunes_track_id, product_name, product_image_url, price_in_points }
 * Adds an item; silently no-ops if already wishlisted (returns existing row id).
 */
router.post("/driver/wishlist", async (req, res) => {
  const userId = parsePositiveInt(req.user?.id);
  if (!userId) return res.status(401).json({ ok: false, error: "invalid session" });

  const { itunes_track_id, product_name, product_image_url, price_in_points } = req.body || {};
  if (!itunes_track_id || !product_name) {
    return res.status(400).json({ ok: false, error: "itunes_track_id and product_name are required" });
  }

  try {
    await pool.query(
      `INSERT INTO driver_wishlist (driver_id, itunes_track_id, product_name, product_image_url, price_in_points)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE id = id`,
      [userId, String(itunes_track_id), String(product_name), product_image_url || null, Number(price_in_points) || 0]
    );
    const [rows] = await pool.query(
      "SELECT id FROM driver_wishlist WHERE driver_id = ? AND itunes_track_id = ? LIMIT 1",
      [userId, String(itunes_track_id)]
    );
    return res.json({ ok: true, id: rows[0]?.id });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Failed to add to wishlist" });
  }
});

/**
 * DELETE /api/driver/wishlist/:itemId
 * Removes a wishlist item by its row id (must belong to the authenticated driver).
 */
router.delete("/driver/wishlist/:itemId", async (req, res) => {
  const userId = parsePositiveInt(req.user?.id);
  if (!userId) return res.status(401).json({ ok: false, error: "invalid session" });

  const itemId = parsePositiveInt(req.params.itemId);
  if (!itemId) return res.status(400).json({ ok: false, error: "invalid itemId" });

  try {
    await pool.query(
      "DELETE FROM driver_wishlist WHERE id = ? AND driver_id = ?",
      [itemId, userId]
    );
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Failed to remove from wishlist" });
  }
});

/**
 * GET /api/driver/photo
 * Returns the current profile photo URL for the authenticated driver.
 */
router.get("/driver/photo", async (req, res) => {
  const userId = parsePositiveInt(req.user?.id);
  if (!userId) return res.status(401).json({ ok: false, error: "invalid session" });

  try {
    const [rows] = await pool.query(
      "SELECT profile_photo_url FROM users WHERE id = ? LIMIT 1",
      [userId]
    );
    if (!rows.length) return res.status(404).json({ ok: false, error: "User not found" });
    return res.json({ ok: true, photoUrl: rows[0].profile_photo_url || null });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Failed to fetch photo" });
  }
});

/**
 * POST /api/driver/photo
 * Uploads a new profile photo for the authenticated driver.
 * Expects multipart/form-data with field name "photo".
 */
router.post("/driver/photo", (req, res, next) => {
  photoUpload.single("photo")(req, res, (err) => {
    if (err) {
      const msg = err.code === "LIMIT_FILE_SIZE"
        ? "File size must be under 5MB"
        : err.message || "Upload failed";
      return res.status(400).json({ ok: false, error: msg });
    }
    next();
  });
}, async (req, res) => {
  const userId = parsePositiveInt(req.user?.id);
  if (!userId) return res.status(401).json({ ok: false, error: "invalid session" });
  if (!req.file) return res.status(400).json({ ok: false, error: "No file uploaded" });

  const photoUrl = `/uploads/${req.file.filename}`;
  try {
    await pool.query(
      "UPDATE users SET profile_photo_url = ? WHERE id = ? LIMIT 1",
      [photoUrl, userId]
    );
    return res.json({ ok: true, photoUrl });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Failed to save photo" });
  }
});

module.exports = router;
