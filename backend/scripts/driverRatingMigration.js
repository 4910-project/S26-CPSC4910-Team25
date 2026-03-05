/**
 * Migration: Create driver_ratings table
 * File: backend/scripts/driverRatingsMigration.js
 *
 * Run with: node scripts/driverRatingsMigration.js
 */

require("dotenv").config({
  path: require("path").join(__dirname, "..", ".env"),
});

const pool = require("../src/db");

async function run() {
  const conn = await pool.getConnection();
  try {
    console.log("Running migration: create driver_ratings table...");

    // Check if table already exists
    const [tables] = await conn.query(`
      SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'driver_ratings'
    `);

    if (tables.length > 0) {
      console.log("✓ driver_ratings table already exists, skipping");
    } else {
      await conn.query(`
        CREATE TABLE driver_ratings (
          id            INT AUTO_INCREMENT PRIMARY KEY,
          sponsor_id    INT NOT NULL,
          driver_id     INT NOT NULL,
          rating        ENUM('thumbs_up', 'thumbs_down') NOT NULL,
          created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY uq_sponsor_driver (sponsor_id, driver_id),
          FOREIGN KEY (sponsor_id) REFERENCES sponsors(id) ON DELETE CASCADE,
          FOREIGN KEY (driver_id)  REFERENCES drivers(id)  ON DELETE CASCADE
        )
      `);
      console.log("✓ driver_ratings table created");
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