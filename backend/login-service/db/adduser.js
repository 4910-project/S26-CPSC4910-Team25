const sqlite3 = require("sqlite3").verbose();
const path = require('path');
require('dotenv').config();
const { hashPassword } = require("../utils/hash");

// Use the same path as server!
const dbPath = process.env.DATABASE_PATH || path.join(__dirname, './login.sqlite');
console.log(`Adding user to: ${dbPath}`);

(async () => {
  const db = new sqlite3.Database(dbPath);

  const username = "admin";
  const email = "admin@email.com";
  const password = await hashPassword("password123");

  db.run("INSERT INTO users (username, email, password) VALUES (?, ?, ?)", [username, email, password], (err) => {
    if (err) console.error("Error:", err);
    else console.log("Admin user created successfully.");
    db.close();
  });
})();