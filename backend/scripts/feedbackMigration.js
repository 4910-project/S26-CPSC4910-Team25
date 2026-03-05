/**
 * Migration: Create feedback table
 * File: backend/scripts/feedbackMigration.js
 *
 * Run with: node scripts/feedbackMigration.js
 */

require("dotenv").config({
  path: require("path").join(__dirname, "..", ".env"),
});

const pool = require("../src/db");

async function run() {
  const conn = await pool.getConnection();
  try {
    console.log("Running migration: create feedback table...");

    const [tables] = await conn.query(`
      SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'feedback'
    `);

    if (tables.length > 0) {
      console.log("✓ feedback table already exists, skipping");
    } else {
      await conn.query(`
        CREATE TABLE feedback (
          id              INT AUTO_INCREMENT PRIMARY KEY,
          user_id         INT NOT NULL,
          category        ENUM(
                            'Bug Report',
                            'Feature Request',
                            'Points Issue',
                            'Account Problem',
                            'Sponsor Issue',
                            'General Feedback',
                            'Other'
                          ) NOT NULL,
          message         TEXT NOT NULL,
          status          ENUM('open', 'reviewed', 'resolved') NOT NULL DEFAULT 'open',
          admin_note      TEXT NULL,
          created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
      `);
      console.log("✓ feedback table created");
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