import { normalizeText, safeJsonParse } from "./utils.js";
import tablesKcaRaw from "../tables-kca.txt";
import tablesKtbRaw from "../tables-ktb.txt";

const DYNAMIC_TABLES_STORAGE_KEY = "breakfast-dynamic-tables";

export function parseTableList(rawText) {
  const seen = new Set();
  const tables = [];

  String(rawText || "")
    .split(",")
    .map((value) => normalizeText(value))
    .filter(Boolean)
    .forEach((table) => {
      const key = table.toUpperCase().replace(/\s+/g, "");
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      tables.push(table);
    });

  return tables;
}

const DEFAULT_TABLES_BY_BRAND = {
  KCA: parseTableList(tablesKcaRaw),
  KTB: parseTableList(tablesKtbRaw)
};

/**
 * Reads cached dynamic tables from localStorage
 */
function getCachedTables() {
  try {
    const raw = localStorage.getItem(DYNAMIC_TABLES_STORAGE_KEY);
    if (!raw) return null;
    return safeJsonParse(raw, null);
  } catch {
    return null;
  }
}

/**
 * Saves dynamic tables to localStorage for instant offline access
 */
function setCachedTables(tablesObj) {
  try {
    localStorage.setItem(DYNAMIC_TABLES_STORAGE_KEY, JSON.stringify(tablesObj));
  } catch {
    // quota safe
  }
}

/**
 * Returns tables for a given brand from cache/defaults synchronously
 */
export function getTablesForUser(brandOrUser) {
  const brand = String(brandOrUser || "").trim().toUpperCase();
  const cached = getCachedTables();
  if (cached && Array.isArray(cached[brand]) && cached[brand].length > 0) {
    return cached[brand];
  }
  return DEFAULT_TABLES_BY_BRAND[brand] || [];
}

/**
 * Validates whether a table number exists in the hotel brand configuration
 */
export function isValidTableNumber(brandOrUser, tableNumber) {
  const normalized = String(tableNumber || "").trim().toUpperCase();
  if (!normalized) return false;
  const validTables = getTablesForUser(brandOrUser);
  return validTables.some((t) => String(t).trim().toUpperCase() === normalized);
}

/**
 * Asynchronously synchronizes tables from Cloudflare D1 with local cache
 */
export async function syncTablesFromCloud(brand = "") {
  try {
    const url = brand ? `/api/tables?brand=${encodeURIComponent(brand)}` : "/api/tables";
    const res = await fetch(url);
    if (!res.ok) return false;

    const data = await res.json();
    if (!data.success || !Array.isArray(data.tables)) return false;

    const cached = getCachedTables() || { ...DEFAULT_TABLES_BY_BRAND };

    if (brand) {
      cached[brand] = data.tables.map((t) => String(t.table_number));
    } else {
      const kcaTables = data.tables.filter((t) => t.brand === "KCA").map((t) => String(t.table_number));
      const ktbTables = data.tables.filter((t) => t.brand === "KTB").map((t) => String(t.table_number));
      if (kcaTables.length > 0) cached.KCA = kcaTables;
      if (ktbTables.length > 0) cached.KTB = ktbTables;
    }

    setCachedTables(cached);
    return true;
  } catch {
    return false;
  }
}

/**
 * Adds a new table to Cloudflare D1 and updates cache
 */
export async function addTableToCloud(brand, tableNumber, sortOrder) {
  const brandKey = String(brand || "").trim().toUpperCase();
  const num = String(tableNumber || "").trim();

  // Optimistic local update
  const cached = getCachedTables() || { ...DEFAULT_TABLES_BY_BRAND };
  if (!cached[brandKey]) cached[brandKey] = [];
  if (!cached[brandKey].includes(num)) {
    cached[brandKey].push(num);
    setCachedTables(cached);
  }

  try {
    const res = await fetch("/api/tables", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brand: brandKey, tableNumber: num, sortOrder })
    });
    const data = await res.json();
    await syncTablesFromCloud(brandKey);
    return { success: res.ok && data.success, message: data.message || data.error };
  } catch (error) {
    return { success: false, message: error.message };
  }
}

/**
 * Updates an existing table in Cloudflare D1 and updates cache
 */
export async function updateTableInCloud(brand, oldTableNumber, newTableNumber, sortOrder) {
  const brandKey = String(brand || "").trim().toUpperCase();
  const oldNum = String(oldTableNumber || "").trim();
  const newNum = String(newTableNumber || "").trim();

  // Optimistic local update
  const cached = getCachedTables() || { ...DEFAULT_TABLES_BY_BRAND };
  if (cached[brandKey]) {
    cached[brandKey] = cached[brandKey].map((t) => (t === oldNum ? newNum : t));
    setCachedTables(cached);
  }

  try {
    const res = await fetch("/api/tables", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brand: brandKey, oldTableNumber: oldNum, newTableNumber: newNum, sortOrder })
    });
    const data = await res.json();
    await syncTablesFromCloud(brandKey);
    return { success: res.ok && data.success, message: data.message || data.error };
  } catch (error) {
    return { success: false, message: error.message };
  }
}

/**
 * Deletes a table from Cloudflare D1 and updates cache
 */
export async function deleteTableFromCloud(brand, tableNumber) {
  const brandKey = String(brand || "").trim().toUpperCase();
  const num = String(tableNumber || "").trim();

  // Optimistic local update
  const cached = getCachedTables() || { ...DEFAULT_TABLES_BY_BRAND };
  if (cached[brandKey]) {
    cached[brandKey] = cached[brandKey].filter((t) => t !== num);
    setCachedTables(cached);
  }

  try {
    const res = await fetch("/api/tables", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brand: brandKey, tableNumber: num })
    });
    const data = await res.json();
    await syncTablesFromCloud(brandKey);
    return { success: res.ok && data.success, message: data.message || data.error };
  } catch (error) {
    return { success: false, message: error.message };
  }
}
