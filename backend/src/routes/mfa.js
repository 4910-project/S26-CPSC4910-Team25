const express = require("express");
const router = express.Router();
const pool = require("../db");
const auth = require("../middleware/auth");

const ALLOWED = new Set(["email", "sms", "totp"]);

router.get("/mfa", auth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT mfa_enabled, mfa_modes FROM users WHERE id = ? LIMIT 1",
      [req.user.id]
    );

    if (!rows.length) return res.status(404).json({ error: "User not found" });

    const row = rows[0];

    let modes = [];
    if (row.mfa_modes) {
      modes = Array.isArray(row.mfa_modes) ? row.mfa_modes : JSON.parse(row.mfa_modes);
    }

    res.json({ enabled: !!row.mfa_enabled, modes });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

router.put("/mfa", auth, async (req, res) => {
  try {
    const { modes } = req.body;

    if (!Array.isArray(modes)) {
      return res.status(400).json({ error: "modes must be an array" });
    }

    const cleaned = [...new Set(modes.map(String))].filter((m) => ALLOWED.has(m));

    if (cleaned.length === 0) {
      return res.status(400).json({ error: "Select at least one valid MFA mode" });
    }

    await pool.query(
      "UPDATE users SET mfa_enabled = 1, mfa_modes = ? WHERE id = ?",
      [JSON.stringify(cleaned), req.user.id]
    );

    res.json({ status: "ok", enabled: true, modes: cleaned });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
