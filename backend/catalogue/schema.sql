CREATE TABLE IF NOT EXISTS driver_points 
(
  user_id INT PRIMARY KEY,
  points  INT NOT NULL DEFAULT 1000
);

CREATE TABLE IF NOT EXISTS purchases 
(
  id           VARCHAR(64) PRIMARY KEY,
  user_id      INT NOT NULL,
  purchased_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  item_name    VARCHAR(255) NOT NULL,
  artist       VARCHAR(255),
  kind         VARCHAR(64),
  artwork_url  TEXT,
  cost         INT NOT NULL,
  points_after INT,
  track_view_url TEXT
);