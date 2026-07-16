import {
  BREAKFAST_CODES,
  BREAKFAST_STATUS,
  GUEST_TYPES,
  NO_BREAKFAST_CODES,
  createId,
  joinName,
  normalizeCode,
  normalizeRoom,
  normalizeText,
  uniqueList
} from "./utils.js";

function isBreakfastCode(code) {
  return Boolean(BREAKFAST_CODES[normalizeCode(code)]);
}

function isNoBreakfastCode(code) {
  return Boolean(NO_BREAKFAST_CODES[normalizeCode(code)]);
}

function aggregateForecastRows(forecastRows) {
  const grouped = new Map();

  forecastRows.forEach((row) => {
    const key = normalizeText(row.confirmationNumber) || `room:${normalizeRoom(row.roomNumber)}`;
    const current = grouped.get(key) || {
      confirmationNumber: normalizeText(row.confirmationNumber),
      roomNumber: normalizeRoom(row.roomNumber),
      firstName: row.firstName,
      lastName: row.lastName,
      adults: row.adults,
      children: row.children,
      reservationStatus: row.reservationStatus,
      arrival: row.arrival,
      departure: row.departure,
      rateCode: row.rateCode,
      products: [],
      productDescriptions: [],
      breakfastQuantity: 0,
      packageQuantity: 0
    };

    current.products.push(...(row.products || []), row.productGroupCode);
    if (row.productDescription) {
      current.productDescriptions.push(row.productDescription);
    }
    current.packageQuantity += row.packageQuantity || 0;
    if (isBreakfastCode(row.productGroupCode)) {
      current.breakfastQuantity += row.packageQuantity || 0;
    }
    current.reservationStatus = current.reservationStatus || row.reservationStatus;
    current.rateCode = current.rateCode || row.rateCode;

    grouped.set(key, current);
  });

  return grouped;
}

function breakfastDecision(mealPlan, products, breakfastQuantity, adults, children) {
  const mealCode = normalizeCode(mealPlan);
  const normalizedProducts = uniqueList(products.map((code) => normalizeCode(code)));

  if (isNoBreakfastCode(mealCode)) {
    return {
      breakfastIncluded: false,
      breakfastStatus: BREAKFAST_STATUS.PAYMENT,
      breakfastQuantity: 0
    };
  }

  if (isBreakfastCode(mealCode) || normalizedProducts.some(isBreakfastCode)) {
    return {
      breakfastIncluded: true,
      breakfastStatus: BREAKFAST_STATUS.INCLUDED,
      breakfastQuantity: breakfastQuantity || Math.max((adults || 0) + (children || 0), 0)
    };
  }

  if (mealCode || normalizedProducts.length) {
    return {
      breakfastIncluded: false,
      breakfastStatus: BREAKFAST_STATUS.UNKNOWN,
      breakfastQuantity: 0
    };
  }

  return {
    breakfastIncluded: false,
    breakfastStatus: BREAKFAST_STATUS.UNKNOWN,
    breakfastQuantity: 0
  };
}

function resolvePackageMatch(mealRow, forecastByConfirmation, forecastByRoom) {
  const confirmationKey = normalizeText(mealRow.confirmationNumber);
  if (confirmationKey && forecastByConfirmation.has(confirmationKey)) {
    return forecastByConfirmation.get(confirmationKey);
  }

  const roomKey = normalizeRoom(mealRow.roomNumber);
  if (roomKey && forecastByRoom.has(roomKey)) {
    return forecastByRoom.get(roomKey);
  }

  return null;
}

export function mergeGuestData(mealPlanRows, packageForecastRows) {
  const forecastByConfirmation = aggregateForecastRows(
    packageForecastRows.filter((row) => normalizeText(row.confirmationNumber))
  );
  const forecastByRoom = aggregateForecastRows(
    packageForecastRows.filter((row) => normalizeRoom(row.roomNumber))
  );

  return mealPlanRows.map((mealRow) => {
    const packageData = resolvePackageMatch(mealRow, forecastByConfirmation, forecastByRoom);
    const products = uniqueList([
      ...(packageData?.products || []),
      mealRow.mealPlan
    ].map(normalizeCode));
    const productDescriptions = uniqueList(packageData?.productDescriptions || []);
    const fullName = joinName(mealRow.firstName, mealRow.lastName) || joinName(packageData?.firstName, packageData?.lastName);
    const breakfast = breakfastDecision(
      mealRow.mealPlan,
      products,
      packageData?.breakfastQuantity || 0,
      mealRow.adults,
      mealRow.children
    );

    return {
      id: createId("guest"),
      roomNumber: normalizeRoom(mealRow.roomNumber),
      firstName: mealRow.firstName || packageData?.firstName || "",
      lastName: mealRow.lastName || packageData?.lastName || "",
      fullName,
      arrival: mealRow.arrival || packageData?.arrival || "",
      departure: mealRow.departure || packageData?.departure || "",
      adults: mealRow.adults ?? packageData?.adults ?? 0,
      children: mealRow.children ?? packageData?.children ?? 0,
      confirmationNumber: normalizeText(mealRow.confirmationNumber || packageData?.confirmationNumber),
      mealPlan: normalizeCode(mealRow.mealPlan),
      products,
      productDescriptions,
      packageQuantity: packageData?.packageQuantity || 0,
      reservationStatus: packageData?.reservationStatus || "CHECKED IN",
      rateCode: packageData?.rateCode || "",
      breakfastIncluded: breakfast.breakfastIncluded,
      breakfastStatus: breakfast.breakfastStatus,
      breakfastQuantity: breakfast.breakfastQuantity,
      guestType: GUEST_TYPES.HOTEL
    };
  });
}
