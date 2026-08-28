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
 * Returns incremental check-in events, active table occupancy, and shared guest roster
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
    const nowIso = new Date().toISOString();

    // 0. Auto-backfill checkin_events from daily_reports if checkin_events is empty
    try {
      const countStmt = db
        .prepare("SELECT COUNT(*) as cnt FROM checkin_events WHERE brand = ? AND service_date = ?")
        .bind(brand, serviceDate);
      const countRes = await countStmt.first();

      if (!countRes || countRes.cnt === 0) {
        const reportStmt = db
          .prepare("SELECT report_data FROM daily_reports WHERE brand = ? AND service_date = ?")
          .bind(brand, serviceDate);
        const reportRow = await reportStmt.first();

        if (reportRow && reportRow.report_data) {
          const parsed = JSON.parse(reportRow.report_data);
          const legacyCheckins = Array.isArray(parsed.checkIns) ? parsed.checkIns : [];

          if (legacyCheckins.length > 0) {
            const backfillStmts = [];
            for (const c of legacyCheckins) {
              const id = c.id || `${brand}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
              backfillStmts.push(
                db
                  .prepare(
                    `INSERT OR IGNORE INTO checkin_events (
                      id, session_id, brand, service_date, room_number, guest_name, table_number,
                      adults, children, actual_guests, extra_guests, entitlement_exceeded, guest_type,
                      meal_plan, products, breakfast_status, status_override, checked_out, checked_out_at,
                      paid, paid_at, device_id, timestamp, updated_at, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'BACKFILL', ?, ?, ?)`
                  )
                  .bind(
                    id,
                    sessionId,
                    brand,
                    serviceDate,
                    c.roomNumber || c.displayLocation || "",
                    c.guestName || "Guest",
                    c.tableNumber || "",
                    Number(c.adults) || 0,
                    Number(c.children) || 0,
                    Number(c.actualGuests) || (Number(c.adults) || 0) + (Number(c.children) || 0) || 1,
                    Number(c.extraGuests) || 0,
                    c.entitlementExceeded ? 1 : 0,
                    c.guestType || "Hotel",
                    c.mealPlan || "",
                    c.products || "",
                    c.breakfastStatus || "included",
                    c.statusOverride ? 1 : 0,
                    c.checkedOut ? 1 : 0,
                    c.checkedOutAt || null,
                    c.paid ? 1 : 0,
                    c.paidAt || null,
                    c.timestamp || nowIso,
                    nowIso,
                    nowIso
                  )
              );
            }

            if (backfillStmts.length > 0) {
              await db.batch(backfillStmts);
            }
          }
        }
      }
    } catch (backfillErr) {
      console.warn("Auto-backfill notice:", backfillErr);
    }

    // 1. Fetch checkin events for today's session
    const checkinSql = "SELECT * FROM checkin_events WHERE brand = ? AND service_date = ? ORDER BY timestamp DESC";
    const checkinParams = [brand, serviceDate];
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
    const paymentsSql = "SELECT * FROM payment_events WHERE brand = ? AND service_date = ? ORDER BY timestamp DESC";
    const paymentParams = [brand, serviceDate];
    const paymentsStmt = db.prepare(paymentsSql).bind(...paymentParams);
    const { results: payments } = await paymentsStmt.all();

    // 4. Fetch guest roster (Today's uploaded guest list shared across tablets/devices)
    let roster = null;
    try {
      const rosterStmt = db
        .prepare("SELECT guest_count, roster_data, file_names, files_loaded, updated_at FROM guest_rosters WHERE brand = ? AND service_date = ?")
        .bind(brand, serviceDate);
      const rosterRow = await rosterStmt.first();

      if (rosterRow && rosterRow.roster_data) {
        roster = {
          guestCount: rosterRow.guest_count || 0,
          guests: JSON.parse(rosterRow.roster_data || "[]"),
          fileNames: JSON.parse(rosterRow.file_names || "{}"),
          filesLoaded: JSON.parse(rosterRow.files_loaded || "{}"),
          updatedAt: rosterRow.updated_at
        };
      }
    } catch (rosterErr) {
      // Non-fatal if table doesn't exist yet before migration
      console.warn("Guest roster fetch notice:", rosterErr);
    }

    return jsonResponse({
      success: true,
      brand,
      serviceDate,
      serverTime: nowIso,
      checkins: checkins || [],
      payments: payments || [],
      occupiedTables,
      activeOccupantsCount: (activeOccupants || []).length,
      roster
    });
  } catch (error) {
    return jsonResponse({ error: error.message || "Sync GET failed" }, 500);
  }
}

/**
 * POST /api/sync
 * Pushes mutations (check-ins, check-outs, payment marks, table changes, guest roster) from client outbox
 * Body: { brand, serviceDate, deviceId, mutations: [...], roster: { guests, fileNames, filesLoaded } }
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
    const roster = payload.roster;

    if (!brand || !serviceDate) {
      return jsonResponse({ error: "brand and serviceDate are required." }, 400);
    }

    const sessionId = `${brand}_${serviceDate}`;
    const nowIso = new Date().toISOString();

    // Ensure session exists
    await db
      .prepare(
        `INSERT INTO daily_sessions (id, brand, service_date, opened_by, updated_at)
         VALUES (?, ?, ?, 'HOST', ?)
         ON CONFLICT(brand, service_date) DO UPDATE SET updated_at = ?`
      )
      .bind(sessionId, brand, serviceDate, nowIso, nowIso)
      .run();

    // 1. If roster is provided, persist to guest_rosters table
    if (roster && Array.isArray(roster.guests) && roster.guests.length > 0) {
      try {
        const guestCount = roster.guests.length;
        const rosterDataJson = JSON.stringify(roster.guests);
        const fileNamesJson = JSON.stringify(roster.fileNames || {});
        const filesLoadedJson = JSON.stringify(roster.filesLoaded || {});

        await db
          .prepare(
            `INSERT INTO guest_rosters (id, brand, service_date, guest_count, roster_data, file_names, files_loaded, updated_at, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(brand, service_date) DO UPDATE SET
               guest_count = excluded.guest_count,
               roster_data = excluded.roster_data,
               file_names = excluded.file_names,
               files_loaded = excluded.files_loaded,
               updated_at = excluded.updated_at`
          )
          .bind(
            sessionId,
            brand,
            serviceDate,
            guestCount,
            rosterDataJson,
            fileNamesJson,
            filesLoadedJson,
            nowIso,
            nowIso
          )
          .run();
      } catch (saveRosterErr) {
        console.warn("Could not save guest roster to D1:", saveRosterErr);
      }
    }

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
                paid, paid_at, device_id, timestamp, updated_at, created_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET
                room_number = excluded.room_number,
                table_number = excluded.table_number,
                actual_guests = excluded.actual_guests,
                extra_guests = excluded.extra_guests,
                entitlement_exceeded = excluded.entitlement_exceeded,
                checked_out = excluded.checked_out,
                checked_out_at = excluded.checked_out_at,
                paid = excluded.paid,
                paid_at = excluded.paid_at,
                updated_at = excluded.updated_at`
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
              Number(data.actualGuests) || (Number(data.adults) || 0) + (Number(data.children) || 0) || 1,
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
              data.timestamp || nowIso,
              nowIso,
              nowIso
            )
        );

        // If requires payment, upsert payment event
        if (data.guestType === "Walk-In" || data.guestType === "Apartment" || data.breakfastStatus === "payment" || data.entitlementExceeded) {
          statements.push(
            db
              .prepare(
                `INSERT INTO payment_events (
                  id, checkin_id, session_id, brand, service_date, room_number, guest_name,
                  table_number, guest_type, reason, extra_guests, amount_aed, paid, paid_at, updated_at, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                  table_number = excluded.table_number,
                  paid = excluded.paid,
                  paid_at = excluded.paid_at,
                  updated_at = excluded.updated_at`
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
                data.paidAt || null,
                nowIso,
                nowIso
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
                     updated_at = ?
                 WHERE id = ?`
              )
              .bind(data.checkedOutAt || nowIso, nowIso, id)
          );
        }
      } else if (type === "PAYMENT_PAID") {
        const id = data.id;
        if (id) {
          const paidAt = data.paidAt || nowIso;
          statements.push(
            db
              .prepare(
                `UPDATE payment_events
                 SET paid = 1,
                     paid_at = ?,
                     updated_at = ?
                 WHERE id = ?`
              )
              .bind(paidAt, nowIso, id)
          );
          statements.push(
            db
              .prepare(
                `UPDATE checkin_events
                 SET paid = 1,
                     paid_at = ?,
                     updated_at = ?
                 WHERE id = ?`
              )
              .bind(paidAt, nowIso, id)
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
                     updated_at = ?
                 WHERE id = ?`
              )
              .bind(newTable, nowIso, id)
          );
          statements.push(
            db
              .prepare(
                `UPDATE payment_events
                 SET table_number = ?,
                     updated_at = ?
                 WHERE id = ?`
              )
              .bind(newTable, nowIso, id)
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
        savedAt: nowIso
      });

      const reportId = `${serviceDate}_${brand}`;
      await db
        .prepare(
          `INSERT INTO daily_reports (
            id, service_date, brand, total_checkins, total_guests, total_payments, total_amount_aed, report_data, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)
          ON CONFLICT(service_date, brand) DO UPDATE SET
            total_checkins = excluded.total_checkins,
            total_guests = excluded.total_guests,
            total_payments = excluded.total_payments,
            report_data = excluded.report_data,
            updated_at = excluded.updated_at`
        )
        .bind(reportId, serviceDate, brand, totalCheckins, totalGuests, totalPayments, reportDataString, nowIso)
        .run();
    } catch (legacyErr) {
      console.warn("Legacy report sync update notice:", legacyErr);
    }

    return jsonResponse({
      success: true,
      processedMutations: mutations.length,
      serverTime: nowIso
    });
  } catch (error) {
    return jsonResponse({ error: error.message || "Sync POST failed" }, 500);
  }
}
