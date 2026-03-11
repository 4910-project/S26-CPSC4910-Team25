/**
 * Migration: Create sponsor_hidden_products table
 * File: backend/scripts/catalogMigration.js
 *
 * Run with: node scripts/catalogMigration.js
 */

require("dotenv").config({
  path: require("path").join(__dirname, "..", ".env"),
});

const pool = require("../src/db");

async function run() {
  const conn = await pool.getConnection();
  try {
    console.log("Running migration: create sponsor_hidden_products table...");

    const [tables] = await conn.query(`
      SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'sponsor_hidden_products'
    `);

    if (tables.length > 0) {
      console.log("✓ sponsor_hidden_products table already exists, skipping");
    } else {
      await conn.query(`
        CREATE TABLE sponsor_hidden_products (
          id           INT AUTO_INCREMENT PRIMARY KEY,
          sponsor_id   INT NOT NULL,
          product_id   VARCHAR(128) NOT NULL,
          hidden_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY uq_sponsor_product (sponsor_id, product_id),
          FOREIGN KEY (sponsor_id) REFERENCES sponsors(id) ON DELETE CASCADE
        )
      `);
      console.log("✓ sponsor_hidden_products table created");
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