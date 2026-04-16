/**
 * passwordResetMigration.js
 * Creates the password_reset_tokens table.
 * Safe to re-run — uses CREATE TABLE IF NOT EXISTS.
 *
 * Run from backend/scripts/:
 *   node passwordResetMigration.js
 */

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const pool = require("../src/db");

async function run() {
  console.log("Running password reset migration...");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id         INT          NOT NULL AUTO_INCREMENT,
      user_id    INT          NOT NULL,
      token      VARCHAR(255) NOT NULL,
      expires_at DATETIME     NOT NULL,
      used       TINYINT(1)   NOT NULL DEFAULT 0,
      created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_token (token),
      KEY idx_prt_user (user_id),
      CONSTRAINT fk_prt_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  console.log("password_reset_tokens table created (or already existed).");
  process.exit(0);
}

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
