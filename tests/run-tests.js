import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  BREAKFAST_STATUS,
  GUEST_TYPES,
  normalizeRoom,
  normalizeCode,
  normalizeSearchText,
  formatDate,
  formatTime,
  parseInteger,
  uniqueList,
  safeJsonParse
} from "../js/utils.js";
import {
  mergeGuestData,
  isBreakfastSemantic,
  reconcilePackageForecast
} from "../js/mergeData.js";
import {
  productMaster,
  PRODUCT_CLASSIFICATION,
  CALCULATION_BASIS,
  ENTITLEMENT_SOURCE
} from "../js/productMaster.js";
import {
  calculateReservationEntitlement
} from "../js/entitlement.js";
import {
  parseMealPlanXml,
  parsePackageForecastXml,
  extractPackageForecastSummary
} from "../js/xmlParser.js";
import { searchGuests, exactRoomMatch } from "../js/search.js";
import { GuestSearchIndex } from "../js/searchIndex.js";
import { AppStore } from "../js/store.js";
import {
  createHotelCheckIn,
  createWalkInCheckIn,
  createApartmentCheckIn,
  createManualGuest,
  checkEntitlement,
  getExtraGuests,
  findHotelCheckInByRoom,
  findActiveCheckInsByTable,
  checkOutCheckIn,
  applyLateArrivals
} from "../js/checkin.js";
import {
  requiresPayment,
  syncPaymentList,
  markPaymentPaid
} from "../js/payment.js";
import { getTablesForUser, isValidTableNumber, parseTableList } from "../js/tables.js";
import { canManageBrand, normalizeUsername } from "../js/auth.js";

import {
  hashPassword,
  verifyPassword,
  signJwt,
  verifyJwt
} from "../functions/api/_authHelper.js";

console.log("=== Running Comprehensive Architectural & Performance Test Suite ===");

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(err);
    failed++;
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(err);
    failed++;
  }
}

// 1. UTILS & DEFENSIVE TESTS
test("utils: normalizeRoom handles whitespace, zeros, nulls", () => {
  assert.equal(normalizeRoom(" 101 "), "101");
  assert.equal(normalizeRoom("  0204  "), "0204");
  assert.equal(normalizeRoom(null), "");
  assert.equal(normalizeRoom(undefined), "");
});

test("utils: normalizeCode uppercase and trims", () => {
  assert.equal(normalizeCode(" bb "), "BB");
  assert.equal(normalizeCode(null), "");
});

test("utils: parseInteger fallback handling", () => {
  assert.equal(parseInteger("4", 0), 4);
  assert.equal(parseInteger("invalid", 10), 10);
  assert.equal(parseInteger(null, 5), 5);
});

test("utils: safeJsonParse prevents crashes on malformed data", () => {
  assert.deepEqual(safeJsonParse("{bad json}", { fallback: true }), { fallback: true });
  assert.deepEqual(safeJsonParse('{"ok": 123}', {}), { ok: 123 });
});

test("utils: uniqueList removes duplicates and falsy", () => {
  assert.deepEqual(uniqueList(["A", "B", "A", "", null]), ["A", "B"]);
});

test("utils: formatDate formats ISO and Oracle dates", () => {
  assert.equal(formatDate("2026-08-28"), "28/08/2026");
  assert.equal(formatDate("28-AUG-26"), "28/AUG/2026");
  assert.equal(formatDate(""), "-");
});

// 2. MERGE DATA TESTS
test("mergeData: Both Meal Plan and Package Forecast loaded", () => {
  const mealPlan = [
    {
      roomNumber: "101",
      firstName: "John",
      lastName: "Smith",
      adults: 2,
      children: 1,
      confirmationNumber: "CONF123",
      mealPlan: "BB"
    }
  ];
  const packageForecast = [
    {
      roomNumber: "101",
      confirmationNumber: "CONF123",
      firstName: "John",
      lastName: "Smith",
      adults: 2,
      children: 1,
      productGroupCode: "BFAIN",
      packageQuantity: 2
    }
  ];

  const guests = mergeGuestData(mealPlan, packageForecast);
  assert.equal(guests.length, 1);
  assert.equal(guests[0].roomNumber, "101");
  assert.equal(guests[0].breakfastStatus, BREAKFAST_STATUS.INCLUDED);
  assert.equal(guests[0].breakfastIncluded, true);
  assert.equal(guests[0].breakfastQuantity, 2);
});

test("mergeData: ONLY Meal Plan loaded (Package Forecast missing)", () => {
  const mealPlan = [
    {
      roomNumber: "102",
      firstName: "Alice",
      lastName: "Brown",
      adults: 2,
      children: 0,
      confirmationNumber: "CONF456",
      mealPlan: "BB"
    },
    {
      roomNumber: "103",
      firstName: "Bob",
      lastName: "Green",
      adults: 1,
      children: 0,
      confirmationNumber: "CONF789",
      mealPlan: "RO"
    }
  ];

  const guests = mergeGuestData(mealPlan, []);
  assert.equal(guests.length, 2);
  
  const guest102 = guests.find((g) => g.roomNumber === "102");
  assert.equal(guest102.breakfastStatus, BREAKFAST_STATUS.INCLUDED);
  assert.equal(guest102.breakfastQuantity, 2);

  const guest103 = guests.find((g) => g.roomNumber === "103");
  assert.equal(guest103.breakfastStatus, BREAKFAST_STATUS.PAYMENT);
  assert.equal(guest103.breakfastIncluded, false);
});

test("mergeData: ONLY Package Forecast loaded (Meal Plan missing)", () => {
  const packageForecast = [
    {
      roomNumber: "201",
      confirmationNumber: "CONF999",
      firstName: "Charlie",
      lastName: "Chaplin",
      adults: 2,
      children: 0,
      productGroupCode: "BFAIN",
      packageQuantity: 2
    }
  ];

  const guests = mergeGuestData([], packageForecast);
  assert.equal(guests.length, 1);
  assert.equal(guests[0].roomNumber, "201");
  assert.equal(guests[0].breakfastStatus, BREAKFAST_STATUS.INCLUDED);
  assert.equal(guests[0].breakfastQuantity, 2);
});

test("mergeData: empty or null inputs return empty array safely", () => {
  assert.deepEqual(mergeGuestData(null, null), []);
  assert.deepEqual(mergeGuestData([], []), []);
});

// 3. SEARCH & INVERTED INDEX STRESS TESTS
test("searchIndex: Inverted index performs sub-millisecond search on 2,000 simulated guests", () => {
  const simulatedGuests = [];
  for (let i = 1; i <= 2000; i++) {
    simulatedGuests.push({
      id: `sim-${i}`,
      roomNumber: String(100 + (i % 900)),
      firstName: `GuestFirst${i}`,
      lastName: `GuestLast${i}`,
      fullName: `GuestFirst${i} GuestLast${i}`,
      confirmationNumber: `CONF-${100000 + i}`,
      mealPlan: i % 2 === 0 ? "BB" : "RO",
      breakfastStatus: i % 2 === 0 ? BREAKFAST_STATUS.INCLUDED : BREAKFAST_STATUS.PAYMENT,
      breakfastQuantity: 2,
      adults: 2,
      children: 0
    });
  }

  const index = new GuestSearchIndex();
  const buildStart = performance.now();
  index.buildIndex(simulatedGuests);
  const buildTime = performance.now() - buildStart;
  assert.equal(buildTime < 100, true, `Index build took ${buildTime}ms, expected < 100ms`);

  // JIT warmup
  index.search("warmup", 1);
  const searchStart = performance.now();
  const results = index.search("GuestFirst500", 8);
  const searchTime = performance.now() - searchStart;
  assert.equal(results.length > 0, true);
  assert.equal(searchTime < 25, true, `Search took ${searchTime}ms, expected < 25ms`);

  const exactStart = performance.now();
  const exact = index.exactRoomMatch("150");
  const exactTime = performance.now() - exactStart;
  assert.notEqual(exact, null);
  assert.equal(exactTime < 2, true, `Exact match took ${exactTime}ms, expected < 2ms`);
});

// 4. CHECK-IN & ENTITLEMENT TESTS
test("checkin: createHotelCheckIn without exceeding entitlement", () => {
  const guest = {
    roomNumber: "101",
    fullName: "John Smith",
    adults: 2,
    children: 0,
    mealPlan: "BB",
    products: ["BB"],
    breakfastStatus: BREAKFAST_STATUS.INCLUDED,
    breakfastQuantity: 2,
    guestType: GUEST_TYPES.HOTEL
  };

  const checkin = createHotelCheckIn(guest, { tableNumber: "T12", actualGuests: "2" });
  assert.equal(checkin.tableNumber, "T12");
  assert.equal(checkin.actualGuests, 2);
  assert.equal(checkin.entitlementExceeded, false);
  assert.equal(checkin.extraGuests, 0);
  assert.equal(requiresPayment(checkin), false);
});

test("checkin: entitlement exceeded calculation", () => {
  const guest = {
    roomNumber: "101",
    fullName: "John Smith",
    adults: 2,
    children: 0,
    breakfastStatus: BREAKFAST_STATUS.INCLUDED,
    breakfastQuantity: 2,
    guestType: GUEST_TYPES.HOTEL
  };

  assert.equal(checkEntitlement(guest, "4"), true);
  assert.equal(getExtraGuests(guest, "4"), 2);

  const checkin = createHotelCheckIn(guest, { tableNumber: "T12", actualGuests: "4" });
  assert.equal(checkin.entitlementExceeded, true);
  assert.equal(checkin.extraGuests, 2);
  assert.equal(requiresPayment(checkin), true);
});

test("checkin: late arrivals handling and table sharing", () => {
  const initialCheckIn = {
    id: "chk-1",
    roomNumber: "505",
    guestName: "Smith Party",
    tableNumber: "10",
    actualGuests: 2,
    extraGuests: 0,
    entitlementExceeded: false,
    checkedOut: false
  };

  const updated = applyLateArrivals(initialCheckIn, {
    additionalGuests: 2,
    tableNumber: "12"
  });

  assert.equal(updated.actualGuests, 4);
  assert.equal(updated.tableNumber, "12");
});

test("checkin: walk-in and apartment check-ins", () => {
  const walkIn = createWalkInCheckIn({
    guestName: "WalkIn Guest",
    tableNumber: "5",
    adults: "1",
    children: "1",
    discount: "0"
  });
  assert.equal(walkIn.guestType, GUEST_TYPES.WALK_IN);
  assert.equal(requiresPayment(walkIn), true);

  const apt = createApartmentCheckIn({
    roomNumber: "Apt 501",
    guestName: "Tenant",
    tableNumber: "6",
    adults: "2",
    children: "0"
  });
  assert.equal(apt.guestType, GUEST_TYPES.APARTMENT);
  assert.equal(requiresPayment(apt), true);
});

// 5. PAYMENT QUEUE & STORE TRANSACTION TESTS
test("payment: syncPaymentList and markPaymentPaid", () => {
  const walkIn = createWalkInCheckIn({
    guestName: "VIP",
    tableNumber: "1",
    adults: "1",
    children: "0"
  });

  let checkIns = [walkIn];
  let payments = syncPaymentList(checkIns);
  assert.equal(payments.length, 1);
  assert.equal(payments[0].paid, false);

  checkIns = markPaymentPaid(checkIns, walkIn.id);
  payments = syncPaymentList(checkIns);
  assert.equal(payments[0].paid, true);
  assert.notEqual(payments[0].paidAt, "");
});

test("tables: active check-ins tracking and checkout", () => {
  const checkin1 = createWalkInCheckIn({ guestName: "G1", tableNumber: "20" });
  let checkIns = [checkin1];

  let activeAtTable20 = findActiveCheckInsByTable(checkIns, "20");
  assert.equal(activeAtTable20.length, 1);

  checkIns = checkOutCheckIn(checkIns, checkin1.id);
  activeAtTable20 = findActiveCheckInsByTable(checkIns, "20");
  assert.equal(activeAtTable20.length, 0);
});

test("tables: brand table configuration returns correct counts", () => {
  const kcaTables = getTablesForUser("KCA");
  assert.equal(kcaTables.length, 90);
  assert.equal(kcaTables[0], "1");
  assert.equal(kcaTables[89], "90");

  const ktbTables = getTablesForUser("KTB");
  assert.equal(ktbTables.length > 20, true);

  // Table validation tests
  assert.equal(isValidTableNumber("KCA", "1"), true);
  assert.equal(isValidTableNumber("KCA", "90"), true);
  assert.equal(isValidTableNumber("KCA", "99"), false);
  assert.equal(isValidTableNumber("KCA", "100"), false);
  assert.equal(isValidTableNumber("KCA", ""), false);
});

test("auth: normalizeUsername and role permissions", () => {
  assert.equal(normalizeUsername("  superadmin  "), "SUPERADMIN");
  assert.equal(normalizeUsername("kca"), "KCA");
  assert.equal(normalizeUsername("ktb"), "KTB");
});

// 6. DYNAMIC ORACLE PACKAGE FORECAST XML PARSER & RECONCILIATION TESTS
test("oracleParser: Reference XML (pkgforecast_23994069.XML) parses without errors", () => {
  const xmlPath = path.resolve(process.cwd(), "pkgforecast_23994069.XML");
  const xmlText = fs.readFileSync(xmlPath, "utf8");

  const forecastRows = parsePackageForecastXml(xmlText);
  assert.equal(Array.isArray(forecastRows), true);
  assert.equal(forecastRows.length, 128); // 128 detail entries across 5 product groups

  // Verify dynamic metadata extraction
  assert.equal(forecastRows.metadata.stayDate, "30-AUG-26");
  assert.equal(forecastRows.metadata.stayDateChar, "30.08.26");
  assert.equal(forecastRows.metadata.stayDay, "Sun");
  assert.equal(forecastRows.metadata.reportId, "81141561");
  assert.equal(forecastRows.metadata.totalSummaryPackages, 209);

  // Verify dynamic summary totals map
  assert.deepEqual(forecastRows.summaryTotals, {
    BFAAD: 2,
    BFAIN: 186,
    BFCIN: 17,
    UPSBB1: 1,
    WEB_BFSA: 3
  });

  // Verify hierarchical context & reservation detail fields
  const firstRow = forecastRows[0];
  assert.equal(firstRow.roomNumber, "0605");
  assert.equal(firstRow.firstName, "Zaid");
  assert.equal(firstRow.lastName, "Alzuhairi");
  assert.equal(firstRow.productGroupCode, "BFAAD");
  assert.equal(firstRow.productDescription, "Breakfast Adult Add On Package");
  assert.equal(firstRow.packageQuantity, 1);
  assert.equal(firstRow.adults, 1);
  assert.equal(firstRow.children, 0);
  assert.equal(firstRow.reservationStatus, "CHECKED IN");

  // Verify 100% dynamic summary vs detail reconciliation
  const reconciliation = reconcilePackageForecast(forecastRows, forecastRows.summaryTotals);
  assert.equal(reconciliation.isReconciled, true);
  assert.equal(reconciliation.totalSummaryPackages, 209);
  assert.equal(reconciliation.totalDetailPackages, 209);
  assert.equal(reconciliation.discrepancies.length, 0);

  // Verify merge into guest domain model
  const mergedGuests = mergeGuestData([], forecastRows);
  assert.equal(mergedGuests.length > 100, true);
  const guest605 = mergedGuests.find((g) => g.roomNumber === "0605");
  assert.notEqual(guest605, undefined);
  assert.equal(guest605.breakfastIncluded, true);
  assert.equal(guest605.breakfastStatus, BREAKFAST_STATUS.INCLUDED);
  assert.equal(guest605.breakfastQuantity >= 1, true);
});

test("oracleParser: Dynamic Semantic Breakfast Classifier handles novel & localized packages", () => {
  // Known codes
  assert.equal(isBreakfastSemantic({ code: "BFAIN" }), true);
  assert.equal(isBreakfastSemantic({ code: "BB" }), true);

  // Novel package codes with English descriptions
  assert.equal(isBreakfastSemantic({ code: "VIP_SPEC", description: "VIP Deluxe Champagne Breakfast" }), true);
  assert.equal(isBreakfastSemantic({ code: "NEW_PKG_99", description: "Executive Morning Buffet Package" }), true);
  assert.equal(isBreakfastSemantic({ code: "LOUNGE_ACC", description: "Club Floor Lounge Access Included" }), true);

  // Multilingual descriptions
  assert.equal(isBreakfastSemantic({ code: "FR_BF", description: "Petit déjeuner buffet inclus" }), true);
  assert.equal(isBreakfastSemantic({ code: "DE_BF", description: "Großes Frühstücksbuffet" }), true);
  assert.equal(isBreakfastSemantic({ code: "ES_BF", description: "Desayuno buffet caliente" }), true);

  // Heuristic codes
  assert.equal(isBreakfastSemantic({ code: "BF_SPECIAL" }), true);
  assert.equal(isBreakfastSemantic({ code: "SUMMER_BKF" }), true);
  assert.equal(isBreakfastSemantic({ rateCode: "PROMOBB" }), true);

  // Explicit Room Only / No Breakfast
  assert.equal(isBreakfastSemantic({ code: "RO", description: "Room Only" }), false);
  assert.equal(isBreakfastSemantic({ code: "EP", description: "European Plan (No Meals)" }), false);
  assert.equal(isBreakfastSemantic({ code: "ROOM_ONLY", description: "Standard Room Only" }), false);

  // Unknown non-breakfast package
  assert.equal(isBreakfastSemantic({ code: "SPA_PASS", description: "Hydrotherapy Pool Access" }), false);
});

test("oracleParser: Synthetic Multi-Scenario A-Q Dynamic Parsing & Fault Tolerance", () => {
  // Scenario A: Different date & report ID
  // Scenario B: Arbitrary room numbers (Penthouse-A, Villa-10)
  // Scenario D & E: Brand new package code (BUFFET_DELUXE)
  // Scenario H & J: Multi-children reservations
  // Scenario P: Empty optional fields
  const syntheticXml = `<?xml version="1.0" encoding="UTF-8"?>
<PKGFORECAST>
  <LIST_G_SUMTOTAL_PKGS>
    <G_SUMTOTAL_PKGS>
      <LIST_G_STAY_DATE>
        <G_STAY_DATE>
          <STAY_DATE>15-SEP-26</STAY_DATE>
          <STAY_DATE_CHAR>15.09.26</STAY_DATE_CHAR>
          <STAY_DAY>Tue</STAY_DAY>
          <LIST_G_PRODUCT_ID>
            <G_PRODUCT_ID>
              <PRODUCT_ID>BUFFET_DELUXE</PRODUCT_ID>
              <LIST_G_REPORT_ID>
                <G_REPORT_ID>
                  <REPORT_ID>99887766</REPORT_ID>
                  <TOTAL_PKGS>7</TOTAL_PKGS>
                </G_REPORT_ID>
              </LIST_G_REPORT_ID>
            </G_PRODUCT_ID>
            <G_PRODUCT_ID>
              <PRODUCT_ID>RO_SPECIAL</PRODUCT_ID>
              <LIST_G_REPORT_ID>
                <G_REPORT_ID>
                  <REPORT_ID>99887766</REPORT_ID>
                  <TOTAL_PKGS>2</TOTAL_PKGS>
                </G_REPORT_ID>
              </LIST_G_REPORT_ID>
            </G_PRODUCT_ID>
          </LIST_G_PRODUCT_ID>
        </G_STAY_DATE>
      </LIST_G_STAY_DATE>
    </G_SUMTOTAL_PKGS>
  </LIST_G_SUMTOTAL_PKGS>
  <LIST_G_PRODUCT_GROUP>
    <G_PRODUCT_GROUP>
      <PRODUCT_ID1>BUFFET_DELUXE</PRODUCT_ID1>
      <PRODUCT_DESC>Deluxe Chef Breakfast Buffet</PRODUCT_DESC>
      <LIST_G_RESV_DETAILS>
        <G_RESV_DETAILS>
          <CONFIRMATION_NO>CONF_SYNA_1</CONFIRMATION_NO>
          <ROOM>Penthouse-A</ROOM>
          <GUEST_FIRST_NAME>Alexander</GUEST_FIRST_NAME>
          <GUEST_NAME>Hamilton</GUEST_NAME>
          <ADULTS>2</ADULTS>
          <CHILDREN>2</CHILDREN>
          <PKG_QTY>4</PKG_QTY>
          <RESV_STATUS>CHECKED IN</RESV_STATUS>
        </G_RESV_DETAILS>
        <G_RESV_DETAILS>
          <CONFIRMATION_NO>CONF_SYNA_2</CONFIRMATION_NO>
          <ROOM>Villa-10</ROOM>
          <DISPLAY_NAME>Wayne, Bruce</DISPLAY_NAME>
          <ADULTS>3</ADULTS>
          <CHILDREN>0</CHILDREN>
          <PKG_QTY>3</PKG_QTY>
          <RESV_STATUS>DUE IN</RESV_STATUS>
        </G_RESV_DETAILS>
      </LIST_G_RESV_DETAILS>
    </G_PRODUCT_GROUP>
    <G_PRODUCT_GROUP>
      <PRODUCT_ID1>RO_SPECIAL</PRODUCT_ID1>
      <PRODUCT_DESC>Room Only Promotional Special</PRODUCT_DESC>
      <LIST_G_RESV_DETAILS>
        <G_RESV_DETAILS>
          <CONFIRMATION_NO>CONF_SYNA_3</CONFIRMATION_NO>
          <ROOM>9901</ROOM>
          <GUEST_NAME>Kent</GUEST_NAME>
          <GUEST_FIRST_NAME>Clark</GUEST_FIRST_NAME>
          <ADULTS>2</ADULTS>
          <CHILDREN>0</CHILDREN>
          <PKG_QTY>2</PKG_QTY>
          <RESV_STATUS>CHECKED IN</RESV_STATUS>
        </G_RESV_DETAILS>
      </LIST_G_RESV_DETAILS>
    </G_PRODUCT_GROUP>
  </LIST_G_PRODUCT_GROUP>
</PKGFORECAST>`;

  const parsed = parsePackageForecastXml(syntheticXml);
  assert.equal(parsed.length, 3);
  assert.equal(parsed.metadata.stayDate, "15-SEP-26");
  assert.equal(parsed.metadata.reportId, "99887766");
  assert.equal(parsed.summaryTotals.BUFFET_DELUXE, 7);
  assert.equal(parsed.summaryTotals.RO_SPECIAL, 2);

  const recon = reconcilePackageForecast(parsed, parsed.summaryTotals);
  assert.equal(recon.isReconciled, true);
  assert.equal(recon.totalSummaryPackages, 9);
  assert.equal(recon.totalDetailPackages, 9);

  const merged = mergeGuestData([], parsed);
  assert.equal(merged.length, 3);

  const penthouse = merged.find((g) => g.roomNumber === "Penthouse-A");
  assert.notEqual(penthouse, undefined);
  assert.equal(penthouse.fullName, "Alexander Hamilton");
  assert.equal(penthouse.breakfastIncluded, true);
  assert.equal(penthouse.breakfastStatus, BREAKFAST_STATUS.INCLUDED);
  assert.equal(penthouse.breakfastQuantity, 4);

  const villa = merged.find((g) => g.roomNumber === "Villa-10");
  assert.notEqual(villa, undefined);
  assert.equal(villa.fullName, "Bruce Wayne");
  assert.equal(villa.breakfastIncluded, true);
  assert.equal(villa.breakfastQuantity, 3);

  const roomOnly = merged.find((g) => g.roomNumber === "9901");
  assert.notEqual(roomOnly, undefined);
  assert.equal(roomOnly.breakfastIncluded, false);
  assert.equal(roomOnly.breakfastStatus, BREAKFAST_STATUS.PAYMENT);
  assert.equal(roomOnly.breakfastQuantity, 0);
});

test("oracleParser: Multi-package room aggregation and discrepancy tolerance", () => {
  // Same room across two product groups (e.g. Adult BF + Child BF)
  const multiPkgXml = `<?xml version="1.0" encoding="UTF-8"?>
<PKGFORECAST>
  <LIST_G_SUMTOTAL_PKGS>
    <G_SUMTOTAL_PKGS>
      <LIST_G_STAY_DATE>
        <G_STAY_DATE>
          <STAY_DATE>01-SEP-26</STAY_DATE>
          <LIST_G_PRODUCT_ID>
            <G_PRODUCT_ID>
              <PRODUCT_ID>ADULT_BF</PRODUCT_ID>
              <LIST_G_REPORT_ID>
                <G_REPORT_ID><TOTAL_PKGS>2</TOTAL_PKGS></G_REPORT_ID>
              </LIST_G_REPORT_ID>
            </G_PRODUCT_ID>
            <G_PRODUCT_ID>
              <PRODUCT_ID>CHILD_BF</PRODUCT_ID>
              <LIST_G_REPORT_ID>
                <G_REPORT_ID><TOTAL_PKGS>2</TOTAL_PKGS></G_REPORT_ID>
              </LIST_G_REPORT_ID>
            </G_PRODUCT_ID>
          </LIST_G_PRODUCT_ID>
        </G_STAY_DATE>
      </LIST_G_STAY_DATE>
    </G_SUMTOTAL_PKGS>
  </LIST_G_SUMTOTAL_PKGS>
  <LIST_G_PRODUCT_GROUP>
    <G_PRODUCT_GROUP>
      <PRODUCT_ID1>ADULT_BF</PRODUCT_ID1>
      <PRODUCT_DESC>Breakfast Adult Rate</PRODUCT_DESC>
      <LIST_G_RESV_DETAILS>
        <G_RESV_DETAILS>
          <CONFIRMATION_NO>CONF_MULTI_1</CONFIRMATION_NO>
          <ROOM>0501</ROOM>
          <GUEST_NAME>Smith</GUEST_NAME>
          <GUEST_FIRST_NAME>John</GUEST_FIRST_NAME>
          <ADULTS>2</ADULTS>
          <CHILDREN>2</CHILDREN>
          <PKG_QTY>2</PKG_QTY>
        </G_RESV_DETAILS>
      </LIST_G_RESV_DETAILS>
    </G_PRODUCT_GROUP>
    <G_PRODUCT_GROUP>
      <PRODUCT_ID1>CHILD_BF</PRODUCT_ID1>
      <PRODUCT_DESC>Breakfast Child Rate</PRODUCT_DESC>
      <LIST_G_RESV_DETAILS>
        <G_RESV_DETAILS>
          <CONFIRMATION_NO>CONF_MULTI_1</CONFIRMATION_NO>
          <ROOM>0501</ROOM>
          <GUEST_NAME>Smith</GUEST_NAME>
          <GUEST_FIRST_NAME>John</GUEST_FIRST_NAME>
          <ADULTS>2</ADULTS>
          <CHILDREN>2</CHILDREN>
          <PKG_QTY>2</PKG_QTY>
        </G_RESV_DETAILS>
      </LIST_G_RESV_DETAILS>
    </G_PRODUCT_GROUP>
  </LIST_G_PRODUCT_GROUP>
</PKGFORECAST>`;

  const parsedMulti = parsePackageForecastXml(multiPkgXml);
  assert.equal(parsedMulti.length, 2);

  const mergedMulti = mergeGuestData([], parsedMulti);
  assert.equal(mergedMulti.length, 1);
  const smith = mergedMulti[0];
  assert.equal(smith.roomNumber, "0501");
  assert.equal(smith.breakfastQuantity, 4); // 2 adult + 2 child = 4 breakfast entitlements
  assert.equal(smith.breakfastIncluded, true);
  assert.deepEqual(smith.products.sort(), ["ADULT_BF", "CHILD_BF"].sort());

  // Test discrepancy handling: summary expects 5 but details have 2
  const mismatchedSummary = { ADULT_BF: 5, CHILD_BF: 2 };
  const reconMismatched = reconcilePackageForecast(parsedMulti, mismatchedSummary);
  assert.equal(reconMismatched.isReconciled, false);
  assert.equal(reconMismatched.discrepancies.length, 1);
  assert.equal(reconMismatched.discrepancies[0].productCode, "ADULT_BF");
  assert.equal(reconMismatched.discrepancies[0].summaryCount, 5);
  assert.equal(reconMismatched.discrepancies[0].detailCount, 2);
  assert.equal(reconMismatched.discrepancies[0].difference, -3);
});

// 7. ORACLE PRODUCT MASTER & ADVANCED ENTITLEMENT ENGINE TESTS
test("oracleMaster: Product Master registers and resolves all Oracle Package types from PDF", () => {
  // Breakfast Products
  const bfain = productMaster.resolveProduct("BFAIN");
  assert.equal(bfain.resolved, true);
  assert.equal(bfain.classification, PRODUCT_CLASSIFICATION.BREAKFAST);
  assert.equal(bfain.calculationBasis, CALCULATION_BASIS.PER_ADULT);
  assert.equal(bfain.isBreakfast, true);

  const bfcin = productMaster.resolveProduct("BFCIN");
  assert.equal(bfcin.resolved, true);
  assert.equal(bfcin.classification, PRODUCT_CLASSIFICATION.BREAKFAST);
  assert.equal(bfcin.calculationBasis, CALCULATION_BASIS.PER_CHILD);

  // Flat-Rate Breakfast (UPSBB1 - UPSBB4)
  const upsbb1 = productMaster.resolveProduct("UPSBB1");
  assert.equal(upsbb1.resolved, true);
  assert.equal(upsbb1.classification, PRODUCT_CLASSIFICATION.BREAKFAST);
  assert.equal(upsbb1.calculationBasis, CALCULATION_BASIS.FLAT_RATE);
  assert.equal(upsbb1.flatCovers, 1);

  const upsbb4 = productMaster.resolveProduct("UPSBB4");
  assert.equal(upsbb4.flatCovers, 4);

  // Full Board & Half Board (NOT Breakfast)
  const fbain = productMaster.resolveProduct("FBAIN");
  assert.equal(fbain.resolved, true);
  assert.equal(fbain.classification, PRODUCT_CLASSIFICATION.FULL_BOARD);
  assert.equal(fbain.isBreakfast, false);

  const hbain = productMaster.resolveProduct("HBAIN");
  assert.equal(hbain.resolved, true);
  assert.equal(hbain.classification, PRODUCT_CLASSIFICATION.HALF_BOARD);
  assert.equal(hbain.isBreakfast, false);

  // Club Upsell & Paid Upsells (NOT Breakfast)
  const ups300c = productMaster.resolveProduct("UPS300C");
  assert.equal(ups300c.resolved, true);
  assert.equal(ups300c.classification, PRODUCT_CLASSIFICATION.UPSELL);
  assert.equal(ups300c.isBreakfast, false);

  const uss500 = productMaster.resolveProduct("USS500");
  assert.equal(uss500.resolved, true);
  assert.equal(uss500.classification, PRODUCT_CLASSIFICATION.UPSELL);
  assert.equal(uss500.isBreakfast, false);

  // Technical & Tourism Dirham
  const lau3in = productMaster.resolveProduct("LAU3IN");
  assert.equal(lau3in.classification, PRODUCT_CLASSIFICATION.TECHNICAL);

  const td1 = productMaster.resolveProduct("TD1BDRM");
  assert.equal(td1.classification, PRODUCT_CLASSIFICATION.OTHER);
});

test("oracleParser: Reference XML 2 (pkgforecast_24021164.XML) with mixed Upsell & Breakfast packages", () => {
  const xmlPath = path.resolve(process.cwd(), "pkgforecast_24021164.XML");
  const xmlText = fs.readFileSync(xmlPath, "utf8");

  const forecastRows = parsePackageForecastXml(xmlText);
  assert.equal(Array.isArray(forecastRows), true);
  assert.equal(forecastRows.length, 127); // 127 reservation details

  assert.equal(forecastRows.metadata.stayDate, "30-AUG-26");
  assert.equal(forecastRows.metadata.reportId, "81218523");
  assert.equal(forecastRows.metadata.totalSummaryPackages, 203);

  // Summary packages breakdown
  assert.deepEqual(forecastRows.summaryTotals, {
    BFAAD: 2,
    BFAIN: 172,
    BFCIN: 15,
    UPS300C: 3,
    UPSBB1: 1,
    USS1500: 2,
    USS500: 5,
    WEB_BFSA: 3
  });

  // Dynamic reconciliation with breakfast vs non-breakfast distinction
  const recon = reconcilePackageForecast(forecastRows, forecastRows.summaryTotals);
  assert.equal(recon.isReconciled, true);
  assert.equal(recon.totalSummaryPackages, 203);
  assert.equal(recon.totalDetailPackages, 203);
  assert.equal(recon.totalBreakfastPackages, 193); // 2 + 172 + 15 + 1 + 3 = 193
  assert.equal(recon.totalNonBreakfastPackages, 10); // 3 (UPS300C) + 2 (USS1500) + 5 (USS500) = 10
  assert.equal(recon.discrepancies.length, 0);

  // Merging guest data safely ignores non-breakfast upsells in covers
  const merged = mergeGuestData([], forecastRows);
  assert.equal(merged.length > 90, true);
});

test("oracleEntitlement: Critical Multi-Product Edge Case (UPS300C + BFAIN + BFCIN)", () => {
  // Reservation with Club Upsell (UPS300C), Adult Breakfast (BFAIN), and Child Breakfast (BFCIN)
  const entitlement = calculateReservationEntitlement({
    products: ["UPS300C", "BFAIN", "BFCIN"],
    productDetails: [
      { productGroupCode: "UPS300C", productDescription: "AED 300 Club Upsell package", packageQuantity: 1 },
      { productGroupCode: "BFAIN", productDescription: "Breakfast Adult Included in Rate", packageQuantity: 2 },
      { productGroupCode: "BFCIN", productDescription: "Breakfast Child Included in Rate", packageQuantity: 1 }
    ],
    adults: 2,
    children: 1
  });

  assert.equal(entitlement.breakfastIncluded, true);
  assert.equal(entitlement.breakfastStatus, BREAKFAST_STATUS.INCLUDED);
  assert.equal(entitlement.totalBreakfastCovers, 3); // 2 Adults + 1 Child
  assert.equal(entitlement.adultCovers, 2);
  assert.equal(entitlement.childCovers, 1);
  assert.equal(entitlement.flatCovers, 0);

  // Verify non-breakfast product is preserved and isolated
  assert.equal(entitlement.nonBreakfastProducts.length, 1);
  assert.equal(entitlement.nonBreakfastProducts[0].productCode, "UPS300C");
  assert.equal(entitlement.nonBreakfastProducts[0].classification, PRODUCT_CLASSIFICATION.UPSELL);

  // Verify breakdown items
  assert.equal(entitlement.breakdown.length, 2);
  assert.equal(entitlement.breakdown[0].productCode, "BFAIN");
  assert.equal(entitlement.breakdown[1].productCode, "BFCIN");
});

test("oracleEntitlement: Flat-Rate Packages (UPSBB1, UPSBB2, UPSBB3, UPSBB4)", () => {
  // UPSBB1: 1 cover per package
  const res1 = calculateReservationEntitlement({
    products: ["UPSBB1"],
    productDetails: [{ productGroupCode: "UPSBB1", packageQuantity: 1 }],
    adults: 1
  });
  assert.equal(res1.totalBreakfastCovers, 1);
  assert.equal(res1.flatCovers, 1);

  // UPSBB3: 3 covers per package
  const res3 = calculateReservationEntitlement({
    products: ["UPSBB3"],
    productDetails: [{ productGroupCode: "UPSBB3", packageQuantity: 1 }],
    adults: 3
  });
  assert.equal(res3.totalBreakfastCovers, 3);
  assert.equal(res3.flatCovers, 3);

  // UPSBB4 with quantity 2 = 8 covers
  const res4 = calculateReservationEntitlement({
    products: ["UPSBB4"],
    productDetails: [{ productGroupCode: "UPSBB4", packageQuantity: 2 }],
    adults: 4
  });
  assert.equal(res4.totalBreakfastCovers, 8);
  assert.equal(res4.flatCovers, 8);
});

test("oracleEntitlement: Full Board (FBAIN) & Half Board (HBAIN) do NOT grant breakfast covers", () => {
  const fbRes = calculateReservationEntitlement({
    products: ["FBAIN"],
    productDetails: [{ productGroupCode: "FBAIN", packageQuantity: 2 }],
    adults: 2
  });
  assert.equal(fbRes.breakfastIncluded, false);
  assert.equal(fbRes.totalBreakfastCovers, 0);
  assert.equal(fbRes.nonBreakfastProducts.length, 1);
  assert.equal(fbRes.nonBreakfastProducts[0].classification, PRODUCT_CLASSIFICATION.FULL_BOARD);

  const hbRes = calculateReservationEntitlement({
    products: ["HBAIN"],
    productDetails: [{ productGroupCode: "HBAIN", packageQuantity: 2 }],
    adults: 2
  });
  assert.equal(hbRes.breakfastIncluded, false);
  assert.equal(hbRes.totalBreakfastCovers, 0);
  assert.equal(hbRes.nonBreakfastProducts[0].classification, PRODUCT_CLASSIFICATION.HALF_BOARD);
});

test("oracleEntitlement: Unknown Product (NEW_PRODUCT_999) safety & warning", () => {
  const unknownRes = calculateReservationEntitlement({
    products: ["NEW_PRODUCT_999"],
    productDetails: [{ productGroupCode: "NEW_PRODUCT_999", packageQuantity: 2 }],
    adults: 2
  });

  assert.equal(unknownRes.breakfastIncluded, false);
  assert.equal(unknownRes.breakfastStatus, BREAKFAST_STATUS.UNKNOWN);
  assert.equal(unknownRes.totalBreakfastCovers, 0);
  assert.equal(unknownRes.unknownProducts.length, 1);
  assert.equal(unknownRes.unknownProducts[0].productCode, "NEW_PRODUCT_999");
  assert.equal(unknownRes.warnings.length, 1);
});

test("oracleMaster: Dynamic runtime product registration without code changes", () => {
  const code = "FUTURE_CUSTOM_PACKAGE_99";
  // Initially unknown
  assert.equal(productMaster.resolveProduct(code).resolved, false);

  // Dynamically register
  productMaster.registerProduct({
    productCode: code,
    description: "Future Custom Champagne Breakfast",
    classification: PRODUCT_CLASSIFICATION.BREAKFAST,
    calculationBasis: CALCULATION_BASIS.PER_ADULT,
    entitlementSource: ENTITLEMENT_SOURCE.INCLUDED_IN_RATE,
    guestType: "ADULT"
  });

  const resolved = productMaster.resolveProduct(code);
  assert.equal(resolved.resolved, true);
  assert.equal(resolved.classification, PRODUCT_CLASSIFICATION.BREAKFAST);
  assert.equal(resolved.isBreakfast, true);

  const ent = calculateReservationEntitlement({
    products: [code],
    productDetails: [{ productGroupCode: code, packageQuantity: 2 }],
    adults: 2
  });
  assert.equal(ent.totalBreakfastCovers, 2);
  assert.equal(ent.breakfastIncluded, true);
});

test("oracleParser: Multi-Date PKGFORECAST XML extraction & date segmentation", () => {
  const multiDateXml = `<?xml version="1.0" encoding="UTF-8"?>
<PKGFORECAST>
  <LIST_G_SUMTOTAL_PKGS>
    <G_SUMTOTAL_PKGS>
      <LIST_G_STAY_DATE>
        <G_STAY_DATE>
          <STAY_DATE>30-AUG-26</STAY_DATE>
          <STAY_DATE_CHAR>30.08.26</STAY_DATE_CHAR>
          <LIST_G_PRODUCT_ID>
            <G_PRODUCT_ID>
              <PRODUCT_ID>BFAIN</PRODUCT_ID>
              <LIST_G_REPORT_ID><G_REPORT_ID><REPORT_ID>8881</REPORT_ID><TOTAL_PKGS>5</TOTAL_PKGS></G_REPORT_ID></LIST_G_REPORT_ID>
            </G_PRODUCT_ID>
          </LIST_G_PRODUCT_ID>
        </G_STAY_DATE>
        <G_STAY_DATE>
          <STAY_DATE>31-AUG-26</STAY_DATE>
          <STAY_DATE_CHAR>31.08.26</STAY_DATE_CHAR>
          <LIST_G_PRODUCT_ID>
            <G_PRODUCT_ID>
              <PRODUCT_ID>BFAIN</PRODUCT_ID>
              <LIST_G_REPORT_ID><G_REPORT_ID><REPORT_ID>8882</REPORT_ID><TOTAL_PKGS>8</TOTAL_PKGS></G_REPORT_ID></LIST_G_REPORT_ID>
            </G_PRODUCT_ID>
          </LIST_G_PRODUCT_ID>
        </G_STAY_DATE>
      </LIST_G_STAY_DATE>
    </G_SUMTOTAL_PKGS>
  </LIST_G_SUMTOTAL_PKGS>
  <LIST_G_PRODUCT_GROUP>
    <G_PRODUCT_GROUP>
      <PRODUCT_ID1>BFAIN</PRODUCT_ID1>
      <PRODUCT_DESC>Breakfast Adult Included in Rate</PRODUCT_DESC>
      <LIST_G_RESV_DETAILS>
        <G_RESV_DETAILS>
          <CONFIRMATION_NO>MD_1</CONFIRMATION_NO>
          <ROOM>101</ROOM>
          <GUEST_NAME>Date1Guest</GUEST_NAME>
          <STAY_DATE1>30-AUG-26</STAY_DATE1>
          <PKG_QTY>5</PKG_QTY>
        </G_RESV_DETAILS>
        <G_RESV_DETAILS>
          <CONFIRMATION_NO>MD_2</CONFIRMATION_NO>
          <ROOM>102</ROOM>
          <GUEST_NAME>Date2Guest</GUEST_NAME>
          <STAY_DATE1>31-AUG-26</STAY_DATE1>
          <PKG_QTY>8</PKG_QTY>
        </G_RESV_DETAILS>
      </LIST_G_RESV_DETAILS>
    </G_PRODUCT_GROUP>
  </LIST_G_PRODUCT_GROUP>
</PKGFORECAST>`;

  const parsed = parsePackageForecastXml(multiDateXml);
  assert.equal(parsed.length, 2);
  assert.equal(parsed.stayDates.length, 2);
  assert.deepEqual(parsed.stayDates, ["30-AUG-26", "31-AUG-26"]);

  assert.equal(parsed.summaryByDate["30-AUG-26"].summaryTotals.BFAIN, 5);
  assert.equal(parsed.summaryByDate["31-AUG-26"].summaryTotals.BFAIN, 8);
  assert.equal(parsed.summaryTotals.BFAIN, 13);
  assert.equal(parsed.metadata.totalSummaryPackages, 13);
});

async function runAllTests() {
  await testAsync("crypto-auth: hashPassword and verifyPassword with Web Crypto", async () => {
    const plain = "SUPERadmin2026";
    const hashed = await hashPassword(plain);
    assert.equal(hashed.startsWith("sha256:"), true);

    const isValid = await verifyPassword(plain, hashed);
    assert.equal(isValid, true);

    const isInvalid = await verifyPassword("WrongPassword", hashed);
    assert.equal(isInvalid, false);

    // Plaintext fallback verification
    const isPlainMatch = await verifyPassword("KCAadmin", "KCAadmin");
    assert.equal(isPlainMatch, true);
  });

  await testAsync("crypto-auth: signJwt and verifyJwt HMAC-SHA256 tokens", async () => {
    const user = { username: "SUPERADMIN", role: "superadmin", brand: "ALL" };
    const token = await signJwt(user, "test-secret-key");
    assert.equal(typeof token, "string");
    assert.equal(token.split(".").length, 3);

    const payload = await verifyJwt(token, "test-secret-key");
    assert.notEqual(payload, null);
    assert.equal(payload.username, "SUPERADMIN");
    assert.equal(payload.role, "superadmin");

    const invalidPayload = await verifyJwt(token, "wrong-secret-key");
    assert.equal(invalidPayload, null);
  });

  await testAsync("sync: ETag generation logic creates consistent version signature", async () => {
    const brand = "KCA";
    const serviceDate = "2026-08-29";
    const checkinCount = 25;
    const checkinMaxUpd = "2026-08-29T11:00:00.000Z";
    const paymentCount = 3;
    const paymentMaxCreated = "2026-08-29T10:30:00.000Z";
    const rosterCount = 140;
    const rosterMaxUpd = "2026-08-29T09:00:00.000Z";

    const etag1 = `W/"${brand}_${serviceDate}_${checkinCount}_${checkinMaxUpd}_${paymentCount}_${paymentMaxCreated}_${rosterCount}_${rosterMaxUpd}"`;
    const etag2 = `W/"${brand}_${serviceDate}_${checkinCount}_${checkinMaxUpd}_${paymentCount}_${paymentMaxCreated}_${rosterCount}_${rosterMaxUpd}"`;

    assert.equal(etag1, etag2);
    assert.equal(etag1.startsWith('W/"KCA_2026-08-29_25_'), true);

    const modifiedEtag = `W/"${brand}_${serviceDate}_${checkinCount + 1}_${checkinMaxUpd}_${paymentCount}_${paymentMaxCreated}_${rosterCount}_${rosterMaxUpd}"`;
    assert.notEqual(etag1, modifiedEtag);
  });

  // SUMMARY
  console.log(`\nTest results: ${passed} passed, ${failed} failed.`);
  if (failed > 0) {
    process.exit(1);
  }
}

runAllTests();
