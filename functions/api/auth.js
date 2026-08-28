/**
 * Cloudflare Pages Function: /api/auth
 * Multi-Tenant Authentication & Session Verification against Cloudflare D1
 */

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store, max-age=0",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    }
  });
}

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

    const stmt = db.prepare("SELECT username, password, display_name, role, brand, is_active FROM app_users WHERE username = ?");
    const user = await stmt.bind(username).first();

    if (!user || user.is_active !== 1) {
      return jsonResponse({ error: "Invalid username or account is inactive." }, 401);
    }

    if (user.password !== password) {
      return jsonResponse({ error: "Invalid password." }, 401);
    }

    return jsonResponse({
      success: true,
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
