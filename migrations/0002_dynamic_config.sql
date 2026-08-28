-- Migration 0002: Dynamic Configuration, Multi-Tenant Users, and Table Management

-- 1. App Users Table
CREATE TABLE IF NOT EXISTS app_users (
  username TEXT PRIMARY KEY,
  password TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'brand_admin', -- 'superadmin' or 'brand_admin'
  brand TEXT NOT NULL DEFAULT 'ALL',        -- 'KCA', 'KTB', or 'ALL'
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Seed initial users
INSERT OR IGNORE INTO app_users (username, password, display_name, role, brand)
VALUES 
  ('SUPERADMIN', 'SUPERadmin2026', 'General System Admin', 'superadmin', 'ALL'),
  ('KCA', 'KCAadmin', 'KCA Hotel Host', 'brand_admin', 'KCA'),
  ('KTB', 'KTBadmin', 'KTB Hotel Host', 'brand_admin', 'KTB');

-- 2. Restaurant Tables Table
CREATE TABLE IF NOT EXISTS restaurant_tables (
  id TEXT PRIMARY KEY,
  brand TEXT NOT NULL,
  table_number TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(brand, table_number)
);

CREATE INDEX IF NOT EXISTS idx_tables_brand ON restaurant_tables(brand);
CREATE INDEX IF NOT EXISTS idx_tables_brand_active ON restaurant_tables(brand, is_active);

-- Seed KCA Tables (1 to 90)
INSERT OR IGNORE INTO restaurant_tables (id, brand, table_number, sort_order) VALUES
  ('KCA_1', 'KCA', '1', 1), ('KCA_2', 'KCA', '2', 2), ('KCA_3', 'KCA', '3', 3), ('KCA_4', 'KCA', '4', 4), ('KCA_5', 'KCA', '5', 5),
  ('KCA_6', 'KCA', '6', 6), ('KCA_7', 'KCA', '7', 7), ('KCA_8', 'KCA', '8', 8), ('KCA_9', 'KCA', '9', 9), ('KCA_10', 'KCA', '10', 10),
  ('KCA_11', 'KCA', '11', 11), ('KCA_12', 'KCA', '12', 12), ('KCA_13', 'KCA', '13', 13), ('KCA_14', 'KCA', '14', 14), ('KCA_15', 'KCA', '15', 15),
  ('KCA_16', 'KCA', '16', 16), ('KCA_17', 'KCA', '17', 17), ('KCA_18', 'KCA', '18', 18), ('KCA_19', 'KCA', '19', 19), ('KCA_20', 'KCA', '20', 20),
  ('KCA_21', 'KCA', '21', 21), ('KCA_22', 'KCA', '22', 22), ('KCA_23', 'KCA', '23', 23), ('KCA_24', 'KCA', '24', 24), ('KCA_25', 'KCA', '25', 25),
  ('KCA_26', 'KCA', '26', 26), ('KCA_27', 'KCA', '27', 27), ('KCA_28', 'KCA', '28', 28), ('KCA_29', 'KCA', '29', 29), ('KCA_30', 'KCA', '30', 30),
  ('KCA_31', 'KCA', '31', 31), ('KCA_32', 'KCA', '32', 32), ('KCA_33', 'KCA', '33', 33), ('KCA_34', 'KCA', '34', 34), ('KCA_35', 'KCA', '35', 35),
  ('KCA_36', 'KCA', '36', 36), ('KCA_37', 'KCA', '37', 37), ('KCA_38', 'KCA', '38', 38), ('KCA_39', 'KCA', '39', 39), ('KCA_40', 'KCA', '40', 40),
  ('KCA_41', 'KCA', '41', 41), ('KCA_42', 'KCA', '42', 42), ('KCA_43', 'KCA', '43', 43), ('KCA_44', 'KCA', '44', 44), ('KCA_45', 'KCA', '45', 45),
  ('KCA_46', 'KCA', '46', 46), ('KCA_47', 'KCA', '47', 47), ('KCA_48', 'KCA', '48', 48), ('KCA_49', 'KCA', '49', 49), ('KCA_50', 'KCA', '50', 50),
  ('KCA_51', 'KCA', '51', 51), ('KCA_52', 'KCA', '52', 52), ('KCA_53', 'KCA', '53', 53), ('KCA_54', 'KCA', '54', 54), ('KCA_55', 'KCA', '55', 55),
  ('KCA_56', 'KCA', '56', 56), ('KCA_57', 'KCA', '57', 57), ('KCA_58', 'KCA', '58', 58), ('KCA_59', 'KCA', '59', 59), ('KCA_60', 'KCA', '60', 60),
  ('KCA_61', 'KCA', '61', 61), ('KCA_62', 'KCA', '62', 62), ('KCA_63', 'KCA', '63', 63), ('KCA_64', 'KCA', '64', 64), ('KCA_65', 'KCA', '65', 65),
  ('KCA_66', 'KCA', '66', 66), ('KCA_67', 'KCA', '67', 67), ('KCA_68', 'KCA', '68', 68), ('KCA_69', 'KCA', '69', 69), ('KCA_70', 'KCA', '70', 70),
  ('KCA_71', 'KCA', '71', 71), ('KCA_72', 'KCA', '72', 72), ('KCA_73', 'KCA', '73', 73), ('KCA_74', 'KCA', '74', 74), ('KCA_75', 'KCA', '75', 75),
  ('KCA_76', 'KCA', '76', 76), ('KCA_77', 'KCA', '77', 77), ('KCA_78', 'KCA', '78', 78), ('KCA_79', 'KCA', '79', 79), ('KCA_80', 'KCA', '80', 80),
  ('KCA_81', 'KCA', '81', 81), ('KCA_82', 'KCA', '82', 82), ('KCA_83', 'KCA', '83', 83), ('KCA_84', 'KCA', '84', 84), ('KCA_85', 'KCA', '85', 85),
  ('KCA_86', 'KCA', '86', 86), ('KCA_87', 'KCA', '87', 87), ('KCA_88', 'KCA', '88', 88), ('KCA_89', 'KCA', '89', 89), ('KCA_90', 'KCA', '90', 90);

-- Seed KTB Tables
INSERT OR IGNORE INTO restaurant_tables (id, brand, table_number, sort_order) VALUES
  ('KTB_1', 'KTB', '1', 1), ('KTB_2', 'KTB', '2', 2), ('KTB_3', 'KTB', '3', 3), ('KTB_5', 'KTB', '5', 5), ('KTB_6', 'KTB', '6', 6),
  ('KTB_20', 'KTB', '20', 20), ('KTB_21', 'KTB', '21', 21), ('KTB_22', 'KTB', '22', 22), ('KTB_23', 'KTB', '23', 23), ('KTB_24', 'KTB', '24', 24), ('KTB_25', 'KTB', '25', 25),
  ('KTB_30', 'KTB', '30', 30), ('KTB_31', 'KTB', '31', 31), ('KTB_32', 'KTB', '32', 32), ('KTB_33', 'KTB', '33', 33), ('KTB_34', 'KTB', '34', 34), ('KTB_35', 'KTB', '35', 35), ('KTB_36', 'KTB', '36', 36),
  ('KTB_40', 'KTB', '40', 40), ('KTB_41', 'KTB', '41', 41), ('KTB_42', 'KTB', '42', 42), ('KTB_43', 'KTB', '43', 43),
  ('KTB_50', 'KTB', '50', 50), ('KTB_51', 'KTB', '51', 51), ('KTB_52', 'KTB', '52', 52), ('KTB_53', 'KTB', '53', 53), ('KTB_54', 'KTB', '54', 54), ('KTB_55', 'KTB', '55', 55), ('KTB_56', 'KTB', '56', 56), ('KTB_57', 'KTB', '57', 57), ('KTB_58', 'KTB', '58', 58),
  ('KTB_60', 'KTB', '60', 60), ('KTB_70', 'KTB', '70', 70);
