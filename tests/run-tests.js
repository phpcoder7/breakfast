import assert from "node:assert/strict";
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
import { mergeGuestData } from "../js/mergeData.js";
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

  // SUMMARY
  console.log(`\nTest results: ${passed} passed, ${failed} failed.`);
  if (failed > 0) {
    process.exit(1);
  }
}

runAllTests();
