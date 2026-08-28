-- Schema for Cloudflare D1 Daily Reports Storage with 20-Day retention
CREATE TABLE IF NOT EXISTS daily_reports (
  id TEXT PRIMARY KEY,
  service_date TEXT NOT NULL,
  brand TEXT NOT NULL,
  total_checkins INTEGER NOT NULL DEFAULT 0,
  total_guests INTEGER NOT NULL DEFAULT 0,
  total_payments INTEGER NOT NULL DEFAULT 0,
  total_amount_aed REAL NOT NULL DEFAULT 0,
  report_data TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(service_date, brand)
);

CREATE INDEX IF NOT EXISTS idx_reports_date ON daily_reports(service_date);
CREATE INDEX IF NOT EXISTS idx_reports_brand ON daily_reports(brand);
CREATE INDEX IF NOT EXISTS idx_reports_date_brand ON daily_reports(service_date, brand);
