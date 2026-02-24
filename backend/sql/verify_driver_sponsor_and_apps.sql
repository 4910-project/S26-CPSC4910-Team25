USE Team25_DB;

-- Set these IDs for your environment before running.
SET @driver_user_id = 0;
SET @sponsor_id = 0;
SET @application_id = 0;

-- 10654, 10655, 15067, 15068:
-- Driver current sponsor + joined_on.
SELECT
  d.user_id AS driverUserId,
  d.sponsor_id AS sponsorId,
  s.name AS sponsorName,
  s.status AS sponsorStatus,
  d.joined_on AS joinedOn
FROM drivers d
JOIN sponsors s ON s.id = d.sponsor_id
WHERE d.user_id = @driver_user_id
  AND d.status = 'ACTIVE';

-- 10733, 15069:
-- Sponsor org details read-only fields.
SELECT
  id AS sponsorId,
  name AS sponsorName,
  status AS sponsorStatus,
  address,
  contact_name AS contactName,
  contact_email AS contactEmail,
  contact_phone AS contactPhone
FROM sponsors
WHERE id = @sponsor_id;

-- 10743, 15070:
-- Pending applications list for sponsor.
SELECT
  id AS applicationId,
  driver_user_id AS driverUserId,
  sponsor_id AS sponsorId,
  status,
  applied_at AS appliedAt,
  decided_at AS decidedAt,
  decided_by_user_id AS decidedBy
FROM driver_applications
WHERE sponsor_id = @sponsor_id
  AND status = 'PENDING'
ORDER BY applied_at DESC;

-- 10743, 15070:
-- Verify a single application after approve/reject.
SELECT
  id AS applicationId,
  driver_user_id AS driverUserId,
  sponsor_id AS sponsorId,
  status,
  applied_at AS appliedAt,
  decided_at AS decidedAt,
  decided_by_user_id AS decidedBy
FROM driver_applications
WHERE id = @application_id;

-- 10745, 15071:
-- Sponsor drivers list (all non-pending relationship states).
SELECT
  d.id AS driverId,
  SUBSTRING_INDEX(u.email, '@', 1) AS name,
  u.email,
  LOWER(d.status) AS status,
  d.joined_on AS joinedOn
FROM drivers d
JOIN users u ON u.id = d.user_id
WHERE d.sponsor_id = @sponsor_id
ORDER BY d.id DESC;

-- 10745, 15071:
-- Filter active.
SELECT
  d.id AS driverId,
  SUBSTRING_INDEX(u.email, '@', 1) AS name,
  u.email,
  'active' AS status,
  d.joined_on AS joinedOn
FROM drivers d
JOIN users u ON u.id = d.user_id
WHERE d.sponsor_id = @sponsor_id
  AND d.status = 'ACTIVE'
ORDER BY d.id DESC;

-- 10745, 15071:
-- Filter dropped.
SELECT
  d.id AS driverId,
  SUBSTRING_INDEX(u.email, '@', 1) AS name,
  u.email,
  'dropped' AS status,
  d.joined_on AS joinedOn
FROM drivers d
JOIN users u ON u.id = d.user_id
WHERE d.sponsor_id = @sponsor_id
  AND d.status = 'DROPPED'
ORDER BY d.id DESC;

-- 10745, 15071:
-- Filter pending (from applications).
SELECT
  NULL AS driverId,
  SUBSTRING_INDEX(u.email, '@', 1) AS name,
  u.email,
  'pending' AS status,
  NULL AS joinedOn
FROM driver_applications da
JOIN users u ON u.id = da.driver_user_id
WHERE da.sponsor_id = @sponsor_id
  AND da.status = 'PENDING'
ORDER BY da.applied_at DESC;
