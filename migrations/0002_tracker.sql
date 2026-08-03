ALTER TABLE transactions ADD COLUMN imported_flow TEXT NOT NULL DEFAULT 'Expense';
ALTER TABLE transactions ADD COLUMN override_bucket TEXT;
ALTER TABLE transactions ADD COLUMN override_flow TEXT;

CREATE TABLE IF NOT EXISTS monthly_budgets (
  month_key TEXT NOT NULL,
  bucket TEXT NOT NULL,
  target REAL NOT NULL DEFAULT 0,
  paced INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  updated_by TEXT,
  PRIMARY KEY (month_key, bucket)
);

CREATE TABLE IF NOT EXISTS upload_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_name TEXT NOT NULL,
  row_count INTEGER NOT NULL,
  added_count INTEGER NOT NULL,
  unchanged_count INTEGER NOT NULL,
  uploaded_at TEXT NOT NULL,
  uploaded_by TEXT
);
