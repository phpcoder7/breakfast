import {
  BREAKFAST_STATUS,
  GUEST_TYPES,
  reasonLabel,
  toTimestamp
} from "./utils.js";

export function requiresPayment(record) {
  return (
    record.guestType === GUEST_TYPES.WALK_IN ||
    record.guestType === "Walk-In" ||
    record.guestType === GUEST_TYPES.APARTMENT ||
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
    roomNumber: checkInRecord.roomNumber,
    guestName: checkInRecord.guestName,
    tableNumber: checkInRecord.tableNumber,
    guestType: checkInRecord.guestType,
    reason: paymentReason(checkInRecord),
    extraGuests: checkInRecord.extraGuests || 0,
    entitlementExceeded: Boolean(checkInRecord.entitlementExceeded),
    paid: Boolean(checkInRecord.paid),
    paidAt: checkInRecord.paidAt || ""
  };
}

export function syncPaymentList(checkIns) {
  return checkIns
    .filter(requiresPayment)
    .map((record) => createPaymentRecord(record))
    .sort((a, b) => Number(a.paid) - Number(b.paid) || String(b.timestamp).localeCompare(String(a.timestamp)));
}

export function markPaymentPaid(checkIns, paymentId) {
  const paidAt = toTimestamp();

  return checkIns.map((record) => {
    if (record.id !== paymentId) {
      return record;
    }

    return {
      ...record,
      paid: true,
      paidAt
    };
  });
}
