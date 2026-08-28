/**
 * Cloudflare Pages Function Auth & Web Crypto Utility
 * Native Web Crypto API for Password Hashing and HMAC-SHA256 JWT Token Signing
 */

const DEFAULT_JWT_SECRET = "breakfast-nextgen-secret-key-2026";

function base64UrlEncode(str) {
  const base64 = btoa(str);
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(str) {
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) {
    base64 += "=";
  }
  return atob(base64);
}

function bufferToBase64Url(buf) {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return base64UrlEncode(binary);
}

/**
 * Hash password with Web Crypto SHA-256 + Salt
 */
export async function hashPassword(password, salt = "") {
  const effectiveSalt = salt || crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  const enc = new TextEncoder();
  const data = enc.encode(`${effectiveSalt}:${password}`);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashHex = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `sha256:${effectiveSalt}:${hashHex}`;
}

/**
 * Verify input password against stored password (supports sha256 hash or plaintext fallback)
 */
export async function verifyPassword(inputPassword, storedPassword) {
  if (!storedPassword || !inputPassword) return false;

  if (storedPassword.startsWith("sha256:")) {
    const parts = storedPassword.split(":");
    if (parts.length === 3) {
      const salt = parts[1];
      const expectedHash = await hashPassword(inputPassword, salt);
      return expectedHash === storedPassword;
    }
  }

  // Plaintext comparison fallback (for initial seeds)
  return inputPassword === storedPassword;
}

/**
 * Sign JWT Token using Web Crypto HMAC-SHA256
 */
export async function signJwt(payload, secret = DEFAULT_JWT_SECRET) {
  const header = { alg: "HS256", typ: "JWT" };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const fullPayload = {
    ...payload,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 86400 * 7 // 7 days expiration
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(fullPayload));
  const dataToSign = `${encodedHeader}.${encodedPayload}`;

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("HMAC", key, enc.encode(dataToSign));
  const encodedSignature = bufferToBase64Url(signature);

  return `${dataToSign}.${encodedSignature}`;
}

/**
 * Verify JWT Token using Web Crypto HMAC-SHA256
 */
export async function verifyJwt(token, secret = DEFAULT_JWT_SECRET) {
  try {
    if (!token || typeof token !== "string") return null;
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const [encodedHeader, encodedPayload, encodedSignature] = parts;
    const dataToSign = `${encodedHeader}.${encodedPayload}`;

    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    // Convert base64Url signature back to buffer
    const binary = base64UrlDecode(encodedSignature);
    const sigBytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      sigBytes[i] = binary.charCodeAt(i);
    }

    const isValid = await crypto.subtle.verify("HMAC", key, sigBytes, enc.encode(dataToSign));
    if (!isValid) return null;

    const payload = JSON.parse(base64UrlDecode(encodedPayload));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return null; // Expired
    }

    return payload;
  } catch (err) {
    return null;
  }
}

/**
 * Extract Authorization header or query token
 */
export function extractBearerToken(request) {
  const authHeader = request.headers.get("Authorization") || "";
  if (authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7).trim();
  }
  const url = new URL(request.url);
  return url.searchParams.get("token") || "";
}

/**
 * Verify request authentication and role/brand
 */
export async function authenticateRequest(request, env) {
  const token = extractBearerToken(request);
  if (!token) {
    return { authenticated: false, error: "Missing authentication token" };
  }

  const secret = env.JWT_SECRET || DEFAULT_JWT_SECRET;
  const payload = await verifyJwt(token, secret);
  if (!payload) {
    return { authenticated: false, error: "Invalid or expired token" };
  }

  return {
    authenticated: true,
    user: payload
  };
}

export function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store, max-age=0",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    }
  });
}
