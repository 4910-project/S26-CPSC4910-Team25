/**
 * About Page Migration
 * Run once: node about-migration.js
 * Update the seed data each sprint by changing the values below.
 *
 * Usage (from backend/ directory):
 *   node about-migration.js
 */

require("dotenv").config();
const mysql = require("mysql2/promise");

async function migrate() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: Number(process.env.DB_PORT || 3306),
  });

  console.log("Running About page migration...");

  // Create table
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS about_info (
      id INT PRIMARY KEY DEFAULT 1,
      team_number    VARCHAR(50)  NOT NULL,
      version        VARCHAR(50)  NOT NULL,
      release_date   DATE         NOT NULL,
      product_name   VARCHAR(100) NOT NULL,
      product_description TEXT    NOT NULL,
      updated_at     TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);
  console.log("✔ Table 'about_info' ready");

  // ─── UPDATE THESE VALUES EACH SPRINT ─────────────────────────────────────────
  const seed = {
    team_number:  "Team 25",
    version:      "Sprint 2",
    release_date: "2026-02-18",
    product_name: "Good Driver Incentive Program",
    product_description:
      "A web application that incentivizes truck drivers to improve their on-road " +
      "performance. Sponsors award points to drivers for good behaviors, which can be " +
      "redeemed for products in a sponsor-curated catalog powered by real-time product APIs. " +
      "The platform supports drivers, sponsor companies, and administrators with role-based " +
      "access, secure authentication, and full audit logging.",
  };
  // ─────────────────────────────────────────────────────────────────────────────

  await pool.execute(
    `INSERT INTO about_info
       (id, team_number, version, release_date, product_name, product_description)
     VALUES (1, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       team_number = VALUES(team_number),
       version     = VALUES(version),
       release_date = VALUES(release_date),
       product_name = VALUES(product_name),
       product_description = VALUES(product_description)`,
    [
      seed.team_number,
      seed.version,
      seed.release_date,
      seed.product_name,
      seed.product_description,
    ]
  );
  console.log("✔ Seed data inserted / updated");

  await pool.end();
  console.log("Migration complete.");
}

migrate().catch((err) => {
  console.error("Migration failed:", err.message);
  process.exit(1);
});