/**
 * Cloudflare Pages Function: /api/tables
 * Dynamic CRUD for Restaurant Tables per Brand with Cloudflare D1
 */

function jsonResponse(data, status = 200) {
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

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    }
  });
}

/**
 * GET /api/tables?brand=KCA
 */
export async function onRequestGet({ request, env }) {
  try {
    const db = env.DB;
    if (!db) {
      return jsonResponse({ error: "D1 Database binding (DB) is not configured." }, 503);
    }

    const url = new URL(request.url);
    const brand = (url.searchParams.get("brand") || "").trim().toUpperCase();

    let sql = "SELECT id, brand, table_number, is_active, sort_order FROM restaurant_tables WHERE is_active = 1";
    const params = [];

    if (brand && brand !== "ALL") {
      sql += " AND brand = ?";
      params.push(brand);
    }

    sql += " ORDER BY brand ASC, sort_order ASC, CAST(table_number AS INTEGER) ASC, table_number ASC";

    const stmt = params.length > 0 ? db.prepare(sql).bind(...params) : db.prepare(sql);
    const { results } = await stmt.all();

    return jsonResponse({
      success: true,
      count: (results || []).length,
      tables: results || []
    });
  } catch (error) {
    return jsonResponse({ error: error.message || "Failed to fetch tables" }, 500);
  }
}

/**
 * POST /api/tables
 * Body: { brand, tableNumber, sortOrder } OR { brand, tableNumbers: [...] }
 */
export async function onRequestPost({ request, env }) {
  try {
    const db = env.DB;
    if (!db) {
      return jsonResponse({ error: "D1 Database binding (DB) is not configured." }, 503);
    }

    const payload = await request.json();
    const brand = String(payload.brand || "").trim().toUpperCase();

    if (!brand || (brand !== "KCA" && brand !== "KTB")) {
      return jsonResponse({ error: "Valid brand (KCA or KTB) is required." }, 400);
    }

    // Single table addition or batch addition
    const tableNumbers = Array.isArray(payload.tableNumbers)
      ? payload.tableNumbers
      : payload.tableNumber
      ? [payload.tableNumber]
      : [];

    if (tableNumbers.length === 0) {
      return jsonResponse({ error: "At least one table number is required." }, 400);
    }

    const statements = [];
    for (const rawNumber of tableNumbers) {
      const num = String(rawNumber).trim();
      if (!num) continue;
      const id = `${brand}_${num.replace(/\s+/g, "")}`;
      const sortOrder = Number(payload.sortOrder) || (Number.parseInt(num, 10) || 0);

      statements.push(
        db
          .prepare(
            `INSERT INTO restaurant_tables (id, brand, table_number, is_active, sort_order, updated_at)
             VALUES (?, ?, ?, 1, ?, datetime('now'))
             ON CONFLICT(brand, table_number) DO UPDATE SET
               is_active = 1,
               sort_order = excluded.sort_order,
               updated_at = datetime('now')`
          )
          .bind(id, brand, num, sortOrder)
      );
    }

    if (statements.length > 0) {
      await db.batch(statements);
    }

    return jsonResponse({
      success: true,
      message: `Successfully saved ${statements.length} table(s) for ${brand}.`
    });
  } catch (error) {
    return jsonResponse({ error: error.message || "Failed to save table" }, 500);
  }
}

/**
 * PUT /api/tables
 * Body: { id, brand, oldTableNumber, newTableNumber, isActive, sortOrder }
 */
export async function onRequestPut({ request, env }) {
  try {
    const db = env.DB;
    if (!db) {
      return jsonResponse({ error: "D1 Database binding (DB) is not configured." }, 503);
    }

    const payload = await request.json();
    const brand = String(payload.brand || "").trim().toUpperCase();
    const oldTableNumber = String(payload.oldTableNumber || "").trim();
    const newTableNumber = String(payload.newTableNumber || payload.tableNumber || oldTableNumber).trim();

    if (!brand || !oldTableNumber || !newTableNumber) {
      return jsonResponse({ error: "Brand, oldTableNumber, and newTableNumber are required." }, 400);
    }

    const newId = `${brand}_${newTableNumber.replace(/\s+/g, "")}`;
    const sortOrder = Number(payload.sortOrder) || (Number.parseInt(newTableNumber, 10) || 0);
    const isActive = payload.isActive !== undefined ? (payload.isActive ? 1 : 0) : 1;

    // Delete old record if table number changed, then insert/update new
    if (oldTableNumber !== newTableNumber) {
      await db.prepare("DELETE FROM restaurant_tables WHERE brand = ? AND table_number = ?").bind(brand, oldTableNumber).run();
    }

    await db
      .prepare(
        `INSERT INTO restaurant_tables (id, brand, table_number, is_active, sort_order, updated_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(brand, table_number) DO UPDATE SET
           is_active = excluded.is_active,
           sort_order = excluded.sort_order,
           updated_at = datetime('now')`
      )
      .bind(newId, brand, newTableNumber, isActive, sortOrder)
      .run();

    return jsonResponse({
      success: true,
      message: `Table ${oldTableNumber} updated to ${newTableNumber} for ${brand}.`
    });
  } catch (error) {
    return jsonResponse({ error: error.message || "Failed to update table" }, 500);
  }
}

/**
 * DELETE /api/tables
 * Body: { brand, tableNumber }
 */
export async function onRequestDelete({ request, env }) {
  try {
    const db = env.DB;
    if (!db) {
      return jsonResponse({ error: "D1 Database binding (DB) is not configured." }, 503);
    }

    const payload = await request.json();
    const brand = String(payload.brand || "").trim().toUpperCase();
    const tableNumber = String(payload.tableNumber || "").trim();

    if (!brand || !tableNumber) {
      return jsonResponse({ error: "Brand and tableNumber are required." }, 400);
    }

    await db
      .prepare("DELETE FROM restaurant_tables WHERE brand = ? AND table_number = ?")
      .bind(brand, tableNumber)
      .run();

    return jsonResponse({
      success: true,
      message: `Table ${tableNumber} removed from ${brand}.`
    });
  } catch (error) {
    return jsonResponse({ error: error.message || "Failed to delete table" }, 500);
  }
}
