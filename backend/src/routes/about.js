/**
 * About Page Route
 * File: backend/src/routes/about.js
 *
 * Mount in index.js:
 *   const aboutRoutes = require("./routes/about");
 *   app.use("/api/about", aboutRoutes);
 *
 * Public endpoint — no auth required.
 */

const express = require("express");
const router = express.Router();
const pool = require("../db");

// GET /api/about
router.get("/", async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT
         team_number,
         version,
         DATE_FORMAT(release_date, '%M %d, %Y') AS release_date,
         product_name,
         product_description
       FROM about_info
       WHERE id = 1
       LIMIT 1`
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "About info not found. Run about-migration.js first." });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error("GET /api/about error:", err.message);
    res.status(500).json({ error: "Failed to load about information." });
  }
});

module.exports = router;