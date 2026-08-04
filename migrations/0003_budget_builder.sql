ALTER TABLE monthly_budgets ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS monthly_budget_settings (
  month_key TEXT PRIMARY KEY,
  spending_limit REAL NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  updated_by TEXT
);

INSERT OR IGNORE INTO monthly_budget_settings (month_key, spending_limit, updated_at, updated_by)
SELECT month_key, SUM(target), MAX(updated_at), MAX(updated_by)
FROM monthly_budgets
GROUP BY month_key;
