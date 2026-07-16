const USERS = {
  KCA: "KCAadmin",
  KTB: "KTBadmin"
};

const AUTH_KEY = "breakfast-auth-user";

export function login(username, password) {
  const normalizedUsername = String(username || "").trim().toUpperCase();
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
