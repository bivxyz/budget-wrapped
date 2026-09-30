ALTER TABLE transactions ADD COLUMN source TEXT NOT NULL DEFAULT 'import';
ALTER TABLE transactions ADD COLUMN created_at TEXT;
ALTER TABLE transactions ADD COLUMN created_by TEXT;
ALTER TABLE transactions ADD COLUMN deleted_at TEXT;
ALTER TABLE monthly_reviews ADD COLUMN revision INTEGER NOT NULL DEFAULT 0;

CREATE TABLE transaction_matches (
  id TEXT PRIMARY KEY,
  manual_key TEXT NOT NULL REFERENCES transactions(txn_key),
  imported_key TEXT NOT NULL REFERENCES transactions(txn_key),
  previous_override TEXT,
  applied_override TEXT,
  linked_at TEXT NOT NULL,
  linked_by TEXT NOT NULL,
  undone_at TEXT
);
CREATE UNIQUE INDEX active_manual_match ON transaction_matches(manual_key) WHERE undone_at IS NULL;
CREATE UNIQUE INDEX active_import_match ON transaction_matches(imported_key) WHERE undone_at IS NULL;

CREATE TABLE monthly_savings_settings (
  month_key TEXT PRIMARY KEY,
  income_cents INTEGER NOT NULL CHECK(income_cents >= 0),
  savings_cents INTEGER NOT NULL CHECK(savings_cents >= 0),
  groceries_baseline_cents INTEGER NOT NULL CHECK(groceries_baseline_cents >= 0),
  restaurants_baseline_cents INTEGER NOT NULL CHECK(restaurants_baseline_cents >= 0),
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);

-- Coverage must be explicitly confirmed by the uploader, never inferred from manual dates.
CREATE TABLE import_coverage (
  upload_event_id INTEGER PRIMARY KEY REFERENCES upload_events(id),
  date_from TEXT NOT NULL,
  date_through TEXT NOT NULL
);

CREATE TRIGGER lock_transaction_insert BEFORE INSERT ON transactions
WHEN EXISTS(SELECT 1 FROM monthly_closeouts WHERE month_key=substr(NEW.date,1,7))
BEGIN SELECT RAISE(ABORT,'Reopen this month before editing transactions.'); END;
CREATE TRIGGER lock_transaction_update BEFORE UPDATE ON transactions
WHEN EXISTS(SELECT 1 FROM monthly_closeouts WHERE month_key IN(substr(OLD.date,1,7),substr(NEW.date,1,7)))
BEGIN SELECT RAISE(ABORT,'Reopen this month before editing transactions.'); END;
CREATE TRIGGER lock_weekly_settings BEFORE INSERT ON monthly_savings_settings
WHEN EXISTS(SELECT 1 FROM monthly_closeouts WHERE month_key=NEW.month_key)
BEGIN SELECT RAISE(ABORT,'Reopen this month before editing its plan.'); END;
CREATE TRIGGER lock_weekly_settings_update BEFORE UPDATE ON monthly_savings_settings
WHEN EXISTS(SELECT 1 FROM monthly_closeouts WHERE month_key=NEW.month_key)
BEGIN SELECT RAISE(ABORT,'Reopen this month before editing its plan.'); END;

CREATE TRIGGER manual_insert_review AFTER INSERT ON transactions WHEN NEW.source='manual'
BEGIN UPDATE monthly_reviews SET reviewed_at=NULL,reviewed_by=NULL,revision=revision+1 WHERE month_key=substr(NEW.date,1,7); END;
CREATE TRIGGER transaction_change_review AFTER UPDATE ON transactions
WHEN NEW.source='manual' OR OLD.override_bucket IS NOT NEW.override_bucket OR OLD.override_flow IS NOT NEW.override_flow
BEGIN UPDATE monthly_reviews SET reviewed_at=NULL,reviewed_by=NULL,revision=revision+1 WHERE month_key IN(substr(OLD.date,1,7),substr(NEW.date,1,7)); END;

CREATE TRIGGER validate_match BEFORE INSERT ON transaction_matches
BEGIN
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM transactions WHERE txn_key=NEW.manual_key AND source='manual' AND deleted_at IS NULL)
    THEN RAISE(ABORT,'Manual entry is no longer available.') END;
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM transactions WHERE txn_key=NEW.imported_key AND source='import' AND override_bucket IS NEW.previous_override)
    THEN RAISE(ABORT,'Imported entry changed. Refresh before matching.') END;
  SELECT CASE WHEN EXISTS(SELECT 1 FROM transactions t JOIN monthly_closeouts c ON c.month_key=substr(t.date,1,7) WHERE t.txn_key IN(NEW.manual_key,NEW.imported_key))
    THEN RAISE(ABORT,'Reopen both months before matching.') END;
END;
CREATE TRIGGER validate_unmatch BEFORE UPDATE ON transaction_matches
WHEN EXISTS(SELECT 1 FROM transactions t JOIN monthly_closeouts c ON c.month_key=substr(t.date,1,7) WHERE t.txn_key IN(OLD.manual_key,OLD.imported_key))
BEGIN SELECT RAISE(ABORT,'Reopen both months before undoing a match.'); END;
CREATE TRIGGER match_review AFTER INSERT ON transaction_matches
BEGIN UPDATE monthly_reviews SET reviewed_at=NULL,reviewed_by=NULL,revision=revision+1 WHERE month_key IN(SELECT substr(date,1,7) FROM transactions WHERE txn_key IN(NEW.manual_key,NEW.imported_key)); END;
CREATE TRIGGER unmatch_review AFTER UPDATE ON transaction_matches
BEGIN UPDATE monthly_reviews SET reviewed_at=NULL,reviewed_by=NULL,revision=revision+1 WHERE month_key IN(SELECT substr(date,1,7) FROM transactions WHERE txn_key IN(NEW.manual_key,NEW.imported_key)); END;

CREATE TRIGGER matched_manual_readonly BEFORE UPDATE ON transactions
WHEN OLD.source='manual' AND EXISTS(SELECT 1 FROM transaction_matches WHERE manual_key=OLD.txn_key AND undone_at IS NULL)
BEGIN SELECT RAISE(ABORT,'Undo the match before editing its manual record.'); END;
CREATE TRIGGER weekly_affordability_insert BEFORE INSERT ON monthly_savings_settings
WHEN NEW.income_cents - NEW.savings_cents < (SELECT COALESCE(SUM(ROUND(target*100)),0) FROM monthly_budgets WHERE month_key=NEW.month_key)
BEGIN SELECT RAISE(ABORT,'Plan exceeds income after savings. Refresh and adjust targets.'); END;
CREATE TRIGGER weekly_affordability_update BEFORE UPDATE ON monthly_savings_settings
WHEN NEW.income_cents - NEW.savings_cents < (SELECT COALESCE(SUM(ROUND(target*100)),0) FROM monthly_budgets WHERE month_key=NEW.month_key)
BEGIN SELECT RAISE(ABORT,'Plan exceeds income after savings. Refresh and adjust targets.'); END;
