const USERS = {
  KCA: "KCAadmin",
  KTB: "KTBadmin"
};

const BRAND_LOGOS = {
  KCA: "./assets/logos/kca.svg",
  KTB: "./assets/logos/ktb.svg"
};

const AUTH_KEY = "breakfast-auth-user";

export function normalizeUsername(username) {
  return String(username || "").trim().toUpperCase();
}

export function getBrandLogo(username) {
  const key = normalizeUsername(username);
  return BRAND_LOGOS[key] || "";
}

export function login(username, password) {
  const normalizedUsername = normalizeUsername(username);
  const expectedPassword = USERS[normalizedUsername];

  if (!expectedPassword || expectedPassword !== password) {
    return false;
  }

  sessionStorage.setItem(AUTH_KEY, normalizedUsername);
  return true;
}

export function logout() {
  sessionStorage.removeItem(AUTH_KEY);
}

export function isLoggedIn() {
  return Boolean(sessionStorage.getItem(AUTH_KEY));
}

export function getCurrentUser() {
  return sessionStorage.getItem(AUTH_KEY) || "";
}
