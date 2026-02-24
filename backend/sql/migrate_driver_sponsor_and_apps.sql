USE Team25_DB;

SET @db_name = DATABASE();

-- Driver joined_on timestamp (10654, 10655, 15067, 15068)
SET @sql = IF(
  (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @db_name
      AND TABLE_NAME = 'drivers'
      AND COLUMN_NAME = 'joined_on'
  ) = 0,
  'ALTER TABLE drivers ADD COLUMN joined_on DATETIME NULL AFTER sponsor_id',
  'SELECT ''drivers.joined_on already exists'''
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Sponsor org fields (10733, 15069)
SET @sql = IF(
  (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @db_name
      AND TABLE_NAME = 'sponsors'
      AND COLUMN_NAME = 'address'
  ) = 0,
  'ALTER TABLE sponsors ADD COLUMN address VARCHAR(255) NULL AFTER name',
  'SELECT ''sponsors.address already exists'''
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @db_name
      AND TABLE_NAME = 'sponsors'
      AND COLUMN_NAME = 'contact_name'
  ) = 0,
  'ALTER TABLE sponsors ADD COLUMN contact_name VARCHAR(255) NULL AFTER address',
  'SELECT ''sponsors.contact_name already exists'''
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @db_name
      AND TABLE_NAME = 'sponsors'
      AND COLUMN_NAME = 'contact_email'
  ) = 0,
  'ALTER TABLE sponsors ADD COLUMN contact_email VARCHAR(255) NULL AFTER contact_name',
  'SELECT ''sponsors.contact_email already exists'''
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @db_name
      AND TABLE_NAME = 'sponsors'
      AND COLUMN_NAME = 'contact_phone'
  ) = 0,
  'ALTER TABLE sponsors ADD COLUMN contact_phone VARCHAR(50) NULL AFTER contact_email',
  'SELECT ''sponsors.contact_phone already exists'''
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Driver application workflow (10743, 15070)
CREATE TABLE IF NOT EXISTS driver_applications (
  id INT NOT NULL AUTO_INCREMENT,
  driver_user_id INT NOT NULL,
  sponsor_id INT NOT NULL,
  status ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
  applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  decided_at DATETIME NULL,
  decided_by_user_id INT NULL,
  PRIMARY KEY (id),
  KEY idx_driver_apps_sponsor_status (sponsor_id, status),
  KEY idx_driver_apps_driver_user (driver_user_id),
  CONSTRAINT fk_driver_apps_driver_user
    FOREIGN KEY (driver_user_id) REFERENCES users(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_driver_apps_sponsor
    FOREIGN KEY (sponsor_id) REFERENCES sponsors(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_driver_apps_decided_by
    FOREIGN KEY (decided_by_user_id) REFERENCES users(id)
    ON DELETE SET NULL
);

-- Participating drivers list filters (10745, 15071)
SET @sql = IF(
  (
    SELECT COUNT(*)
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = @db_name
      AND TABLE_NAME = 'drivers'
      AND INDEX_NAME = 'idx_drivers_sponsor_status'
  ) = 0,
  'ALTER TABLE drivers ADD INDEX idx_drivers_sponsor_status (sponsor_id, status)',
  'SELECT ''idx_drivers_sponsor_status already exists'''
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
