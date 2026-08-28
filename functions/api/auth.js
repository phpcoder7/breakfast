/**
 * Cloudflare Pages Function: /api/auth
 * Multi-Tenant Authentication, Web Crypto Password Hashing & Signed JWT Tokens
 */
import {
  hashPassword,
  verifyPassword,
  signJwt,
  jsonResponse
} from "./_authHelper.js";

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    }
  });
}

/**
 * POST /api/auth
 * Body: { username, password }
 */
export async function onRequestPost({ request, env }) {
  try {
    const db = env.DB;
    if (!db) {
      return jsonResponse({ error: "D1 Database binding (DB) is not configured." }, 503);
    }

    const payload = await request.json();
    const username = String(payload.username || "").trim().toUpperCase();
    const password = String(payload.password || "").trim();

    if (!username || !password) {
      return jsonResponse({ error: "Username and password are required." }, 400);
    }

    const stmt = db.prepare(
      "SELECT username, password, display_name, role, brand, is_active FROM app_users WHERE username = ?"
    );
    const user = await stmt.bind(username).first();

    if (!user || user.is_active !== 1) {
      return jsonResponse({ error: "Invalid username or account is inactive." }, 401);
    }

    const isMatch = await verifyPassword(password, user.password);
    if (!isMatch) {
      return jsonResponse({ error: "Invalid password." }, 401);
    }

    // If the stored password was plaintext, opportunistically upgrade to salted hash
    if (!user.password.startsWith("sha256:")) {
      try {
        const hashedPassword = await hashPassword(password);
        await db
          .prepare("UPDATE app_users SET password = ?, updated_at = datetime('now') WHERE username = ?")
          .bind(hashedPassword, username)
          .run();
      } catch (upgradeErr) {
        console.warn("Could not upgrade password hash:", upgradeErr);
      }
    }

    // Issue Cryptographic Signed JWT
    const jwtSecret = env.JWT_SECRET || undefined;
    const token = await signJwt(
      {
        username: user.username,
        displayName: user.display_name,
        role: user.role,
        brand: user.brand
      },
      jwtSecret
    );

    // Record audit login
    try {
      await db
        .prepare("INSERT INTO audit_logs (brand, username, action, details) VALUES (?, ?, 'LOGIN', 'Successful user authentication')")
        .bind(user.brand, user.username)
        .run();
    } catch (auditErr) {
      // Non-fatal
    }

    return jsonResponse({
      success: true,
      token,
      user: {
        username: user.username,
        displayName: user.display_name,
        role: user.role, // 'superadmin' or 'brand_admin'
        brand: user.brand // 'KCA', 'KTB', or 'ALL'
      }
    });
  } catch (error) {
    return jsonResponse({ error: error.message || "Authentication error" }, 500);
  }
}
