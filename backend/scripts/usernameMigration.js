/**
 * Migration: Add username column to users table
 * File: backend/scripts/add-username-migration.js
 *
 * Run with: node scripts/add-username-migration.js
 */

require("dotenv").config({
  path: require("path").join(__dirname, "..", ".env"),
});

const pool = require("../src/db");

async function run() {
  const conn = await pool.getConnection();
  try {
    console.log("Running migration: add username column...");

    // Check if column already exists before adding
    const [cols] = await conn.query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'users'
        AND COLUMN_NAME = 'username'
    `);

    if (cols.length > 0) {
      console.log("✓ username column already exists, skipping ALTER");
    } else {
      await conn.query(`
        ALTER TABLE users
        ADD COLUMN username VARCHAR(50) NULL UNIQUE
        AFTER email
      `);
      console.log("✓ username column added");
    }

    // Backfill existing users: set username = part before @ in email
    const [rows] = await conn.query(
      "SELECT id, email FROM users WHERE username IS NULL"
    );

    let backfilled = 0;
    for (const user of rows) {
      const base = user.email.split("@")[0].replace(/[^a-zA-Z0-9_]/g, "_");
      let candidate = base;

      // Check for collision and suffix with id if needed
      const [clash] = await conn.query(
        "SELECT id FROM users WHERE username = ? AND id != ? LIMIT 1",
        [candidate, user.id]
      );
      if (clash.length) {
        candidate = `${base}_${user.id}`;
      }

      await conn.query("UPDATE users SET username = ? WHERE id = ?", [
        candidate,
        user.id,
      ]);
      backfilled++;
    }
    console.log(`✓ backfilled ${backfilled} existing users with default usernames`);

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