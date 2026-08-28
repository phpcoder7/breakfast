import { safeJsonParse } from "./utils.js";

const DEFAULT_USERS = {
  SUPERADMIN: {
    password: "SUPERadmin2026",
    displayName: "General System Admin",
    role: "superadmin",
    brand: "ALL"
  },
  KCA: {
    password: "KCAadmin",
    displayName: "KCA Hotel Host",
    role: "brand_admin",
    brand: "KCA"
  },
  KTB: {
    password: "KTBadmin",
    displayName: "KTB Hotel Host",
    role: "brand_admin",
    brand: "KTB"
  }
};

const BRAND_LOGOS = {
  KCA: "./assets/logos/kca.svg",
  KTB: "./assets/logos/ktb.svg",
  ALL: "./assets/favicon.svg"
};

const AUTH_USER_KEY = "breakfast-auth-user";
const AUTH_PROFILE_KEY = "breakfast-auth-profile";
const ACTIVE_BRAND_KEY = "breakfast-active-brand";

export function normalizeUsername(username) {
  return String(username || "").trim().toUpperCase();
}

export function getBrandLogo(brandOrUser) {
  const key = normalizeUsername(brandOrUser);
  return BRAND_LOGOS[key] || BRAND_LOGOS.KCA;
}

/**
 * Attempts login with local fallback first, then tries Cloudflare D1 Auth API
 */
export async function login(username, password) {
  const normalizedUsername = normalizeUsername(username);

  // 1. Try remote D1 authentication if online
  try {
    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: normalizedUsername, password })
    });

    if (res.ok) {
      const data = await res.json();
      if (data.success && data.user) {
        saveSession(data.user);
        return { success: true, user: data.user };
      }
    }
  } catch {
    // network failure / offline fallback
  }

  // 2. Offline / local fallback check
  const fallback = DEFAULT_USERS[normalizedUsername];
  if (fallback && fallback.password === password) {
    const user = {
      username: normalizedUsername,
      displayName: fallback.displayName,
      role: fallback.role,
      brand: fallback.brand
    };
    saveSession(user);
    return { success: true, user };
  }

  return { success: false, error: "Invalid username or password." };
}

function saveSession(user) {
  sessionStorage.setItem(AUTH_USER_KEY, user.username);
  sessionStorage.setItem(AUTH_PROFILE_KEY, JSON.stringify(user));

  // If Super Admin, default active brand to KCA unless previously selected
  if (user.role === "superadmin") {
    const currentActive = sessionStorage.getItem(ACTIVE_BRAND_KEY);
    if (!currentActive || currentActive === "ALL") {
      sessionStorage.setItem(ACTIVE_BRAND_KEY, "KCA");
    }
  } else {
    sessionStorage.setItem(ACTIVE_BRAND_KEY, user.brand);
  }
}

export function logout() {
  sessionStorage.removeItem(AUTH_USER_KEY);
  sessionStorage.removeItem(AUTH_PROFILE_KEY);
  sessionStorage.removeItem(ACTIVE_BRAND_KEY);
}

export function isLoggedIn() {
  return Boolean(sessionStorage.getItem(AUTH_USER_KEY));
}

export function getCurrentUser() {
  return sessionStorage.getItem(AUTH_USER_KEY) || "";
}

export function getCurrentUserProfile() {
  const raw = sessionStorage.getItem(AUTH_PROFILE_KEY);
  if (!raw) return null;
  return safeJsonParse(raw, null);
}

export function isSuperAdmin() {
  const profile = getCurrentUserProfile();
  return profile?.role === "superadmin";
}

export function getActiveBrand() {
  const active = sessionStorage.getItem(ACTIVE_BRAND_KEY);
  if (active) return active;
  const profile = getCurrentUserProfile();
  return profile?.brand && profile.brand !== "ALL" ? profile.brand : "KCA";
}

export function setActiveBrand(brand) {
  const normalized = normalizeUsername(brand);
  if (normalized === "KCA" || normalized === "KTB") {
    sessionStorage.setItem(ACTIVE_BRAND_KEY, normalized);
  }
}

export function canManageBrand(brand) {
  if (isSuperAdmin()) return true;
  const profile = getCurrentUserProfile();
  return profile?.brand === normalizeUsername(brand);
}
