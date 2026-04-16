const express = require("express");
const router  = express.Router();
const db      = require("../db");
const auth    = require("../middleware/auth");

//I had to to set a base limit for points and min item cost here..
//if it causes issues this could be refactored probably
const POINTS_PER_USD  = parseInt(process.env.POINTS_PER_USD  || "100");
const MIN_ITEM_COST   = parseInt(process.env.MIN_ITEM_COST_PTS || "50");

// //For converting between points and prices
function usdToPoints(price)
{
  const p = parseFloat(price);
  if (!p || p <= 0) return MIN_ITEM_COST;
  return Math.round(p * POINTS_PER_USD);
}

// helper: get or create a driver_points row
// seeds from drivers.starting_points if the row is brand new
async function getOrCreateBalance(conn, userId)
{
  const [rows] = await conn.query(
    "SELECT points FROM driver_points WHERE user_id = ? FOR UPDATE",
    [userId]
  );

  if (rows.length > 0) return rows[0].points;

  // first time - seed from drivers.starting_points if this user is a driver
  const [driverRows] = await conn.query(
    "SELECT starting_points FROM drivers WHERE user_id = ? AND status = 'ACTIVE' LIMIT 1",
    [userId]
  );

  const seed = driverRows[0]?.starting_points ?? 0;

  await conn.query(
    "INSERT INTO driver_points (user_id, points) VALUES (?, ?)",
    [userId, seed]
  );

  return seed;
}

router.get("/points", auth, async (req, res) => {
  // RC2: if the driver has an active_sponsor_id set, read from drivers.points_balance
  // for that sponsor. Fall back to the legacy driver_points table otherwise.
  try {
    const [[userRow]] = await db.query(
      "SELECT active_sponsor_id FROM users WHERE id = ? LIMIT 1",
      [req.user.id]
    );
    const activeSponsorId = userRow?.active_sponsor_id;

    if (activeSponsorId) {
      const [[driverRow]] = await db.query(
        "SELECT points_balance FROM drivers WHERE user_id = ? AND sponsor_id = ? LIMIT 1",
        [req.user.id, activeSponsorId]
      );
      const points = driverRow ? Number(driverRow.points_balance) : 0;
      return res.json({ points });
    }
  } catch (err) {
    console.error("GET /points RC2 lookup error:", err);
    // Fall through to legacy path on error
  }

  // Legacy path — driver_points table
  const conn = await db.getConnection();
  try
  {
    await conn.beginTransaction();
    const points = await getOrCreateBalance(conn, req.user.id);
    await conn.commit();
    res.json({ points });
  }
  catch (err)
  {
    await conn.rollback();
    console.error("GET /points error:", err);
    res.status(500).json({ error: "Failed to get points" });
  }
  finally
  {
    conn.release();
  }
});

router.post("/points/deduct", auth, async (req, res) =>
{
  const { amount, itemId, itemName } = req.body;

  if (!amount || typeof amount !== "number" || amount <= 0)
  {
    return res.status(400).json({ error: "Invalid amount" });
  }

  // RC2: if the driver has an active_sponsor_id, deduct from drivers.points_balance
  // for that sponsor and keep users.points in sync. Fall back to legacy path otherwise.
  try {
    const [[userRow]] = await db.query(
      "SELECT active_sponsor_id FROM users WHERE id = ? LIMIT 1",
      [req.user.id]
    );
    const activeSponsorId = userRow?.active_sponsor_id;

    if (activeSponsorId) {
      const conn = await db.getConnection();
      try {
        await conn.beginTransaction();

        const [[driverRow]] = await conn.query(
          "SELECT id, points_balance FROM drivers WHERE user_id = ? AND sponsor_id = ? LIMIT 1 FOR UPDATE",
          [req.user.id, activeSponsorId]
        );

        if (!driverRow) {
          await conn.rollback();
          return res.status(404).json({ error: "Driver record not found for active sponsor" });
        }

        const currentPoints = Number(driverRow.points_balance);
        if (currentPoints < amount) {
          await conn.rollback();
          return res.status(400).json({ error: "Insufficient points", currentPoints });
        }

        const remaining = currentPoints - amount;

        await conn.query(
          "UPDATE drivers SET points_balance = ? WHERE id = ? LIMIT 1",
          [remaining, driverRow.id]
        );

        // Keep legacy users.points in sync
        await conn.query(
          "UPDATE users SET points = GREATEST(0, points - ?) WHERE id = ? LIMIT 1",
          [amount, req.user.id]
        );

        await conn.commit();
        return res.json({ success: true, remainingPoints: remaining, deducted: amount });
      } catch (err) {
        await conn.rollback();
        console.error("POST /points/deduct RC2 error:", err);
        return res.status(500).json({ error: "Failed to deduct points" });
      } finally {
        conn.release();
      }
    }
  } catch (err) {
    console.error("POST /points/deduct RC2 lookup error:", err);
    // Fall through to legacy path
  }

  // Legacy path — driver_points table
  const conn = await db.getConnection();
  try
  {
    await conn.beginTransaction();

    const currentPoints = await getOrCreateBalance(conn, req.user.id);

    if (currentPoints < amount)
    {
      await conn.rollback();
      return res.status(400).json({ error: "Insufficient points", currentPoints });
    }

    const remaining = currentPoints - amount;

    await conn.query(
      "UPDATE driver_points SET points = ? WHERE user_id = ?",
      [remaining, req.user.id]
    );

    await conn.commit();
    res.json({ success: true, remainingPoints: remaining, deducted: amount });
  }
  catch (err)
  {
    await conn.rollback();
    console.error("POST /points/deduct error:", err);
    res.status(500).json({ error: "Failed to deduct points" });
  }
  finally
  {
    conn.release();
  }
});

// Only sponsors and admins can award points
router.post("/points/add", auth, async (req, res) =>
{
  if (!["SPONSOR", "ADMIN"].includes(req.user.role))
  {
    return res.status(403).json({ error: "You must not have permission to award points" });
  }

  const { userId, amount, reason } = req.body;
  if (!userId || !amount || amount <= 0)
  {
    return res.status(400).json({ error: "userId and a positive amount are required" });
  }

  const conn = await db.getConnection();
  try
  {
    await conn.beginTransaction();

    await getOrCreateBalance(conn, userId);

    await conn.query(
      "UPDATE driver_points SET points = points + ? WHERE user_id = ?",
      [amount, userId]
    );

    await conn.query(
      `INSERT INTO point_transactions (user_id, amount, type, reason, awarded_by)
       VALUES (?, ?, 'AWARD', ?, ?)`,
      [userId, amount, reason || null, req.user.id]
    );

    const [[updated]] = await conn.query(
      "SELECT points FROM driver_points WHERE user_id = ?",
      [userId]
    );

    await conn.commit();
    res.json({ success: true, newBalance: updated.points });
  }
  catch (err)
  {
    await conn.rollback();
    console.error("POST /points/add error:", err);
    res.status(500).json({ error: "Failed to add points" });
  }
  finally
  {
    conn.release();
  }
});

// Sponsors can update a driver's starting_points
// this does NOT change their current balance, only the seed for new accounts
router.post("/points/set-starting", auth, async (req, res) =>
{
  if (!["SPONSOR", "ADMIN"].includes(req.user.role))
  {
    return res.status(403).json({ error: "Not authorized" });
  }

  const { driverUserId, startingPoints } = req.body;
  if (!driverUserId || startingPoints == null || startingPoints < 0)
  {
    return res.status(400).json({ error: "driverUserId and startingPoints >= 0 are required" });
  }

  try
  {
    const [result] = await db.query(
      "UPDATE drivers SET starting_points = ? WHERE user_id = ?",
      [startingPoints, driverUserId]
    );

    if (result.affectedRows === 0)
    {
      return res.status(404).json({ error: "Driver not found" });
    }

    res.json({ success: true, startingPoints });
  }
  catch (err)
  {
    console.error("POST /points/set-starting error:", err);
    res.status(500).json({ error: "Failed to update starting points" });
  }
});

// Admin or sponsor can view a specific driver's balance
router.get("/points/balance/:driverUserId", auth, async (req, res) =>
{
  if (!["SPONSOR", "ADMIN"].includes(req.user.role))
  {
    return res.status(403).json({ error: "Not authorized" });
  }

  try
  {
    const [rows] = await db.query(
      "SELECT points FROM driver_points WHERE user_id = ?",
      [req.params.driverUserId]
    );

    res.json({ points: rows[0]?.points ?? 0 });
  }
  catch (err)
  {
    console.error("GET /points/balance/:id error:", err);
    res.status(500).json({ error: "Failed to fetch balance" });
  }
});


router.get("/purchases", auth, async (req, res) =>
{
  try
  {
    const [rows] = await db.query(
      `SELECT id, purchased_at AS date, item_name AS name, artist, kind,
              artwork_url AS artwork, cost, points_after AS pointsAfter,
              track_view_url AS trackViewUrl
       FROM purchases
       WHERE user_id = ?
       ORDER BY purchased_at DESC
       LIMIT 100`,
      [req.user.id]
    );
    res.json(rows);
  }
  catch (err)
  {
    console.error("GET /purchases error:", err);
    res.status(500).json({ error: "Failed to fetch purchases" });
  }
});

router.post("/purchases", auth, async (req, res) =>
{
  const { id, date, name, artist, kind, artwork, cost, pointsAfter, trackViewUrl } = req.body;

  if (!name || !cost)
  {
    return res.status(400).json({ error: "name and cost are required" });
  }

  try
  {
    await db.query(
      `INSERT INTO purchases
         (id, user_id, purchased_at, item_name, artist, kind, artwork_url, cost, points_after, track_view_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE item_name = item_name`, // ignore duplicates
      [
        id || `${req.user.id}-${Date.now()}`,
        req.user.id,
        date ? new Date(date) : new Date(),
        name,
        artist || null,
        kind   || null,
        artwork || null,
        cost,
        pointsAfter ?? null,
        trackViewUrl || null,
      ]
    );

    await db.query(
      `INSERT INTO point_transactions (user_id, amount, type, reason)
       VALUES (?, ?, 'REDEEM', ?)`,
      [req.user.id, -cost, `Purchased: ${name}`]
    );

    res.json({ success: true });
  }
  catch (err)
  {
    console.error("POST /purchases error:", err);
    res.status(500).json({ error: "Failed to save purchase" });
  }
});

module.exports = router;
