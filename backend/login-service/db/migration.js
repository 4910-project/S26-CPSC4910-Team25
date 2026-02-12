const sqlite3 = require('sqlite3').verbose();
const path = require('path');
require('dotenv').config();

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, 'login.sqlite');
console.log(`Migrating database at: ${dbPath}`);

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Connection error:', err.message);
    process.exit(1);
  } else {
    console.log('Connected to database for migration.');
  }
});

db.serialize(() => {
  // 1. Add role column to users table
  console.log('Adding role column to users table...');
  db.run(`
    ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'DRIVER' CHECK(role IN ('DRIVER', 'SPONSOR', 'ADMIN'))
  `, (err) => {
    if (err && !err.message.includes('duplicate column')) {
      console.error('Error adding role column:', err.message);
    } else {
      console.log('✓ Role column added/exists');
    }
  });

  // 2. Create driver_profiles table
  console.log('Creating driver_profiles table...');
  db.run(`
    CREATE TABLE IF NOT EXISTS driver_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER UNIQUE NOT NULL,
      first_name TEXT,
      last_name TEXT,
      phone TEXT,
      license_number TEXT,
      address TEXT,
      city TEXT,
      state TEXT,
      zip_code TEXT,
      sponsor_id INTEGER,
      points INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (sponsor_id) REFERENCES sponsor_profiles(id) ON DELETE SET NULL
    )
  `, (err) => {
    if (err) {
      console.error('Error creating driver_profiles:', err.message);
    } else {
      console.log('✓ driver_profiles table created');
    }
  });

  // 3. Create sponsor_profiles table
  console.log('Creating sponsor_profiles table...');
  db.run(`
    CREATE TABLE IF NOT EXISTS sponsor_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER UNIQUE NOT NULL,
      company_name TEXT NOT NULL,
      contact_name TEXT,
      phone TEXT,
      address TEXT,
      city TEXT,
      state TEXT,
      zip_code TEXT,
      point_value REAL DEFAULT 0.01,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `, (err) => {
    if (err) {
      console.error('Error creating sponsor_profiles:', err.message);
    } else {
      console.log('✓ sponsor_profiles table created');
    }
  });

  // 4. Create password_reset_tokens table
  console.log('Creating password_reset_tokens table...');
  db.run(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token TEXT UNIQUE NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      used INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `, (err) => {
    if (err) {
      console.error('Error creating password_reset_tokens:', err.message);
    } else {
      console.log('✓ password_reset_tokens table created');
    }
  });

  // 5. Create audit_log table for password changes
  console.log('Creating audit_log table...');
  db.run(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      action_type TEXT NOT NULL,
      details TEXT,
      ip_address TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `, (err) => {
    if (err) {
      console.error('Error creating audit_log:', err.message);
    } else {
      console.log('✓ audit_log table created');
    }
  });

  // 6. Create triggers for updated_at
  console.log('Creating triggers...');
  
  db.run(`
    CREATE TRIGGER IF NOT EXISTS update_driver_timestamp 
    AFTER UPDATE ON driver_profiles
    BEGIN
      UPDATE driver_profiles SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;
  `);

  db.run(`
    CREATE TRIGGER IF NOT EXISTS update_sponsor_timestamp 
    AFTER UPDATE ON sponsor_profiles
    BEGIN
      UPDATE sponsor_profiles SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;
  `);

  console.log('✓ Triggers created');

  // Verify tables
  db.all("SELECT name FROM sqlite_master WHERE type='table'", [], (err, tables) => {
    if (err) {
      console.error('Error checking tables:', err);
    } else {
      console.log('\n=== Database Tables ===');
      tables.forEach(table => console.log(`  - ${table.name}`));
      console.log('\n✅ Migration completed successfully!');
    }
    db.close();
  });
});