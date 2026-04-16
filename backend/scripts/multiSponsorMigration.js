/**
 * multiSponsorMigration.js
 * RC2 — Multiple Sponsors
 *
 * What this script does:
 *  1. Ensures drivers.points_balance column exists (per-sponsor balance)
 *  2. Ensures users.active_sponsor_id column exists
 *  3. Ensures driver_points_history table exists with a sponsor_id column
 *  4. For drivers with exactly ONE active sponsor: copies users.points into
 *     drivers.points_balance so the old global balance is preserved per-sponsor
 *  5. Sets users.active_sponsor_id for drivers who belong to exactly one sponsor
 *     and don't already have an active_sponsor_id
 *
 * Safe to run multiple times — all steps are idempotent.
 *
 * Run from this directory:
 *   cd backend/scripts && node multiSponsorMigration.js
 */

require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const pool = require("../src/db");

// ── Helpers ───────────────────────────────────────────────────────────────────

async function addColumnIfMissing(table, column, definition) {
  const [rows] = await pool.query(
    `SELECT 1
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
     LIMIT 1`,
    [table, column]
  );
  if (!rows.length) {
    await pool.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
    console.log(`  ✅ Added column ${table}.${column}`);
  } else {
    console.log(`  ✔  Column ${table}.${column} already exists — skipping`);
  }
}

async function tableExists(tableName) {
  const [rows] = await pool.query(
    `SELECT 1
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
     LIMIT 1`,
    [tableName]
  );
  return !!rows[0];
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function run() {
  console.log("=== RC2 Multi-Sponsor Migration ===\n");

  // ── Step 1: per-sponsor points balance on drivers ──────────────────────────
  console.log("Step 1: Ensuring drivers.points_balance column...");
  await addColumnIfMissing("drivers", "points_balance", "INT NOT NULL DEFAULT 0");

  // ── Step 2: active_sponsor_id on users ────────────────────────────────────
  console.log("Step 2: Ensuring users.active_sponsor_id column...");
  await addColumnIfMissing("users", "active_sponsor_id", "INT NULL DEFAULT NULL");

  // ── Step 3: driver_points_history with sponsor_id ─────────────────────────
  console.log("Step 3: Ensuring driver_points_history table...");
  if (!(await tableExists("driver_points_history"))) {
    await pool.query(`
      CREATE TABLE driver_points_history (
        id             INT          NOT NULL AUTO_INCREMENT,
        driver_user_id INT          NOT NULL,
        sponsor_id     INT          NULL,
        points_change  INT          NOT NULL,
        reason         VARCHAR(255) NOT NULL DEFAULT '',
        created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_dph_driver  (driver_user_id),
        KEY idx_dph_sponsor (sponsor_id),
        CONSTRAINT fk_dph_driver
          FOREIGN KEY (driver_user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    console.log("  ✅ Created driver_points_history table");
  } else {
    console.log("  ✔  driver_points_history already exists");
    // Make sure sponsor_id column is present (may have been created without it)
    await addColumnIfMissing("driver_points_history", "sponsor_id", "INT NULL DEFAULT NULL");
  }

  // ── Step 4: Migrate users.points → drivers.points_balance ─────────────────
  // Only for drivers with exactly ONE active driver row whose points_balance is still 0
  console.log("Step 4: Migrating users.points → drivers.points_balance for single-sponsor drivers...");

  const [toMigrate] = await pool.query(`
    SELECT u.id AS userId, u.points, d.id AS driverId
    FROM users u
    JOIN drivers d ON d.user_id = u.id AND d.status IN ('ACTIVE', 'PROBATION')
    WHERE u.points > 0 AND d.points_balance = 0
      AND (
        SELECT COUNT(*)
        FROM drivers d2
        WHERE d2.user_id = u.id AND d2.status IN ('ACTIVE', 'PROBATION')
      ) = 1
  `);

  let migrated = 0;
  for (const row of toMigrate) {
    await pool.query(
      "UPDATE drivers SET points_balance = ? WHERE id = ? LIMIT 1",
      [row.points, row.driverId]
    );
    migrated++;
  }
  console.log(`  ✅ Migrated points for ${migrated} driver(s)`);

  // ── Step 5: Set active_sponsor_id for single-sponsor drivers ──────────────
  console.log("Step 5: Setting users.active_sponsor_id for single-sponsor drivers...");

  const [needsActive] = await pool.query(`
    SELECT u.id AS userId, d.sponsor_id
    FROM users u
    JOIN drivers d ON d.user_id = u.id AND d.status IN ('ACTIVE', 'PROBATION')
    WHERE u.active_sponsor_id IS NULL
      AND (
        SELECT COUNT(*)
        FROM drivers d2
        WHERE d2.user_id = u.id AND d2.status IN ('ACTIVE', 'PROBATION')
      ) = 1
  `);

  let activeSponsorSet = 0;
  for (const row of needsActive) {
    await pool.query(
      "UPDATE users SET active_sponsor_id = ? WHERE id = ? AND active_sponsor_id IS NULL LIMIT 1",
      [row.sponsor_id, row.userId]
    );
    activeSponsorSet++;
  }
  console.log(`  ✅ Set active_sponsor_id for ${activeSponsorSet} driver(s)`);

  console.log("\n=== Migration complete! ===");
  process.exit(0);
}

run().catch((err) => {
  console.error("\nMigration failed:", err);
  process.exit(1);
});
