const sqlite3 = require('sqlite3').verbose();
require('dotenv').config();

const dbPath = process.env.DATABASE_PATH || './login.sqlite';
console.log(`Checking database: ${dbPath}`);

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Cannot open database:', err);
  } else {
    console.log('Database opened successfully');
    
    db.all("SELECT name FROM sqlite_master WHERE type='table'", [], (err, tables) => {
      if (err) {
        console.error('Error listing tables:', err);
      } else {
        console.log('Tables found:', tables);
      }
      db.close();
    });
  }
});