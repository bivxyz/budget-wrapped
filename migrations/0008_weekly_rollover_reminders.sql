CREATE TABLE weekly_confirmations (
  week_start TEXT PRIMARY KEY,
  week_end TEXT NOT NULL,
  confirmed_at TEXT NOT NULL,
  confirmed_by TEXT NOT NULL
);

CREATE TABLE message_outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK(kind IN ('weekly','cutback')),
  period_key TEXT NOT NULL,
  message_text TEXT NOT NULL,
  idempotency_key TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','sending','sent','failed','uncertain')),
  requested_at TEXT NOT NULL,
  requested_by TEXT NOT NULL,
  claimed_at TEXT,
  claim_token TEXT,
  sent_at TEXT,
  failed_at TEXT,
  failure TEXT
);

CREATE INDEX message_outbox_status_idx ON message_outbox(status, requested_at);
