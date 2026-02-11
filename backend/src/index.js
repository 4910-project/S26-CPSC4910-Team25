require("dotenv").config();

const mfaRoutes = require("./routes/mfa");

const express = require("express");
const pool = require("./db");

const authRoutes = require("./routes/auth");
const adminRoutes = require("./routes/admin");

const app = express();
const cors = require("cors");

app.use(
  cors({
    origin: "http://localhost:3000",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json());


// Verify DB connection once at startup
(async () => {
  try {
    const conn = await pool.getConnection();
    console.log("Connected to MySQL database");
    conn.release();
  } catch (err) {
    console.error("connection failed:", err.message);
    process.exit(1);
  }
})();

app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", db: "connected" });
  } catch (err) {
    res.status(500).json({ status: "error", db: "disconnected" });
  }
});

// Mount routes BEFORE listen
app.use("/auth", authRoutes);
app.use("/admin", adminRoutes);
app.use("/api", mfaRoutes);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log("src/index.js is running");
});



