/**
 * Cloudflare Pages Function: /api/sync
 * Relational Realtime Multi-Device Sync Engine (Cloudflare D1)
 */
import { jsonResponse } from "./_authHelper.js";

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
 * GET /api/sync?brand=KCA&date=2026-08-28&since=...
 * Returns incremental check-in events and active table occupancy
 */
export async function onRequestGet({ request, env }) {
  try {
    const db = env.DB;
    if (!db) {
      return jsonResponse({ error: "D1 Database binding (DB) is not configured." }, 503);
    }

    const url = new URL(request.url);
    const brand = (url.searchParams.get("brand") || "").trim().toUpperCase();
    const serviceDate = (url.searchParams.get("date") || "").trim();
    const since = (url.searchParams.get("since") || "").trim();

    if (!brand || !serviceDate) {
      return jsonResponse({ error: "brand and date query parameters are required." }, 400);
    }

    const sessionId = `${brand}_${serviceDate}`;

    // 1. Fetch checkin events
    let checkinSql = "SELECT * FROM checkin_events WHERE brand = ? AND service_date = ?";
    const checkinParams = [brand, serviceDate];

    if (since) {
      checkinSql += " AND updated_at > ?";
      checkinParams.push(since);
    }
    checkinSql += " ORDER BY timestamp DESC";

    const checkinsStmt = db.prepare(checkinSql).bind(...checkinParams);
    const { results: checkins } = await checkinsStmt.all();

    // 2. Fetch active occupancy (checked_out = 0)
    const activeOccupancyStmt = db
      .prepare(
        "SELECT id, room_number, guest_name, table_number, actual_guests, timestamp, paid FROM checkin_events WHERE brand = ? AND service_date = ? AND checked_out = 0"
      )
      .bind(brand, serviceDate);
    const { results: activeOccupants } = await activeOccupancyStmt.all();

    // Build occupied table set
    const occupiedTables = {};
    for (const occ of activeOccupants || []) {
      if (!occ.table_number) continue;
      if (!occupiedTables[occ.table_number]) {
        occupiedTables[occ.table_number] = [];
      }
      occupiedTables[occ.table_number].push({
        id: occ.id,
        roomNumber: occ.room_number,
        guestName: occ.guest_name,
        actualGuests: occ.actual_guests,
        timestamp: occ.timestamp,
        paid: Boolean(occ.paid)
      });
    }

    // 3. Fetch payment events
    let paymentsSql = "SELECT * FROM payment_events WHERE brand = ? AND service_date = ?";
    const paymentParams = [brand, serviceDate];
    if (since) {
      paymentsSql += " AND updated_at > ?";
      paymentParams.push(since);
    }
    const paymentsStmt = db.prepare(paymentsSql).bind(...paymentParams);
    const { results: payments } = await paymentsStmt.all();

    return jsonResponse({
      success: true,
      brand,
      serviceDate,
      serverTime: new Date().toISOString(),
      checkins: checkins || [],
      payments: payments || [],
      occupiedTables,
      activeOccupantsCount: (activeOccupants || []).length
    });
  } catch (error) {
    return jsonResponse({ error: error.message || "Sync GET failed" }, 500);
  }
}

/**
 * POST /api/sync
 * Pushes mutations (check-ins, check-outs, payment marks, table changes) from client outbox
 * Body: { brand, serviceDate, deviceId, mutations: [ { type: 'CHECKIN'|'CHECKOUT'|'PAYMENT'|'TABLE_CHANGE', data: {...} } ] }
 */
export async function onRequestPost({ request, env }) {
  try {
    const db = env.DB;
    if (!db) {
      return jsonResponse({ error: "D1 Database binding (DB) is not configured." }, 503);
    }

    const payload = await request.json();
    const brand = String(payload.brand || "").trim().toUpperCase();
    const serviceDate = String(payload.serviceDate || "").trim();
    const deviceId = String(payload.deviceId || "unknown_device").trim();
    const mutations = Array.isArray(payload.mutations) ? payload.mutations : [];

    if (!brand || !serviceDate) {
      return jsonResponse({ error: "brand and serviceDate are required." }, 400);
    }

    const sessionId = `${brand}_${serviceDate}`;

    // Ensure session exists
    await db
      .prepare(
        `INSERT INTO daily_sessions (id, brand, service_date, opened_by, updated_at)
         VALUES (?, ?, ?, 'HOST', datetime('now'))
         ON CONFLICT(brand, service_date) DO UPDATE SET updated_at = datetime('now')`
      )
      .bind(sessionId, brand, serviceDate)
      .run();

    const statements = [];

    for (const m of mutations) {
      const type = m.type;
      const data = m.data || {};

      if (type === "CHECKIN") {
        const id = data.id || `${brand}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        statements.push(
          db
            .prepare(
              `INSERT INTO checkin_events (
                id, session_id, brand, service_date, room_number, guest_name, table_number,
                adults, children, actual_guests, extra_guests, entitlement_exceeded, guest_type,
                meal_plan, products, breakfast_status, status_override, checked_out, checked_out_at,
                paid, paid_at, device_id, timestamp, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
              ON CONFLICT(id) DO UPDATE SET
                room_number = excluded.room_number,
                table_number = excluded.table_number,
                actual_guests = excluded.actual_guests,
                checked_out = excluded.checked_out,
                checked_out_at = excluded.checked_out_at,
                paid = excluded.paid,
                paid_at = excluded.paid_at,
                updated_at = datetime('now')`
            )
            .bind(
              id,
              sessionId,
              brand,
              serviceDate,
              data.roomNumber || "",
              data.guestName || "Guest",
              data.tableNumber || "",
              Number(data.adults) || 0,
              Number(data.children) || 0,
              Number(data.actualGuests) || 1,
              Number(data.extraGuests) || 0,
              data.entitlementExceeded ? 1 : 0,
              data.guestType || "Hotel",
              data.mealPlan || "",
              data.products || "",
              data.breakfastStatus || "included",
              data.statusOverride ? 1 : 0,
              data.checkedOut ? 1 : 0,
              data.checkedOutAt || null,
              data.paid ? 1 : 0,
              data.paidAt || null,
              deviceId,
              data.timestamp || new Date().toISOString()
            )
        );

        // If requires payment, upsert payment event
        if (data.guestType === "Walk-In" || data.guestType === "Apartment" || data.breakfastStatus === "payment" || data.entitlementExceeded) {
          statements.push(
            db
              .prepare(
                `INSERT INTO payment_events (
                  id, checkin_id, session_id, brand, service_date, room_number, guest_name,
                  table_number, guest_type, reason, extra_guests, amount_aed, paid, paid_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
                ON CONFLICT(id) DO UPDATE SET
                  table_number = excluded.table_number,
                  paid = excluded.paid,
                  paid_at = excluded.paid_at,
                  updated_at = datetime('now')`
              )
              .bind(
                id,
                id,
                sessionId,
                brand,
                serviceDate,
                data.roomNumber || "",
                data.guestName || "Guest",
                data.tableNumber || "",
                data.guestType || "Hotel",
                data.reason || "Payment Required",
                Number(data.extraGuests) || 0,
                Number(data.amountAed) || 0,
                data.paid ? 1 : 0,
                data.paidAt || null
              )
          );
        }
      } else if (type === "CHECKOUT") {
        const id = data.id;
        if (id) {
          statements.push(
            db
              .prepare(
                `UPDATE checkin_events
                 SET checked_out = 1,
                     checked_out_at = ?,
                     updated_at = datetime('now')
                 WHERE id = ?`
              )
              .bind(data.checkedOutAt || new Date().toISOString(), id)
          );
        }
      } else if (type === "PAYMENT_PAID") {
        const id = data.id;
        if (id) {
          const paidAt = data.paidAt || new Date().toISOString();
          statements.push(
            db
              .prepare(
                `UPDATE payment_events
                 SET paid = 1,
                     paid_at = ?,
                     updated_at = datetime('now')
                 WHERE id = ?`
              )
              .bind(paidAt, id)
          );
          statements.push(
            db
              .prepare(
                `UPDATE checkin_events
                 SET paid = 1,
                     paid_at = ?,
                     updated_at = datetime('now')
                 WHERE id = ?`
              )
              .bind(paidAt, id)
          );
        }
      } else if (type === "TABLE_CHANGE") {
        const id = data.id;
        const newTable = data.tableNumber;
        if (id && newTable) {
          statements.push(
            db
              .prepare(
                `UPDATE checkin_events
                 SET table_number = ?,
                     updated_at = datetime('now')
                 WHERE id = ?`
              )
              .bind(newTable, id)
          );
          statements.push(
            db
              .prepare(
                `UPDATE payment_events
                 SET table_number = ?,
                     updated_at = datetime('now')
                 WHERE id = ?`
              )
              .bind(newTable, id)
          );
        }
      }
    }

    if (statements.length > 0) {
      await db.batch(statements);
    }

    // Also update legacy daily_reports snapshot in background for single-report downloads
    try {
      const allCheckinsStmt = db
        .prepare("SELECT * FROM checkin_events WHERE brand = ? AND service_date = ? ORDER BY timestamp DESC")
        .bind(brand, serviceDate);
      const { results: allCheckins } = await allCheckinsStmt.all();

      const allPaymentsStmt = db
        .prepare("SELECT * FROM payment_events WHERE brand = ? AND service_date = ? ORDER BY timestamp DESC")
        .bind(brand, serviceDate);
      const { results: allPayments } = await allPaymentsStmt.all();

      const totalCheckins = (allCheckins || []).length;
      let totalGuests = 0;
      for (const item of allCheckins || []) {
        totalGuests += Number(item.actual_guests) || 1;
      }
      const totalPayments = (allPayments || []).length;

      const reportDataString = JSON.stringify({
        serviceDate,
        brand,
        checkIns: (allCheckins || []).map((c) => ({
          id: c.id,
          roomNumber: c.room_number,
          guestName: c.guest_name,
          tableNumber: c.table_number,
          adults: c.adults,
          children: c.children,
          actualGuests: c.actual_guests,
          extraGuests: c.extra_guests,
          entitlementExceeded: Boolean(c.entitlement_exceeded),
          guestType: c.guest_type,
          mealPlan: c.meal_plan,
          products: c.products,
          breakfastStatus: c.breakfast_status,
          statusOverride: Boolean(c.status_override),
          checkedOut: Boolean(c.checked_out),
          checkedOutAt: c.checked_out_at,
          paid: Boolean(c.paid),
          paidAt: c.paid_at,
          timestamp: c.timestamp
        })),
        paymentList: (allPayments || []).map((p) => ({
          id: p.id,
          roomNumber: p.room_number,
          guestName: p.guest_name,
          tableNumber: p.table_number,
          guestType: p.guest_type,
          reason: p.reason,
          extraGuests: p.extra_guests,
          paid: Boolean(p.paid),
          paidAt: p.paid_at,
          timestamp: p.created_at
        })),
        savedAt: new Date().toISOString()
      });

      const reportId = `${serviceDate}_${brand}`;
      await db
        .prepare(
          `INSERT INTO daily_reports (
            id, service_date, brand, total_checkins, total_guests, total_payments, total_amount_aed, report_data, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, datetime('now'))
          ON CONFLICT(service_date, brand) DO UPDATE SET
            total_checkins = excluded.total_checkins,
            total_guests = excluded.total_guests,
            total_payments = excluded.total_payments,
            report_data = excluded.report_data,
            updated_at = datetime('now')`
        )
        .bind(reportId, serviceDate, brand, totalCheckins, totalGuests, totalPayments, reportDataString)
        .run();
    } catch (legacyErr) {
      console.warn("Legacy report sync update notice:", legacyErr);
    }

    return jsonResponse({
      success: true,
      processedMutations: mutations.length,
      serverTime: new Date().toISOString()
    });
  } catch (error) {
    return jsonResponse({ error: error.message || "Sync POST failed" }, 500);
  }
}
