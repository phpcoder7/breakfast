import {
  APARTMENT_PRICE_AED,
  BREAKFAST_PRICE_AED,
  BREAKFAST_STATUS,
  GUEST_TYPES,
  reasonLabel,
  toTimestamp
} from "./utils.js";

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

export function chargeableGuests(record) {
  if (record.entitlementExceeded) {
    return Number(record.extraGuests) || 0;
  }

  const actual = Number(record.actualGuests);
  if (Number.isFinite(actual) && actual > 0) {
    return actual;
  }

  const adults = Number(record.adults) || 0;
  const children = Number(record.children) || 0;
  return Math.max(0, adults + children);
}

export function unitPriceAed(record) {
  return record.guestType === GUEST_TYPES.APARTMENT ? APARTMENT_PRICE_AED : BREAKFAST_PRICE_AED;
}

export function amountAed(record) {
  return chargeableGuests(record) * unitPriceAed(record);
}

export function createPaymentRecord(checkInRecord) {
  const qty = chargeableGuests(checkInRecord);
  const unitPrice = unitPriceAed(checkInRecord);

  return {
    id: checkInRecord.id,
    timestamp: checkInRecord.timestamp,
    displayLocation: checkInRecord.roomNumber,
    guestName: checkInRecord.guestName,
    tableNumber: checkInRecord.tableNumber,
    guestType: checkInRecord.guestType,
    reason: paymentReason(checkInRecord),
    extraGuests: checkInRecord.extraGuests || 0,
    entitlementExceeded: Boolean(checkInRecord.entitlementExceeded),
    chargeableGuests: qty,
    unitPriceAed: unitPrice,
    amountAed: qty * unitPrice,
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
