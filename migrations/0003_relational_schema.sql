-- Migration 0003: Relational Architecture, Discrete Check-in & Payment Events, and Audit Trail

-- 1. Daily Sessions Table (One session per brand per operational day)
CREATE TABLE IF NOT EXISTS daily_sessions (
  id TEXT PRIMARY KEY,                       -- e.g. 'KCA_2026-08-28'
  brand TEXT NOT NULL,                       -- 'KCA', 'KTB'
  service_date TEXT NOT NULL,                -- 'YYYY-MM-DD'
  opened_by TEXT NOT NULL DEFAULT 'SYSTEM',
  is_closed INTEGER NOT NULL DEFAULT 0,
  closed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(brand, service_date)
);

CREATE INDEX IF NOT EXISTS idx_sessions_brand_date ON daily_sessions(brand, service_date);
CREATE INDEX IF NOT EXISTS idx_sessions_date ON daily_sessions(service_date);

-- 2. Check-in Events Table (Atomic Check-in Mutations)
CREATE TABLE IF NOT EXISTS checkin_events (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  brand TEXT NOT NULL,
  service_date TEXT NOT NULL,
  room_number TEXT,
  guest_name TEXT NOT NULL,
  table_number TEXT NOT NULL,
  adults INTEGER NOT NULL DEFAULT 0,
  children INTEGER NOT NULL DEFAULT 0,
  actual_guests INTEGER NOT NULL DEFAULT 1,
  extra_guests INTEGER NOT NULL DEFAULT 0,
  entitlement_exceeded INTEGER NOT NULL DEFAULT 0,
  guest_type TEXT NOT NULL DEFAULT 'Hotel',            -- 'Hotel', 'Walk-In', 'Apartment', 'Manual'
  meal_plan TEXT,
  products TEXT,
  breakfast_status TEXT NOT NULL DEFAULT 'included',  -- 'included', 'payment', 'unknown'
  status_override INTEGER NOT NULL DEFAULT 0,
  checked_out INTEGER NOT NULL DEFAULT 0,
  checked_out_at TEXT,
  paid INTEGER NOT NULL DEFAULT 0,
  paid_at TEXT,
  device_id TEXT,
  timestamp TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_checkins_session ON checkin_events(session_id);
CREATE INDEX IF NOT EXISTS idx_checkins_brand_date ON checkin_events(brand, service_date);
CREATE INDEX IF NOT EXISTS idx_checkins_table ON checkin_events(brand, table_number, checked_out);
CREATE INDEX IF NOT EXISTS idx_checkins_updated ON checkin_events(updated_at);

-- 3. Payment Events Table (Discrete Payment State)
CREATE TABLE IF NOT EXISTS payment_events (
  id TEXT PRIMARY KEY,                                -- usually matches checkin_id
  checkin_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  brand TEXT NOT NULL,
  service_date TEXT NOT NULL,
  room_number TEXT,
  guest_name TEXT,
  table_number TEXT,
  guest_type TEXT,
  reason TEXT,
  extra_guests INTEGER NOT NULL DEFAULT 0,
  amount_aed REAL NOT NULL DEFAULT 0,
  paid INTEGER NOT NULL DEFAULT 0,
  payment_method TEXT DEFAULT 'FRONT_DESK',
  paid_at TEXT,
  marked_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_payments_session ON payment_events(session_id);
CREATE INDEX IF NOT EXISTS idx_payments_checkin ON payment_events(checkin_id);
CREATE INDEX IF NOT EXISTS idx_payments_paid ON payment_events(brand, paid);

-- 4. Audit Logs Table (Operational Security Trail)
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  brand TEXT NOT NULL,
  username TEXT NOT NULL,
  action TEXT NOT NULL,                               -- 'CHECKIN', 'CHECKOUT', 'PAYMENT', 'TABLE_CHANGE', 'NEW_DAY', 'LOGIN'
  details TEXT,
  ip_address TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_brand_action ON audit_logs(brand, action);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
