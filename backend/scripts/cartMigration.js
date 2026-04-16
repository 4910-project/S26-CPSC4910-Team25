/**
 * Migration: Create driver cart, hidden products, and preferences tables
 * File: backend/scripts/cartMigration.js
 *
 * Run with: node scripts/cartMigration.js
 */

require("dotenv").config({
  path: require("path").join(__dirname, "..", ".env"),
});

const pool = require("../src/db");

async function tableExists(conn, tableName) {
  const [rows] = await conn.query(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [tableName]
  );
  return rows.length > 0;
}

async function run() {
  const conn = await pool.getConnection();
  try {
    console.log("Running migration: create cart, hidden products, and preferences tables...\n");

    // ── driver_cart ──────────────────────────────────────────────────────────
    if (await tableExists(conn, "driver_cart")) {
      console.log("✓ driver_cart already exists, skipping");
    } else {
      await conn.query(`
        CREATE TABLE driver_cart (
          id              INT          NOT NULL AUTO_INCREMENT,
          driver_user_id  INT          NOT NULL,
          product_id      VARCHAR(128) NOT NULL,
          product_name    VARCHAR(500) NOT NULL,
          artist_name     VARCHAR(255) NULL,
          artwork_url     VARCHAR(1000) NULL,
          price           DECIMAL(8,2) NULL,
          points_cost     INT          NOT NULL DEFAULT 0,
          media_type      VARCHAR(100) NULL,
          added_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          UNIQUE KEY uq_cart_driver_product (driver_user_id, product_id),
          CONSTRAINT fk_cart_driver_user
            FOREIGN KEY (driver_user_id) REFERENCES users(id) ON DELETE CASCADE
        )
      `);
      console.log("✓ driver_cart table created");
    }

    // ── driver_hidden_products ───────────────────────────────────────────────
    if (await tableExists(conn, "driver_hidden_products")) {
      console.log("✓ driver_hidden_products already exists, skipping");
    } else {
      await conn.query(`
        CREATE TABLE driver_hidden_products (
          id              INT          NOT NULL AUTO_INCREMENT,
          driver_user_id  INT          NOT NULL,
          product_id      VARCHAR(128) NOT NULL,
          product_name    VARCHAR(500) NULL,
          artist_name     VARCHAR(255) NULL,
          artwork_url     VARCHAR(1000) NULL,
          price           DECIMAL(8,2) NULL,
          hidden_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          UNIQUE KEY uq_hidden_driver_product (driver_user_id, product_id),
          CONSTRAINT fk_dhp_driver_user
            FOREIGN KEY (driver_user_id) REFERENCES users(id) ON DELETE CASCADE
        )
      `);
      console.log("✓ driver_hidden_products table created");
    }

    // ── driver_preferences ───────────────────────────────────────────────────
    if (await tableExists(conn, "driver_preferences")) {
      console.log("✓ driver_preferences already exists, skipping");
    } else {
      await conn.query(`
        CREATE TABLE driver_preferences (
          id              INT      NOT NULL AUTO_INCREMENT,
          driver_user_id  INT      NOT NULL,
          dnd_enabled     TINYINT  NOT NULL DEFAULT 0,
          updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          UNIQUE KEY uq_prefs_driver (driver_user_id),
          CONSTRAINT fk_prefs_driver_user
            FOREIGN KEY (driver_user_id) REFERENCES users(id) ON DELETE CASCADE
        )
      `);
      console.log("✓ driver_preferences table created");
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
