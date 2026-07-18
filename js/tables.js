import { normalizeText } from "./utils.js";
import tablesKcaRaw from "../tables-kca.txt";
import tablesKtbRaw from "../tables-ktb.txt";

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

const TABLES_BY_BRAND = {
  KCA: parseTableList(tablesKcaRaw),
  KTB: parseTableList(tablesKtbRaw)
};

export function getTablesForUser(username) {
  const brand = String(username || "").trim().toUpperCase();
  return TABLES_BY_BRAND[brand] || [];
}
