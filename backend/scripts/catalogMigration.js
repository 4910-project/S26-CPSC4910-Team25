/**
 * catalogMigration.js
 * Creates the sponsor_hidden_products table.
 * Run once: node scripts/catalogMigration.js
 */
require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const pool = require("../src/db");

async function run() {
  const conn = await pool.getConnection();
  try {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS sponsor_hidden_products (
        id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        sponsor_id    INT NOT NULL,
        product_id    VARCHAR(128) NOT NULL,
        product_name  VARCHAR(255),
        artist_name   VARCHAR(255),
        artwork_url   VARCHAR(512),
        price         DECIMAL(8,2),
        hidden_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_sponsor_product (sponsor_id, product_id),
        CONSTRAINT fk_shp_sponsor FOREIGN KEY (sponsor_id) REFERENCES sponsors(id) ON DELETE CASCADE
      )
    `);
    console.log("sponsor_hidden_products table ready.");
  } finally {
    conn.release();
    process.exit(0);
  }
}

run().catch((err) => { console.error(err); process.exit(1); });