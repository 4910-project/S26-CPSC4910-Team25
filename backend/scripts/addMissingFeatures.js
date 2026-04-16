/**
 * Migration: addMissingFeatures.js
 *
 * Adds the following missing schema pieces:
 *   1. users.first_name, users.last_name        — for bulk-upload name persistence
 *   2. sponsors.point_value                     — dollar value per point (default $0.01)
 *   3. notifications table                      — in-app notifications per user
 *   4. drivers.points_balance                   — per-sponsor point balance (RC2)
 *   5. users.active_sponsor_id                  — which sponsor the driver is currently viewing (RC2)
 *
 * Run from scripts/ dir:
 *   cd scripts && node addMissingFeatures.js
 */

require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });

const mysql = require("mysql2/promise");

async function addColumnIfMissing(conn, table, column, definition) {
  const [rows] = await conn.query(
    `SELECT 1 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
     LIMIT 1`,
    [table, column]
  );
  if (!rows.length) {
    await conn.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
    console.log(`  + ${table}.${column} added`);
  } else {
    console.log(`  - ${table}.${column} already exists, skipping`);
  }
}

async function run() {
  const pool = mysql.createPool({
    host:     process.env.DB_HOST     || "localhost",
    port:     parseInt(process.env.DB_PORT || "3306"),
    user:     process.env.DB_USER     || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 5,
  });

  const conn = await pool.getConnection();

  try {
    console.log("Running migration: addMissingFeatures...\n");

    // 1. users: first_name, last_name
    console.log("[1] users table — first_name / last_name");
    await addColumnIfMissing(conn, "users", "first_name", "VARCHAR(100) NULL DEFAULT NULL AFTER email");
    await addColumnIfMissing(conn, "users", "last_name",  "VARCHAR(100) NULL DEFAULT NULL AFTER first_name");

    // 2. sponsors: point_value
    console.log("\n[2] sponsors table — point_value");
    await addColumnIfMissing(conn, "sponsors", "point_value", "DECIMAL(10,4) NOT NULL DEFAULT 0.0100 COMMENT 'Dollar value per point'");

    // 3. notifications table
    console.log("\n[3] notifications table");
    await conn.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id             INT          NOT NULL AUTO_INCREMENT,
        user_id        INT          NOT NULL,
        type           VARCHAR(50)  NOT NULL COMMENT 'DROPPED | POINTS_ADDED | POINTS_REMOVED | ORDER_PLACED',
        message        VARCHAR(500) NOT NULL,
        is_dismissible TINYINT(1)  NOT NULL DEFAULT 1 COMMENT '0 = non-dismissible (e.g. DROPPED)',
        read_at        DATETIME     NULL,
        created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_notifications_user_unread (user_id, read_at),
        CONSTRAINT fk_notifications_user
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    console.log("  + notifications table created (or already exists)");

    // 4. drivers: points_balance  (RC2 — per-sponsor point balance)
    console.log("\n[4] drivers table — points_balance");
    await addColumnIfMissing(conn, "drivers", "points_balance", "INT NOT NULL DEFAULT 0 COMMENT 'Per-sponsor point balance (RC2)'");

    // 5. users: active_sponsor_id  (RC2 — which sponsor catalog the driver is viewing)
    console.log("\n[5] users table — active_sponsor_id");
    await addColumnIfMissing(conn, "users", "active_sponsor_id", "INT NULL DEFAULT NULL COMMENT 'Currently selected sponsor for RC2 catalog switch'");

    console.log("\nMigration complete.");
  } catch (err) {
    console.error("Migration failed:", err.message);
    process.exit(1);
  } finally {
    conn.release();
    await pool.end();
  }
}

run();
