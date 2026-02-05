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

// REMOVED: Duplicate database connection
// loginModel.js already creates the DB connection
// No need to create another one here

const app = express();
app.use(cors());
app.use(express.json());

// REMOVED: app.set("db", db);
// Use the db from loginModel instead

app.use("/api/register", registerRoutes);
app.use("/api/login", loginRoutes);

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