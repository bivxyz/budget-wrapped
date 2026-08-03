CREATE TABLE IF NOT EXISTS transactions (
  txn_key TEXT PRIMARY KEY, date TEXT NOT NULL, amount REAL NOT NULL, name TEXT NOT NULL,
  raw_category TEXT, bucket TEXT, account TEXT, is_income INTEGER NOT NULL DEFAULT 0,
  uploaded_at TEXT NOT NULL, uploaded_by TEXT
);
CREATE INDEX IF NOT EXISTS transactions_date_idx ON transactions(date);
CREATE TABLE IF NOT EXISTS ritual_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  period_type TEXT NOT NULL CHECK(period_type IN ('week', 'month')),
  period_key TEXT NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('uploaded', 'texted', 'completed')),
  actor TEXT, detail TEXT, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ritual_period_idx ON ritual_events(period_type, period_key);
