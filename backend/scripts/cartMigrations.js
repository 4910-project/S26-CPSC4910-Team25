/**
 * cartMigration.js
 * Creates: driver_cart, driver_hidden_products, driver_preferences tables.
 * Run once: node scripts/cartMigration.js
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const pool = require("../src/db");

async function run() {
  const conn = await pool.getConnection();
  try {
    console.log("Running cart migration...");

    await conn.query(`
      CREATE TABLE IF NOT EXISTS driver_cart (
        id             INT AUTO_INCREMENT PRIMARY KEY,
        driver_user_id INT NOT NULL,
        product_id     VARCHAR(128) NOT NULL,
        product_name   VARCHAR(255),
        artist_name    VARCHAR(255),
        artwork_url    VARCHAR(512),
        price          DECIMAL(8,2),
        points_cost    INT,
        media_type     VARCHAR(64),
        added_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_driver_cart_product (driver_user_id, product_id)
      )
    `);
    console.log("✓ driver_cart table ready");

    await conn.query(`
      CREATE TABLE IF NOT EXISTS driver_hidden_products (
        id             INT AUTO_INCREMENT PRIMARY KEY,
        driver_user_id INT NOT NULL,
        product_id     VARCHAR(128) NOT NULL,
        product_name   VARCHAR(255),
        artist_name    VARCHAR(255),
        artwork_url    VARCHAR(512),
        price          DECIMAL(8,2),
        hidden_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_driver_hidden (driver_user_id, product_id)
      )
    `);
    console.log("✓ driver_hidden_products table ready");

    await conn.query(`
      CREATE TABLE IF NOT EXISTS driver_preferences (
        id             INT AUTO_INCREMENT PRIMARY KEY,
        driver_user_id INT NOT NULL UNIQUE,
        dnd_enabled    TINYINT(1) NOT NULL DEFAULT 0,
        updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    console.log("✓ driver_preferences table ready");

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