CREATE TABLE IF NOT EXISTS monthly_closeouts (
  month_key TEXT PRIMARY KEY,
  closed_at TEXT NOT NULL,
  closed_by TEXT
);
