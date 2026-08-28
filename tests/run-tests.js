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
  uniqueList
} from "../js/utils.js";
import { mergeGuestData } from "../js/mergeData.js";
import { searchGuests, exactRoomMatch } from "../js/search.js";
import {
  createHotelCheckIn,
  createWalkInCheckIn,
  createApartmentCheckIn,
  createManualGuest,
  checkEntitlement,
  getExtraGuests,
  findHotelCheckInByRoom,
  findActiveCheckInsByTable,
  checkOutCheckIn
} from "../js/checkin.js";
import {
  requiresPayment,
  chargeableGuests,
  amountAed,
  syncPaymentList,
  markPaymentPaid
} from "../js/payment.js";
import { getTablesForUser } from "../js/tables.js";

console.log("=== Running Comprehensive Test Suite ===");

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

// 1. UTILS TESTS
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

// 3. SEARCH TESTS
test("search: room search with variants (leading zero)", () => {
  const guests = [
    { roomNumber: "0105", firstName: "David", lastName: "Miller", confirmationNumber: "C1" },
    { roomNumber: "1050", firstName: "Eva", lastName: "Long", confirmationNumber: "C2" }
  ];

  const res1 = searchGuests(guests, "105");
  assert.equal(res1.length >= 1, true);
  assert.equal(res1.some((g) => g.roomNumber === "0105"), true);

  const exact = exactRoomMatch(guests, "105");
  assert.equal(exact.roomNumber, "0105");
});

test("search: guest name and confirmation matching", () => {
  const guests = [
    { roomNumber: "301", firstName: "Mohamed", lastName: "Salah", confirmationNumber: "M987" }
  ];

  assert.equal(searchGuests(guests, "salah").length, 1);
  assert.equal(searchGuests(guests, "mohamed").length, 1);
  assert.equal(searchGuests(guests, "M987").length, 1);
  assert.equal(searchGuests(guests, "nonexistent").length, 0);
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
  assert.equal(chargeableGuests(checkin), 2);
  assert.equal(amountAed(checkin), 300); // 2 * 150 AED
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
  assert.equal(chargeableGuests(walkIn), 2);
  assert.equal(amountAed(walkIn), 300); // 2 * 150 AED

  const apt = createApartmentCheckIn({
    roomNumber: "Apt 501",
    guestName: "Tenant",
    tableNumber: "6",
    adults: "2",
    children: "0"
  });
  assert.equal(apt.guestType, GUEST_TYPES.APARTMENT);
  assert.equal(requiresPayment(apt), true);
  assert.equal(chargeableGuests(apt), 2);
  assert.equal(amountAed(apt), 240); // 2 * 120 AED
});

// 5. PAYMENT QUEUE & CHECKOUT TESTS
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
  assert.equal(payments[0].amountAed, 150);

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

// SUMMARY
console.log(`\nTest results: ${passed} passed, ${failed} failed.`);
if (failed > 0) {
  process.exit(1);
}
