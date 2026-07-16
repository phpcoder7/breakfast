import {
  BREAKFAST_STATUS,
  GUEST_TYPES,
  createId,
  formatTime,
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
  discount = ""
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
    discount
  };
}

export function detectDuplicate(checkIns, guest) {
  return checkIns.some(
    (record) =>
      record.guestType === GUEST_TYPES.HOTEL &&
      record.roomNumber === guest.roomNumber
  );
}

export function checkEntitlement(guest, actualGuests) {
  if (guest.breakfastStatus !== BREAKFAST_STATUS.INCLUDED) {
    return false;
  }

  return parseInteger(actualGuests, 0) > parseInteger(guest.breakfastQuantity, 0);
}

export function createHotelCheckIn(guest, formValues) {
  const actualGuests = parseInteger(
    formValues.actualGuests,
    parseInteger(guest.adults, 0) + parseInteger(guest.children, 0)
  );

  return buildBaseRecord({
    roomNumber: guest.roomNumber,
    guestName: guest.fullName,
    adults: guest.adults,
    children: guest.children,
    tableNumber: normalizeText(formValues.tableNumber),
    mealPlan: guest.mealPlan,
    products: guest.products.join(", "),
    breakfastStatus: guest.breakfastStatus,
    guestType: GUEST_TYPES.HOTEL,
    actualGuests,
    confirmationNumber: guest.confirmationNumber
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
