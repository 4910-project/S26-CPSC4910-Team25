// loginServer.js

const path = require("path");
require("dotenv").config({ 
  path: path.join(__dirname, ".env"),
  debug: true 
});

// Confirm env is loaded 
console.log("JWT_SECRET:", process.env.JWT_SECRET ? "LOADED" : "MISSING");
console.log("DATABASE_PATH from .env:", process.env.DATABASE_PATH || "Not set");

// db PATH FIX
const dbPath = process.env.DATABASE_PATH 
  ? path.resolve(__dirname, process.env.DATABASE_PATH)
  : path.join(__dirname, "db", "login.sqlite");

console.log("Final DB Path:", dbPath);

const jwt = require("jsonwebtoken");
const express = require("express");
const cors = require("cors");
const loginRoutes = require("./routes/loginRoute");
const registerRoutes = require("./routes/registerRoute");

const sqlite3 = require("sqlite3").verbose();
const accountRoutes = require("./routes/accountRoute");
const profileRoutes = require("./routes/profileRoutes");
const passwordResetRoutes = require("./routes/passwordResetRouts");

// REMOVED: Duplicate database connection
// loginModel.js already creates the DB connection
// No need to create another one here

const app = express();
app.use(cors());
app.use(express.json());

// REMOVED: app.set("db", db);
// Use the db from loginModel instead

const db = new sqlite3.Database(dbPath, (err) => 
{
  if (err) 
  {
    console.error("DB connection error:", err.message);
  } 
  else 
  {
    db.serialize(() => 
    {
      db.run(`ALTER TABLE users ADD COLUMN is_deleted INTEGER DEFAULT 0`, (err) => 
      {
        if (err && !err.message.includes("duplicate column")) console.error("Migration error:", err.message);
        else console.log("is deleted ready");
      });
      db.run(`ALTER TABLE users ADD COLUMN deleted_at TIMESTAMP DEFAULT NULL`, (err) => 
      {
        if (err && !err.message.includes("duplicate column")) console.error("Migration error:", err.message);
        else console.log(" deleted at ready");
      });
      db.run(`ALTER TABLE users ADD COLUMN deleted_by INTEGER DEFAULT NULL`, (err) => 
      {
        if (err && !err.message.includes("duplicate column")) console.error("Migration error:", err.message);
        else console.log("deleted by ready");
      });
    });
  }
});

app.use("/api/register", registerRoutes);
app.use("/api/login", loginRoutes);
app.use("/api/account", accountRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/password-reset", passwordResetRoutes);

app.get("/api/me", (req, res) => 
{
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) 
  {
    return res.status(401).json({ message: "No token provided" });
  }

  const JWT_SECRET = process.env.JWT_SECRET;
  jwt.verify(token, JWT_SECRET, (err, decoded) => 
  {
    if (err) 
    {
      return res.status(403).json({ message: "Invalid token" });
    }

    // Use db from loginModel
    const { db } = require("./models/loginModel");
    db.get(
      "SELECT id, username, email FROM users WHERE id = ?",
      [decoded.id],
      (err, user) => {
        if (err || !user) {
          return res.status(404).json({ message: "User not found" });
        }
        res.json(user);
      }
    );
  });
});

// Only start server if NOT in test mode
const PORT = process.env.PORT || 8001;
if (process.env.NODE_ENV !== 'test') 
{
  app.listen(PORT, () => 
  {
    console.log(`Auth service running on http://localhost:${PORT}`);
  });
}

module.exports = app;