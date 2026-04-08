async function notifyAdmin(info) {
  console.log("ADMIN NOTIFICATION:", info);
}

require("dotenv").config({
  path: require("path").join(__dirname, "..", ".env"),
});

if (!process.env.JWT_SECRET) {
  console.error("FATAL: JWT_SECRET is missing. Check backend/.env");
  process.exit(1);
}

const express = require("express");
const cors = require("cors");
const path = require("path");
const pool = require("./db");

const { runArchiveSponsorsJob } = require("./jobs/archiveSponsorsJob");

const aboutRoutes = require("./routes/about");
const authRoutes = require("./routes/auth");
const adminRoutes = require("./routes/admin");
const driverRoutes = require("./routes/driver");
const mfaRoutes = require("./routes/mfa");
const sponsorRoutes = require("./routes/sponsor");
const profileRoutes = require("./routes/profile");
const driverAppsRoutes = require("./routes/driverApps");

const app = express();

app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "https://prod.d14fex998h1awp.amplifyapp.com",
    ],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json());

// Serve uploaded profile photos
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));


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

// About route
app.use("/api/about", aboutRoutes);

// Auth
app.use("/auth", authRoutes);

// Admin
app.use("/admin", adminRoutes);

// MFA routes
app.use("/api", mfaRoutes);

// Profile routes (change username, change password) — must come BEFORE driverRoutes
// because driverRoutes has a global DRIVER-only middleware that blocks all /api/* requests
app.use("/api/profile", profileRoutes);

// Driver routes 
app.use("/api", driverRoutes);

// Sponsor routes
app.use("/sponsor", sponsorRoutes);

app.use("/api/apps", driverAppsRoutes);


app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", db: "connected" });
  } catch (err) {
    res.status(500).json({ status: "error", db: "disconnected" });
  }
});


// Helper: add a column only if it doesn't already exist (MySQL 5.7 compatible)
async function addColumnIfMissing(table, column, definition) {
  const [rows] = await pool.query(
    `SELECT 1 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
     LIMIT 1`,
    [table, column]
  );
  if (!rows.length) {
    await pool.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
  }
}

(async () => {
  try {
    const conn = await pool.getConnection();
    console.log("Connected to MySQL database");
    conn.release();

    await addColumnIfMissing("users",    "profile_photo_url", "VARCHAR(500) NULL DEFAULT NULL");
    await addColumnIfMissing("sponsors", "org_photo_url",     "VARCHAR(500) NULL DEFAULT NULL");

    // Ensure driver cart table exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS driver_cart (
        id                INT NOT NULL AUTO_INCREMENT,
        driver_id         INT NOT NULL,
        itunes_track_id   VARCHAR(50) NOT NULL,
        product_name      VARCHAR(500) NOT NULL,
        product_image_url VARCHAR(1000) NULL,
        price_in_points   INT NOT NULL DEFAULT 0,
        artist            VARCHAR(500) NULL,
        kind              VARCHAR(100) NULL,
        added_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_cart_driver_track (driver_id, itunes_track_id),
        CONSTRAINT fk_cart_driver
          FOREIGN KEY (driver_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    await addColumnIfMissing("driver_cart", "is_available", "TINYINT(1) NOT NULL DEFAULT 1");
    await addColumnIfMissing("driver_cart", "availability_message", "VARCHAR(255) NULL DEFAULT NULL");
    await addColumnIfMissing("driver_cart", "availability_checked_at", "DATETIME NULL DEFAULT NULL");
    await addColumnIfMissing("driver_cart", "availability_changed_at", "DATETIME NULL DEFAULT NULL");
    await addColumnIfMissing("driver_cart", "availability_notified_at", "DATETIME NULL DEFAULT NULL");

    // Ensure driver wishlist table exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS driver_wishlist (
        id               INT NOT NULL AUTO_INCREMENT,
        driver_id        INT NOT NULL,
        itunes_track_id  VARCHAR(50) NOT NULL,
        product_name     VARCHAR(500) NOT NULL,
        product_image_url VARCHAR(1000) NULL,
        price_in_points  INT NOT NULL DEFAULT 0,
        added_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_driver_track (driver_id, itunes_track_id),
        CONSTRAINT fk_wishlist_driver
          FOREIGN KEY (driver_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS driver_friendships (
        driver_user_id INT NOT NULL,
        friend_user_id INT NOT NULL,
        created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (driver_user_id, friend_user_id),
        CONSTRAINT chk_driver_friendships_distinct
          CHECK (driver_user_id <> friend_user_id),
        CONSTRAINT fk_driver_friendships_driver
          FOREIGN KEY (driver_user_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_driver_friendships_friend
          FOREIGN KEY (friend_user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS sponsor_posts (
        id               INT NOT NULL AUTO_INCREMENT,
        sponsor_id       INT NOT NULL,
        author_user_id   INT NOT NULL,
        title            VARCHAR(150) NOT NULL,
        body             TEXT NOT NULL,
        created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_sponsor_posts_sponsor_created (sponsor_id, created_at),
        CONSTRAINT fk_sponsor_posts_sponsor
          FOREIGN KEY (sponsor_id) REFERENCES sponsors(id) ON DELETE CASCADE,
        CONSTRAINT fk_sponsor_posts_author
          FOREIGN KEY (author_user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS sponsor_post_comments (
        id              INT NOT NULL AUTO_INCREMENT,
        post_id         INT NOT NULL,
        driver_user_id  INT NOT NULL,
        comment_text    VARCHAR(500) NOT NULL,
        created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_sponsor_post_comments_post_created (post_id, created_at),
        CONSTRAINT fk_sponsor_post_comments_post
          FOREIGN KEY (post_id) REFERENCES sponsor_posts(id) ON DELETE CASCADE,
        CONSTRAINT fk_sponsor_post_comments_driver
          FOREIGN KEY (driver_user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
  } catch (err) {
    console.error("connection failed:", err.message);
    process.exit(1);
  }
})();


const minutes = Number(process.env.SPONSOR_ARCHIVE_JOB_MINUTES || 10);
setInterval(runArchiveSponsorsJob, minutes * 60 * 1000);
runArchiveSponsorsJob();

const PORT = process.env.PORT || 8001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log("src/index.js is running");
});
