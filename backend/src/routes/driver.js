const express = require("express");
const router = express.Router();
const pool = require("../db");
const requireActiveSession = require("../middleware/requireActiveSession");

function parsePositiveInt(value) {
  const n = Number.parseInt(String(value), 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// ─────────────────────────────────────────────────────────────
// Require auth + DRIVER role
// ─────────────────────────────────────────────────────────────
router.use(requireActiveSession);
router.use((req, res, next) => {
  if (req.user?.role !== "DRIVER") {
    return res.status(403).json({ ok: false, error: "driver only" });
  }
  next();
});

// ─────────────────────────────────────────────────────────────
// Helper functions 
// ─────────────────────────────────────────────────────────────
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

async function loadPointHistory(driverUserId) {
  const history = [];

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
      });
    }
  }

  if (await tableExists("point_transactions")) {
    const [txRows] = await pool.query(
      `
      SELECT id, created_at AS occurredAt, amount, reason
      FROM point_transactions
      WHERE user_id = ?
      ORDER BY created_at ASC
      `,
      [driverUserId]
    );

    txRows.forEach((row) => {
      const occurredAt = toIso(row.occurredAt);
      const signedPoints = Number(row.amount || 0);
      if (!occurredAt || !signedPoints) return;

      history.push({
        id: `txn-${row.id}`,
        occurredAt,
        direction: signedPoints >= 0 ? "EARNED" : "SPENT",
        points: Math.abs(signedPoints),
        signedPoints,
        reason: row.reason || "Transaction",
      });
    });
  }

  history.sort((a, b) => new Date(a.occurredAt) - new Date(b.occurredAt));
  return history;
}

// ─────────────────────────────────────────────────────────────
// Drop Sponsor
// ─────────────────────────────────────────────────────────────
router.post("/drop-sponsor", async (req, res) => {
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

// ─────────────────────────────────────────────────────────────
// Sponsors list
// ─────────────────────────────────────────────────────────────
router.get("/sponsors", async (req, res) => {
  const driverUserId = parsePositiveInt(req.user?.id);
  if (!driverUserId) return res.status(401).json({ ok: false });

  const [rows] = await pool.query(
    `SELECT s.id AS sponsorId, s.name AS sponsorName
     FROM sponsors s WHERE s.status='ACTIVE'`
  );

  res.json({ ok: true, sponsors: rows });
});

// ─────────────────────────────────────────────────────────────
// Notification settings
// ─────────────────────────────────────────────────────────────
router.get("/notification-settings", async (req, res) => {
  try {
    const [rows] = await pool.query(
      `
      SELECT
        notify_points_added,
        notify_points_removed,
        notify_order_placed,
        notify_login
      FROM users
      WHERE id = ?
      LIMIT 1
      `,
      [req.user.id]
    );

    const user = rows[0] || {};

    res.json({
      notify_points_added: !!user.notify_points_added,
      notify_points_removed: !!user.notify_points_removed,
      notify_order_placed:
        user.notify_order_placed === undefined ? true : !!user.notify_order_placed,
      notify_login:
        user.notify_login === undefined ? true : !!user.notify_login,
    });
  } catch (err) {
    console.error("Failed to load notification settings:", err);
    res.status(500).json({ ok: false, error: "failed to load notification settings" });
  }
});

router.patch("/notification-settings", async (req, res) => {
  try {
    const [currentRows] = await pool.query(
      `
      SELECT
        notify_points_added,
        notify_points_removed,
        notify_order_placed,
        notify_login
      FROM users
      WHERE id = ?
      LIMIT 1
      `,
      [req.user.id]
    );

    const current = currentRows[0];
    if (!current) {
      return res.status(404).json({ ok: false, error: "user not found" });
    }

    const notifyPointsAdded =
      req.body.notify_points_added === undefined
        ? !!current.notify_points_added
        : !!req.body.notify_points_added;

    const notifyPointsRemoved =
      req.body.notify_points_removed === undefined
        ? !!current.notify_points_removed
        : !!req.body.notify_points_removed;

    const notifyOrderPlaced =
      req.body.notify_order_placed === undefined
        ? !!current.notify_order_placed
        : !!req.body.notify_order_placed;

    const notifyLogin =
      req.body.notify_login === undefined
        ? !!current.notify_login
        : !!req.body.notify_login;

    await pool.query(
      `
      UPDATE users
      SET
        notify_points_added = ?,
        notify_points_removed = ?,
        notify_order_placed = ?,
        notify_login = ?
      WHERE id = ?
      `,
      [
        notifyPointsAdded ? 1 : 0,
        notifyPointsRemoved ? 1 : 0,
        notifyOrderPlaced ? 1 : 0,
        notifyLogin ? 1 : 0,
        req.user.id,
      ]
    );

    res.json({
      ok: true,
      notify_points_added: notifyPointsAdded,
      notify_points_removed: notifyPointsRemoved,
      notify_order_placed: notifyOrderPlaced,
      notify_login: notifyLogin,
    });
  } catch (err) {
    console.error("Failed to update notification settings:", err);
    res.status(500).json({ ok: false, error: "failed to update notification settings" });
  }
});

// ─────────────────────────────────────────────────────────────
// Points expiration
// ─────────────────────────────────────────────────────────────
router.get("/points-expiration-policy", async (req, res) => {
  const [rows] = await pool.query(
    `
    SELECT s.points_expire_days
    FROM users u
    LEFT JOIN sponsors s ON s.id = u.sponsor_id
    WHERE u.id = ?
    `,
    [req.user.id]
  );

  res.json({
    points_expire_days: rows[0]?.points_expire_days ?? null,
  });
});

// ─────────────────────────────────────────────────────────────
// Point history
// ─────────────────────────────────────────────────────────────
router.get("/point-history", async (req, res) => {
  const history = await loadPointHistory(req.user.id);
  res.json({ ok: true, history });
});

router.get("/point-history.csv", async (req, res) => {
  const history = await loadPointHistory(req.user.id);

  const csv = [
    ["Date", "Type", "Points", "Reason"],
    ...history.map((h) => [
      h.occurredAt,
      h.direction,
      h.points,
      h.reason,
    ]),
  ]
    .map((row) => row.join(","))
    .join("\n");

  res.header("Content-Type", "text/csv");
  res.attachment("points.csv");
  res.send(csv);
});

// ─────────────────────────────────────────────────────────────
// Driver orders / purchases
// Assumes tables:
//   orders(id, driver_id, catalog_item_id, quantity, total_points, status, created_at)
//   catalog_items(id, name, stock)
//   users(id, points)
// Change table/column names if your schema differs.
// ─────────────────────────────────────────────────────────────
router.get("/orders", async (req, res) => {
  try {
    const [rows] = await pool.query(
      `
      SELECT
        o.id,
        o.quantity,
        o.total_points,
        o.status,
        o.created_at,
        c.name AS item_name
      FROM orders o
      LEFT JOIN catalog_items c ON c.id = o.catalog_item_id
      WHERE o.driver_id = ?
      ORDER BY o.created_at DESC, o.id DESC
      `,
      [req.user.id]
    );

    return res.json({ ok: true, orders: rows });
  } catch (err) {
    console.error("Failed to load driver orders:", err);
    return res.status(500).json({ ok: false, error: "failed to load orders" });
  }
});

router.patch("/orders/:orderId/cancel", async (req, res) => {
  const orderId = parsePositiveInt(req.params.orderId);
  if (!orderId) {
    return res.status(400).json({ ok: false, error: "invalid order id" });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [orderRows] = await conn.query(
      `
      SELECT
        o.id,
        o.driver_id,
        o.catalog_item_id,
        o.quantity,
        o.total_points,
        o.status,
        c.name AS item_name
      FROM orders o
      LEFT JOIN catalog_items c ON c.id = o.catalog_item_id
      WHERE o.id = ?
      LIMIT 1
      `,
      [orderId]
    );

    const order = orderRows[0];
    if (!order) {
      await conn.rollback();
      return res.status(404).json({ ok: false, error: "order not found" });
    }

    if (Number(order.driver_id) !== Number(req.user.id)) {
      await conn.rollback();
      return res.status(403).json({ ok: false, error: "not your order" });
    }

    const cancellableStatuses = ["PLACED", "PENDING"];
    if (!cancellableStatuses.includes(String(order.status || "").toUpperCase())) {
      await conn.rollback();
      return res.status(400).json({
        ok: false,
        error: "this purchase can no longer be canceled",
      });
    }

    await conn.query(
      `
      UPDATE orders
      SET status = 'CANCELLED'
      WHERE id = ?
      LIMIT 1
      `,
      [orderId]
    );

    await conn.query(
      `
      UPDATE users
      SET points = COALESCE(points, 0) + ?
      WHERE id = ?
      LIMIT 1
      `,
      [Number(order.total_points || 0), req.user.id]
    );

    if (order.catalog_item_id) {
      await conn.query(
        `
        UPDATE catalog_items
        SET stock = COALESCE(stock, 0) + ?
        WHERE id = ?
        LIMIT 1
        `,
        [Number(order.quantity || 0), order.catalog_item_id]
      );
    }

    if (await tableExists("point_transactions")) {
      await conn.query(
        `
        INSERT INTO point_transactions (user_id, amount, reason, created_at)
        VALUES (?, ?, ?, NOW())
        `,
        [
          req.user.id,
          Number(order.total_points || 0),
          `Refund for cancelled purchase${order.item_name ? `: ${order.item_name}` : ""}`,
        ]
      );
    }

    await conn.commit();

    return res.json({
      ok: true,
      message: "purchase cancelled successfully",
      refunded_points: Number(order.total_points || 0),
    });
  } catch (err) {
    await conn.rollback();
    console.error("Failed to cancel purchase:", err);
    return res.status(500).json({ ok: false, error: "failed to cancel purchase" });
  } finally {
    conn.release();
  }
});

// ─────────────────────────────────────────────────────────────
// Text size preference
// ─────────────────────────────────────────────────────────────
router.get("/text-size", async (req, res) => {
  try {
    const [rows] = await pool.query(
      `
      SELECT text_size
      FROM users
      WHERE id = ?
      LIMIT 1
      `,
      [req.user.id]
    );

    return res.json({
      ok: true,
      text_size: rows[0]?.text_size || "medium",
    });
  } catch (err) {
    console.error("Failed to load text size:", err);
    return res.status(500).json({ ok: false, error: "failed to load text size" });
  }
});

// ─────────────────────────────────────────────────────────────
// Driver goals and progress
// ─────────────────────────────────────────────────────────────
router.get("/goals", async (req, res) => {
  try {
    const driverUserId = req.user.id;

    const [goalRows] = await pool.query(
      `
      SELECT monthly_goal, yearly_goal
      FROM driver_goals
      WHERE driver_user_id = ?
      LIMIT 1
      `,
      [driverUserId]
    );

    const goal = goalRows[0] || {
      monthly_goal: 0,
      yearly_goal: 0,
    };

    const [monthlyRows] = await pool.query(
      `
      SELECT COALESCE(SUM(amount), 0) AS monthly_points
      FROM point_transactions
      WHERE user_id = ?
        AND amount > 0
        AND YEAR(created_at) = YEAR(CURDATE())
        AND MONTH(created_at) = MONTH(CURDATE())
      `,
      [driverUserId]
    );

    const [yearlyRows] = await pool.query(
      `
      SELECT COALESCE(SUM(amount), 0) AS yearly_points
      FROM point_transactions
      WHERE user_id = ?
        AND amount > 0
        AND YEAR(created_at) = YEAR(CURDATE())
      `,
      [driverUserId]
    );

    const monthlyPoints = Number(monthlyRows[0]?.monthly_points || 0);
    const yearlyPoints = Number(yearlyRows[0]?.yearly_points || 0);

    const monthlyGoal = Number(goal.monthly_goal || 0);
    const yearlyGoal = Number(goal.yearly_goal || 0);

    return res.json({
      ok: true,
      monthly_goal: monthlyGoal,
      yearly_goal: yearlyGoal,
      monthly_points: monthlyPoints,
      yearly_points: yearlyPoints,
      monthly_progress_percent:
        monthlyGoal > 0 ? Math.min(100, Math.round((monthlyPoints / monthlyGoal) * 100)) : 0,
      yearly_progress_percent:
        yearlyGoal > 0 ? Math.min(100, Math.round((yearlyPoints / yearlyGoal) * 100)) : 0,
    });
  } catch (err) {
    console.error("Failed to load goals:", err);
    return res.status(500).json({ ok: false, error: "failed to load goals" });
  }
});

router.patch("/goals", async (req, res) => {
  try {
    const driverUserId = req.user.id;
    const monthlyGoal = Number(req.body.monthly_goal);
    const yearlyGoal = Number(req.body.yearly_goal);

    if (
      !Number.isInteger(monthlyGoal) ||
      monthlyGoal < 0 ||
      !Number.isInteger(yearlyGoal) ||
      yearlyGoal < 0
    ) {
      return res.status(400).json({
        ok: false,
        error: "monthly_goal and yearly_goal must be non-negative integers",
      });
    }

    await pool.query(
      `
      INSERT INTO driver_goals (driver_user_id, monthly_goal, yearly_goal)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE
        monthly_goal = VALUES(monthly_goal),
        yearly_goal = VALUES(yearly_goal),
        updated_at = CURRENT_TIMESTAMP
      `,
      [driverUserId, monthlyGoal, yearlyGoal]
    );

    return res.json({
      ok: true,
      monthly_goal: monthlyGoal,
      yearly_goal: yearlyGoal,
      message: "Goals updated successfully",
    });
  } catch (err) {
    console.error("Failed to update goals:", err);
    return res.status(500).json({ ok: false, error: "failed to update goals" });
  }
});

router.patch("/text-size", async (req, res) => {
  try {
    const allowed = ["small", "medium", "large"];
    const textSize = String(req.body.text_size || "").toLowerCase();

    if (!allowed.includes(textSize)) {
      return res.status(400).json({
        ok: false,
        error: "text_size must be small, medium, or large",
      });
    }

    await pool.query(
      `
      UPDATE users
      SET text_size = ?
      WHERE id = ?
      LIMIT 1
      `,
      [textSize, req.user.id]
    );

    return res.json({
      ok: true,
      text_size: textSize,
    });
  } catch (err) {
    console.error("Failed to update text size:", err);
    return res.status(500).json({ ok: false, error: "failed to update text size" });
  }
});

module.exports = router;