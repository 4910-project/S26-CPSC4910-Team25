/**
 * Migration: Create sponsor_reviews table
 * File: backend/scripts/sponsorReviewsMigration.js
 *
 * Run with: node scripts/sponsorReviewsMigration.js
 */

require("dotenv").config({
  path: require("path").join(__dirname, "..", ".env"),
});

const pool = require("../src/db");

async function run() {
  const conn = await pool.getConnection();
  try {
    console.log("Running migration: create sponsor_reviews table...");

    const [tables] = await conn.query(`
      SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'sponsor_reviews'
    `);

    if (tables.length > 0) {
      console.log("✓ sponsor_reviews table already exists, skipping");
    } else {
      await conn.query(`
        CREATE TABLE sponsor_reviews (
          id              INT AUTO_INCREMENT PRIMARY KEY,
          driver_user_id  INT NOT NULL,
          sponsor_id      INT NOT NULL,
          rating          TINYINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
          comment         TEXT NULL,
          created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY uq_driver_sponsor (driver_user_id, sponsor_id),
          FOREIGN KEY (driver_user_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (sponsor_id)     REFERENCES sponsors(id) ON DELETE CASCADE
        )
      `);
      console.log("✓ sponsor_reviews table created");
    }

    console.log("\nMigration complete!");
    process.exit(0);
  } catch (err) {
    console.error("Migration failed:", err.message);
    process.exit(1);
  } finally {
    conn.release();
  }
}

run();