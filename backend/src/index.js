async function notifyAdmin(info){
  console.log("ADMIN NOTIFICATION:", info);
}

require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

if (!process.env.JWT_SECRET) {
  console.error("FATAL: JWT_SECRET is missing. Check backend/.env");
  process.exit(1);
}

const express = require("express");
const cors = require("cors");
const pool = require("./db");

// 🔹 NEW: Sponsor archive job
const { runArchiveSponsorsJob } = require("./jobs/archiveSponsorsJob");

const aboutRoutes = require("./routes/about");
const authRoutes = require("./routes/auth");
const adminRoutes = require("./routes/admin");
const driverRoutes = require("./routes/driver");
const mfaRoutes = require("./routes/mfa");
const sponsorRoutes = require("./routes/sponsor");

// These route files are NOT present in src/routes right now.
// Leaving them commented prevents the server from crashing.
// const profileRoutes = require("./routes/profileRoutes");
// const passwordResetRoutes = require("./routes/passwordResetRoutes");
// const accountRoutes = require("./routes/accountRoutes");

const app = express();

app.use(
  cors({
origin: ["http://localhost:3000", "https://prod.d14fex998h1awp.amplifyapp.com"],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json());

// Notify Admin of API GET Error
app.use((req, res, next) => {
  res.on("finish", () => {
    if (req.method === "GET" && res.statusCode >= 400) {
      console.error(
        "ADMIN ALERT:",
        req.method,
        req.originalUrl,
        res.statusCode
      );

      notifyAdmin({
        method: req.method,
        url: req.originalUrl,
        status: res.statusCode,
        time: new Date().toISOString(),
      });
    }
  });
  next();
});

app.use("/api/about", aboutRoutes);

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
app.use("/driver", driverRoutes);
app.use("/api", mfaRoutes);
app.use("/sponsor", sponsorRoutes);

// 🔹 NEW: Start sponsor archive background job
const minutes = Number(process.env.SPONSOR_ARCHIVE_JOB_MINUTES || 10);
setInterval(runArchiveSponsorsJob, minutes * 60 * 1000);

// Optional: run once immediately at startup
runArchiveSponsorsJob();

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log("src/index.js is running");
});
