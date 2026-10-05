CREATE TABLE message_outbox_next (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK(kind IN ('weekly','weekly-spend','cutback')),
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

INSERT INTO message_outbox_next
  (id,kind,period_key,message_text,idempotency_key,status,requested_at,requested_by,claimed_at,claim_token,sent_at,failed_at,failure)
SELECT id,kind,period_key,message_text,idempotency_key,status,requested_at,requested_by,claimed_at,claim_token,sent_at,failed_at,failure
FROM message_outbox;

DROP TABLE message_outbox;
ALTER TABLE message_outbox_next RENAME TO message_outbox;
CREATE INDEX message_outbox_status_idx ON message_outbox(status, requested_at);
