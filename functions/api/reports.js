/**
 * Cloudflare Pages Function: /api/reports
 * Handles daily report archiving, searching, and 20-day automatic retention pruning.
 */

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store, max-age=0",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    }
  });
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    }
  });
}

/**
 * GET /api/reports
 * Query Params:
 *  - brand (e.g. "KCA", "KTB", or "ALL")
 *  - date (e.g. "2026-08-28")
 *  - query (search text for room or guest name)
 *  - full ("true" to include complete report_data payload)
 */
export async function onRequestGet({ request, env }) {
  try {
    const db = env.DB;
    if (!db) {
      return jsonResponse({ error: "D1 Database binding (DB) is not configured." }, 503);
    }

    // Automatically prune reports older than 20 days
    await db.prepare("DELETE FROM daily_reports WHERE service_date < date('now', '-20 days')").run();

    const url = new URL(request.url);
    const brand = (url.searchParams.get("brand") || "").trim().toUpperCase();
    const date = (url.searchParams.get("date") || "").trim();
    const query = (url.searchParams.get("query") || "").trim().toLowerCase();
    const full = url.searchParams.get("full") === "true" || Boolean(date) || Boolean(query);

    let sql = "SELECT id, service_date, brand, total_checkins, total_guests, total_payments, total_amount_aed, created_at, updated_at";
    if (full || query) {
      sql += ", report_data";
    }
    sql += " FROM daily_reports WHERE 1=1";

    const params = [];
    if (brand && brand !== "ALL") {
      sql += " AND brand = ?";
      params.push(brand);
    }
    if (date) {
      sql += " AND service_date = ?";
      params.push(date);
    }

    sql += " ORDER BY service_date DESC, brand ASC LIMIT 40";

    const stmt = params.length > 0 ? db.prepare(sql).bind(...params) : db.prepare(sql);
    const { results } = await stmt.all();

    let formatted = (results || []).map((row) => {
      let parsedData = null;
      if (row.report_data) {
        try {
          parsedData = JSON.parse(row.report_data);
        } catch {
          parsedData = null;
        }
      }

      return {
        id: row.id,
        serviceDate: row.service_date,
        brand: row.brand,
        totalCheckins: row.total_checkins,
        totalGuests: row.total_guests,
        totalPayments: row.total_payments,
        totalAmountAed: row.total_amount_aed,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        reportData: parsedData,
        rawReportData: parsedData
      };
    });

    // If a search query is provided, filter records by room number or guest name inside the report payload
    if (query) {
      const qClean = query.replace(/^0+/, "");
      formatted = formatted.filter((report) => {
        if (!report.rawReportData) return false;
        const checkIns = report.rawReportData.checkIns || [];
        const paymentList = report.rawReportData.paymentList || [];

        const hasCheckInMatch = checkIns.some((c) => {
          const roomRaw = String(c.roomNumber || c.displayLocation || "").toLowerCase();
          const roomClean = roomRaw.replace(/^0+/, "");
          const name = String(c.guestName || "").toLowerCase();
          const table = String(c.tableNumber || "").toLowerCase();
          const mealPlan = String(c.mealPlan || "").toLowerCase();
          const guestType = String(c.guestType || "").toLowerCase();
          const status = String(c.breakfastStatus || "").toLowerCase();
          return (
            roomRaw.includes(query) ||
            (qClean && roomClean.includes(qClean)) ||
            name.includes(query) ||
            table.includes(query) ||
            mealPlan.includes(query) ||
            guestType.includes(query) ||
            status.includes(query)
          );
        });

        const hasPaymentMatch = paymentList.some((p) => {
          const location = String(p.displayLocation || "").toLowerCase();
          const name = String(p.guestName || "").toLowerCase();
          return location.includes(query) || name.includes(query);
        });

        return hasCheckInMatch || hasPaymentMatch;
      });
    }

    return jsonResponse({
      success: true,
      count: formatted.length,
      reports: formatted
    });
  } catch (error) {
    return jsonResponse({ error: error.message || "Failed to fetch reports" }, 500);
  }
}

/**
 * POST /api/reports
 * Body: { serviceDate, brand, checkIns, paymentList, summary }
 */
export async function onRequestPost({ request, env }) {
  try {
    const db = env.DB;
    if (!db) {
      return jsonResponse({ error: "D1 Database binding (DB) is not configured." }, 503);
    }

    const payload = await request.json();
    const serviceDate = String(payload.serviceDate || "").trim();
    const brand = String(payload.brand || "").trim().toUpperCase();

    if (!serviceDate || !brand) {
      return jsonResponse({ error: "Missing required fields: serviceDate and brand are required." }, 400);
    }

    const checkIns = Array.isArray(payload.checkIns) ? payload.checkIns : [];
    const paymentList = Array.isArray(payload.paymentList) ? payload.paymentList : [];

    const totalCheckins = checkIns.length;
    let totalGuests = 0;
    for (const item of checkIns) {
      const g = Number(item.actualGuests) || (Number(item.adults) || 0) + (Number(item.children) || 0);
      totalGuests += g;
    }

    const totalPayments = paymentList.length;
    let totalAmountAed = 0;
    for (const item of paymentList) {
      totalAmountAed += Number(item.amountAed) || 0;
    }

    const reportDataString = JSON.stringify({
      serviceDate,
      brand,
      checkIns,
      paymentList,
      savedAt: new Date().toISOString()
    });

    const reportId = `${serviceDate}_${brand}`;

    // Perform Upsert
    await db
      .prepare(
        `INSERT INTO daily_reports (
          id, service_date, brand, total_checkins, total_guests, total_payments, total_amount_aed, report_data, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        ON CONFLICT(service_date, brand) DO UPDATE SET
          total_checkins = excluded.total_checkins,
          total_guests = excluded.total_guests,
          total_payments = excluded.total_payments,
          total_amount_aed = excluded.total_amount_aed,
          report_data = excluded.report_data,
          updated_at = datetime('now')`
      )
      .bind(reportId, serviceDate, brand, totalCheckins, totalGuests, totalPayments, totalAmountAed, reportDataString)
      .run();

    // Enforce 20-day retention prune
    await db.prepare("DELETE FROM daily_reports WHERE service_date < date('now', '-20 days')").run();

    return jsonResponse({
      success: true,
      message: `Report for ${brand} on ${serviceDate} saved successfully. 20-day retention verified.`,
      reportId,
      summary: {
        totalCheckins,
        totalGuests,
        totalPayments,
        totalAmountAed
      }
    });
  } catch (error) {
    return jsonResponse({ error: error.message || "Failed to save report" }, 500);
  }
}
