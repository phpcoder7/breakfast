import { BREAKFAST_STATUS, reasonLabel } from "./utils.js";

export function requiresPayment(record) {
  return (
    record.guestType === "Walk-In" ||
    record.guestType === "Apartment" ||
    record.breakfastStatus === BREAKFAST_STATUS.PAYMENT
  );
}

export function createPaymentRecord(checkInRecord) {
  return {
    id: checkInRecord.id,
    timestamp: checkInRecord.timestamp,
    displayLocation: checkInRecord.roomNumber,
    guestName: checkInRecord.guestName,
    tableNumber: checkInRecord.tableNumber,
    guestType: checkInRecord.guestType,
    reason: reasonLabel(checkInRecord.guestType, checkInRecord.breakfastStatus)
  };
}

export function syncPaymentList(checkIns) {
  return checkIns
    .filter(requiresPayment)
    .map((record) => createPaymentRecord(record));
}
