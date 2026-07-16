export const BREAKFAST_CODES = {
  BFAAD: "Breakfast Adult Add On Package",
  BFAIN: "Breakfast Adult Included in Rate",
  BFCAD: "Breakfast Child Add On Package",
  BFCIN: "Breakfast Child Included in Rate",
  UPSBB1: "Breakfast 1 Person",
  WEB_BFSA: "Breakfast Adult",
  BB: "Breakfast Package",
  CLB: "Club Lounge (Breakfast Included)"
};

export const NO_BREAKFAST_CODES = {
  RO: "Room Only"
};

export const BREAKFAST_STATUS = {
  INCLUDED: "included",
  PAYMENT: "payment",
  UNKNOWN: "unknown"
};

export const GUEST_TYPES = {
  HOTEL: "Hotel",
  WALK_IN: "Walk-In",
  APARTMENT: "Apartment"
};

export const BREAKFAST_PRICE_AED = 150;
export const APARTMENT_PRICE_AED = 120;

export const STORAGE_KEYS = {
  SNAPSHOT: "breakfast-checkin-state"
};

export function normalizeText(value) {
  return String(value ?? "").trim();
}

export function normalizeCode(value) {
  return normalizeText(value).toUpperCase();
}

export function normalizeRoom(value) {
  return normalizeText(value).replace(/\s+/g, "");
}

export function normalizeSearchText(value) {
  return normalizeText(value).toLowerCase();
}

export function roomSearchVariants(value) {
  const room = normalizeRoom(value);
  if (!room) {
    return [];
  }

  const trimmedZeros = room.replace(/^0+/, "");
  return Array.from(new Set([room, trimmedZeros || "0"]));
}

export function parseInteger(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function parseNumber(value, fallback = 0) {
  const parsed = Number(String(value ?? "").trim());
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function uniqueList(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

export function slugify(value) {
  return normalizeSearchText(value).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function todayKey() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function formatDate(value) {
  const text = normalizeText(value);
  if (!text) {
    return "-";
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const [year, month, day] = text.split("-");
    return `${day}/${month}/${year}`;
  }

  const shortOracleDateMatch = text.match(/^(\d{2})-([A-Z]{3})-(\d{2})$/i);
  if (shortOracleDateMatch) {
    const [, day, month, year] = shortOracleDateMatch;
    return `${day}/${month.toUpperCase()}/20${year}`;
  }

  return text;
}

export function formatTime(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

export function toTimestamp(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  return date.toISOString();
}

export function safeJsonParse(value, fallback) {
  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
}

export function readStoredState() {
  const snapshot = localStorage.getItem(STORAGE_KEYS.SNAPSHOT);
  if (!snapshot) {
    return null;
  }

  const parsed = safeJsonParse(snapshot, null);
  if (!parsed || parsed.serviceDate !== todayKey()) {
    return null;
  }

  return parsed;
}

export function writeStoredState(state) {
  localStorage.setItem(STORAGE_KEYS.SNAPSHOT, JSON.stringify(state));
}

export function clearStoredState() {
  localStorage.removeItem(STORAGE_KEYS.SNAPSHOT);
}

export function createId(prefix = "id") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function escapeHtml(value) {
  return normalizeText(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function joinName(firstName, lastName) {
  return normalizeText([firstName, lastName].filter(Boolean).join(" "));
}

export function listToText(values) {
  return uniqueList(values).join(", ") || "-";
}

export function statusMeta(status) {
  switch (status) {
    case BREAKFAST_STATUS.INCLUDED:
      return {
        label: "Breakfast Included",
        className: "status-included"
      };
    case BREAKFAST_STATUS.PAYMENT:
      return {
        label: "Payment Required",
        className: "status-payment"
      };
    default:
      return {
        label: "Unknown Package",
        className: "status-unknown"
      };
  }
}

export function reasonLabel(guestType, breakfastStatus) {
  if (guestType === GUEST_TYPES.WALK_IN) {
    return "Walk-In";
  }

  if (guestType === GUEST_TYPES.APARTMENT) {
    return "Apartment (120 AED — 20% discount)";
  }

  if (breakfastStatus === BREAKFAST_STATUS.PAYMENT) {
    return "Payment Required";
  }

  return "Unknown Package";
}
