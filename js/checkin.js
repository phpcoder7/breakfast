import {
  BREAKFAST_STATUS,
  GUEST_TYPES,
  createId,
  formatTime,
  normalizeRoom,
  normalizeText,
  parseInteger,
  toTimestamp
} from "./utils.js";

function buildBaseRecord({
  roomNumber,
  guestName,
  adults,
  children,
  tableNumber,
  mealPlan,
  products,
  breakfastStatus,
  guestType,
  actualGuests,
  confirmationNumber = "",
  discount = "",
  entitlementExceeded = false,
  extraGuests = 0,
  breakfastQuantity = 0,
  statusOverride = false
}) {
  const timestamp = toTimestamp();

  return {
    id: createId("checkin"),
    timestamp,
    timeLabel: formatTime(timestamp),
    roomNumber,
    guestName,
    adults,
    children,
    tableNumber,
    mealPlan,
    products,
    breakfastStatus,
    actualGuests,
    guestType,
    confirmationNumber,
    discount,
    entitlementExceeded,
    extraGuests,
    breakfastQuantity,
    statusOverride: Boolean(statusOverride),
    paid: false,
    paidAt: ""
  };
}

export function detectDuplicate(checkIns, guest) {
  return Boolean(findHotelCheckInByRoom(checkIns, guest.roomNumber));
}

export function findHotelCheckInByRoom(checkIns, roomNumber) {
  const room = normalizeRoom(roomNumber);
  if (!room) {
    return null;
  }

  return (
    checkIns.find(
      (record) => record.guestType === GUEST_TYPES.HOTEL && normalizeRoom(record.roomNumber) === room
    ) || null
  );
}

export function checkEntitlement(guest, actualGuests) {
  if (guest.breakfastStatus !== BREAKFAST_STATUS.INCLUDED) {
    return false;
  }

  return parseInteger(actualGuests, 0) > parseInteger(guest.breakfastQuantity, 0);
}

export function getExtraGuests(guest, actualGuests) {
  if (guest.breakfastStatus !== BREAKFAST_STATUS.INCLUDED) {
    return 0;
  }

  const actual = parseInteger(actualGuests, 0);
  const entitled = parseInteger(guest.breakfastQuantity, 0);
  return Math.max(0, actual - entitled);
}

export function applyLateArrivals(record, { additionalGuests, tableNumber }) {
  const added = Math.max(1, parseInteger(additionalGuests, 1));
  const previousActual = parseInteger(record.actualGuests, 0);
  const nextActual = previousActual + added;
  const breakfastQuantity = parseInteger(record.breakfastQuantity, 0);
  const previousExtras = parseInteger(record.extraGuests, 0);

  let extraGuests = 0;
  let entitlementExceeded = false;

  if (record.breakfastStatus === BREAKFAST_STATUS.INCLUDED) {
    extraGuests = Math.max(0, nextActual - breakfastQuantity);
    entitlementExceeded = extraGuests > 0;
  }

  const nextTable = normalizeText(tableNumber) || record.tableNumber;
  const extrasIncreased = extraGuests > previousExtras;
  const resetPaid = extrasIncreased && Boolean(record.paid);

  return {
    ...record,
    actualGuests: nextActual,
    tableNumber: nextTable,
    extraGuests,
    entitlementExceeded,
    paid: resetPaid ? false : Boolean(record.paid),
    paidAt: resetPaid ? "" : record.paidAt || "",
    lateArrivalAdded: added
  };
}

export function createHotelCheckIn(guest, formValues) {
  const actualGuests = parseInteger(
    formValues.actualGuests,
    parseInteger(guest.adults, 0) + parseInteger(guest.children, 0)
  );
  const breakfastQuantity = parseInteger(guest.breakfastQuantity, 0);
  const extraGuests = getExtraGuests(guest, actualGuests);
  const entitlementExceeded = extraGuests > 0;

  const products = Array.isArray(guest.products) ? guest.products.join(", ") : String(guest.products || "-");

  return buildBaseRecord({
    roomNumber: guest.roomNumber,
    guestName: guest.fullName,
    adults: guest.adults,
    children: guest.children,
    tableNumber: normalizeText(formValues.tableNumber),
    mealPlan: guest.mealPlan,
    products,
    breakfastStatus: guest.breakfastStatus,
    guestType: GUEST_TYPES.HOTEL,
    actualGuests,
    confirmationNumber: guest.confirmationNumber,
    entitlementExceeded,
    extraGuests,
    breakfastQuantity,
    statusOverride: Boolean(guest.statusOverride)
  });
}

export function createWalkInCheckIn(formValues) {
  return buildBaseRecord({
    roomNumber: "Walk-In",
    guestName: normalizeText(formValues.guestName) || "Walk-In Guest",
    adults: parseInteger(formValues.adults, 1),
    children: parseInteger(formValues.children, 0),
    tableNumber: normalizeText(formValues.tableNumber),
    mealPlan: "-",
    products: "-",
    breakfastStatus: BREAKFAST_STATUS.PAYMENT,
    guestType: GUEST_TYPES.WALK_IN,
    actualGuests: parseInteger(formValues.adults, 1) + parseInteger(formValues.children, 0)
  });
}

export function createApartmentCheckIn(formValues) {
  return buildBaseRecord({
    roomNumber: `APT ${normalizeText(formValues.apartmentNumber)}`,
    guestName: normalizeText(formValues.guestName) || "Apartment Guest",
    adults: parseInteger(formValues.adults, 1),
    children: parseInteger(formValues.children, 0),
    tableNumber: normalizeText(formValues.tableNumber),
    mealPlan: "-",
    products: "-",
    breakfastStatus: BREAKFAST_STATUS.PAYMENT,
    guestType: GUEST_TYPES.APARTMENT,
    actualGuests: parseInteger(formValues.adults, 1) + parseInteger(formValues.children, 0),
    discount: "20%"
  });
}

export function createManualGuest(formValues) {
  const adults = parseInteger(formValues.adults, 1);
  const children = parseInteger(formValues.children, 0);
  const breakfastStatus = normalizeText(formValues.breakfastStatus) || BREAKFAST_STATUS.INCLUDED;
  const breakfastQuantity =
    breakfastStatus === BREAKFAST_STATUS.INCLUDED
      ? parseInteger(formValues.breakfastQuantity, adults + children)
      : 0;

  return {
    id: createId("guest"),
    roomNumber: normalizeRoom(formValues.roomNumber),
    fullName: normalizeText(formValues.guestName) || "Hotel Guest",
    adults,
    children,
    mealPlan: normalizeText(formValues.mealPlan) || "FO Correction",
    products: ["FO Override"],
    productDescriptions: ["Manual entry — Front Office correction"],
    breakfastStatus,
    breakfastQuantity,
    confirmationNumber: normalizeText(formValues.confirmationNumber),
    arrival: "",
    departure: "",
    reservationStatus: "Manual",
    rateCode: "",
    guestType: GUEST_TYPES.HOTEL,
    statusOverride: true
  };
}

export function updateCheckInTableNumber(checkIns, checkInId, tableNumber) {
  const nextTable = normalizeText(tableNumber);
  if (!checkInId || !nextTable) {
    return checkIns;
  }

  return checkIns.map((record) => {
    if (record.id !== checkInId) {
      return record;
    }

    return {
      ...record,
      tableNumber: nextTable
    };
  });
}
