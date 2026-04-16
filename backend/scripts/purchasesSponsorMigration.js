/**
 * purchasesSponsorMigration.js
 * Adds purchased_by_sponsor and sponsor_id columns to the purchases table.
 * Safe to re-run — uses columnExists checks.
 *
 * Run from backend/scripts/:
 *   node purchasesSponsorMigration.js
 */

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const pool = require("../src/db");

async function columnExists(table, column) {
  const [rows] = await pool.query(
    `SELECT 1 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
     LIMIT 1`,
    [table, column]
  );
  return !!rows.length;
}

async function run() {
  console.log("Running purchases sponsor migration...");

  if (!(await columnExists("purchases", "purchased_by_sponsor"))) {
    await pool.query(
      "ALTER TABLE `purchases` ADD COLUMN `purchased_by_sponsor` TINYINT(1) NOT NULL DEFAULT 0"
    );
    console.log("Added purchases.purchased_by_sponsor");
  } else {
    console.log("purchases.purchased_by_sponsor already exists — skipped");
  }

  if (!(await columnExists("purchases", "sponsor_id"))) {
    await pool.query(
      "ALTER TABLE `purchases` ADD COLUMN `sponsor_id` INT NULL DEFAULT NULL"
    );
    console.log("Added purchases.sponsor_id");
  } else {
    console.log("purchases.sponsor_id already exists — skipped");
  }

  console.log("Done.");
  process.exit(0);
}

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
