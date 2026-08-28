-- Migration 0004: Guest Roster Realtime Multi-Device Synchronization
CREATE TABLE IF NOT EXISTS guest_rosters (
  id TEXT PRIMARY KEY,                       -- e.g. 'KCA_2026-08-28'
  brand TEXT NOT NULL,                       -- 'KCA', 'KTB'
  service_date TEXT NOT NULL,                -- 'YYYY-MM-DD'
  guest_count INTEGER NOT NULL DEFAULT 0,
  roster_data TEXT NOT NULL,                 -- JSON of guests array
  file_names TEXT,                           -- JSON of fileNames { mealPlan, packageForecast }
  files_loaded TEXT,                         -- JSON of filesLoaded { mealPlan, packageForecast }
  updated_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(brand, service_date)
);

CREATE INDEX IF NOT EXISTS idx_rosters_brand_date ON guest_rosters(brand, service_date);
