/**
 * Cloudflare Pages Function: /api/users
 * Super Admin Management of User Credentials and Roles
 */

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store, max-age=0",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    }
  });
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    }
  });
}

/**
 * GET /api/users
 */
export async function onRequestGet({ env }) {
  try {
    const db = env.DB;
    if (!db) {
      return jsonResponse({ error: "D1 Database binding (DB) is not configured." }, 503);
    }

    const { results } = await db
      .prepare("SELECT username, display_name, role, brand, is_active, created_at, updated_at FROM app_users ORDER BY role DESC, username ASC")
      .all();

    return jsonResponse({
      success: true,
      users: results || []
    });
  } catch (error) {
    return jsonResponse({ error: error.message || "Failed to fetch users" }, 500);
  }
}

/**
 * POST /api/users
 * Update user password or status
 */
export async function onRequestPost({ request, env }) {
  try {
    const db = env.DB;
    if (!db) {
      return jsonResponse({ error: "D1 Database binding (DB) is not configured." }, 503);
    }

    const payload = await request.json();
    const username = String(payload.username || "").trim().toUpperCase();
    const newPassword = String(payload.password || "").trim();

    if (!username) {
      return jsonResponse({ error: "Username is required." }, 400);
    }

    if (newPassword) {
      await db
        .prepare("UPDATE app_users SET password = ?, updated_at = datetime('now') WHERE username = ?")
        .bind(newPassword, username)
        .run();
    }

    if (payload.isActive !== undefined) {
      const activeVal = payload.isActive ? 1 : 0;
      await db
        .prepare("UPDATE app_users SET is_active = ?, updated_at = datetime('now') WHERE username = ?")
        .bind(activeVal, username)
        .run();
    }

    return jsonResponse({
      success: true,
      message: `User ${username} updated successfully.`
    });
  } catch (error) {
    return jsonResponse({ error: error.message || "Failed to update user" }, 500);
  }
}
