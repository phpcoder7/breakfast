import { BREAKFAST_STATUS, reasonLabel } from "./utils.js";

export function requiresPayment(record) {
  return (
    record.guestType === "Walk-In" ||
    record.guestType === "Apartment" ||
    record.breakfastStatus === BREAKFAST_STATUS.PAYMENT ||
    Boolean(record.entitlementExceeded)
  );
}

export function paymentReason(record) {
  if (record.entitlementExceeded) {
    const count = Number(record.extraGuests) || 0;
    return `Extra guests (${count}) — entitlement exceeded`;
  }

  return reasonLabel(record.guestType, record.breakfastStatus);
}

export function createPaymentRecord(checkInRecord) {
  return {
    id: checkInRecord.id,
    timestamp: checkInRecord.timestamp,
    displayLocation: checkInRecord.roomNumber,
    guestName: checkInRecord.guestName,
    tableNumber: checkInRecord.tableNumber,
    guestType: checkInRecord.guestType,
    reason: paymentReason(checkInRecord),
    extraGuests: checkInRecord.extraGuests || 0,
    entitlementExceeded: Boolean(checkInRecord.entitlementExceeded)
  };
}

export function syncPaymentList(checkIns) {
  return checkIns
    .filter(requiresPayment)
    .map((record) => createPaymentRecord(record));
}
