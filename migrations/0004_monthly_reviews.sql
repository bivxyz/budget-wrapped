CREATE TABLE IF NOT EXISTS monthly_reviews (
  month_key TEXT PRIMARY KEY,
  upload_event_id INTEGER NOT NULL,
  reviewed_at TEXT,
  reviewed_by TEXT
);

