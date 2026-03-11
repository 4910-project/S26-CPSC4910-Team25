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


router.get("/points", auth, async (req, res) => {
  try 
  {
    const [rows] = await db.query(
      "SELECT points FROM driver_points WHERE user_id = ?",
      [req.user.id]
    );

    if (rows.length === 0) 
    {
      await db.query(
        "INSERT INTO driver_points (user_id, points) VALUES (?, ?)",
        [req.user.id, 1000]
      );
      return res.json({ points: 1000 });
    }

    res.json({ points: rows[0].points });
  } 
  catch (err) 
  {
    console.error("GET /points error:", err);
    res.status(500).json({ error: "Failed to get pointss" });
  }
});


router.post("/points/deduct", auth, async (req, res) => 
{
  const { amount, itemId, itemName } = req.body;

  if (!amount || typeof amount !== "number" || amount <= 0) 
  {
    return res.status(400).json({ error: "Invalid amount" });
  }

  const conn = await db.getConnection();
  try 
  {
    await conn.beginTransaction();
    const [rows] = await conn.query(
      "SELECT points FROM driver_points WHERE user_id = ? FOR UPDATE",
      [req.user.id]
    );

    let currentPoints = 1000;
    if (rows.length === 0) 
    {
      
      await conn.query(
        "INSERT INTO driver_points (user_id, points) VALUES (?, ?)",
        [req.user.id, 1000]
      );
    } 
    else 
    {
      currentPoints = rows[0].points;
    }

    if (currentPoints < amount) 
    {
      await conn.rollback();
      return res.status(400).json({ error: "Insufficient ponits", currentPoints });
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

    const [rows] = await conn.query(
      "SELECT points FROM driver_points WHERE user_id = ? FOR UPDATE",
      [userId]
    );

    if (rows.length === 0) 
    {
      await conn.query(
        "INSERT INTO driver_points (user_id, points) VALUES (?, ?)",
        [userId, amount]
      );
    } 
    else 
    {
      await conn.query(
        "UPDATE driver_points SET points = points + ? WHERE user_id = ?",
        [amount, userId]
      );
    }

    
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