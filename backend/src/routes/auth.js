const express = require("express");
const bcrypt = require("bcryptjs");
const pool = require("../db");

const router = express.Router();

router.post("/register", async (req, res) => {
  try {
    const { email, password, role = "DRIVER" } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Missing email or password" });

    const [existing] = await pool.query("SELECT id FROM users WHERE email = ?", [email]);
    if (existing.length) return res.status(409).json({ error: "Email already exists" });

    const password_hash = await bcrypt.hash(password, 10);

    await pool.query(
      "INSERT INTO users (email, password_hash, role, status) VALUES (?, ?, ?, 'ACTIVE')",
      [email, password_hash, role]
    );

    res.json({ status: "ok" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Missing email or password" });

    const [rows] = await pool.query(
      "SELECT id, email, password_hash, role, status FROM users WHERE email = ? LIMIT 1",
      [email]
    );
    if (!rows.length) return res.status(401).json({ error: "Invalid credentials" });

    const user = rows[0];
    if (user.status !== "ACTIVE") return res.status(403).json({ error: `Account is ${user.status}` });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });

    res.json({
      status: "ok",
      user: { id: user.id, email: user.email, role: user.role },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// FORGOT USERNAME
router.post("/forgot-username", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Invalid Email"});

    const [rows] = await pool.querey(
      "SELECT email FROM users WHERE email = ? LIMIT 1",
      [email]
    );

    res.json({ message: "Your username has been sent to your email."});
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error"});
  }
});

// CHANGE USERNAME
router.patch("/users/:userID/username", async (req, res) => {
  const newUsername = String(username).trim();
  try {
    const [result] = await pool.querey(
      "UPDATE users SET username = WHERE id = ? LIMIT 1",
      [newUsername, userID]
    );
    
    res.json({ message: "Username Updated"});
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error"});
  }
});

module.exports = router;
