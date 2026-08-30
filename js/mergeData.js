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
  parseInteger,
  uniqueList
} from "./utils.js";

const BREAKFAST_SEMANTIC_REGEX = /\b(breakfast|petit[- ]?d[eé]jeuner|fr[uü]hst[uü]ck|fruhstick|desayuno|colazione|buffet|morning|bed\s*(?:&|and)\s*breakfast|b[&/]b|lounge|bkf|bb)\b/i;
const NO_BREAKFAST_REGEX = /\b(room\s*only|no\s*breakfast|ro|ep|roomonly)\b/i;

/**
 * Dynamically classifies whether a product code, description, or rate code represents breakfast.
 * Uses semantic keyword analysis, Oracle description text, and fallback code tables.
 * @param {object} params
 * @param {string} [params.code]
 * @param {string} [params.description]
 * @param {string} [params.rateCode]
 * @param {string[]} [params.products]
 * @param {string[]} [params.descriptions]
 * @returns {boolean}
 */
export function isBreakfastSemantic({ code = "", description = "", rateCode = "", products = [], descriptions = [] } = {}) {
  const normCode = normalizeCode(code);
  const normRate = normalizeCode(rateCode);
  const normDesc = normalizeText(description);

  // 1. Explicit No-Breakfast Check
  if (normCode && (NO_BREAKFAST_CODES[normCode] || NO_BREAKFAST_REGEX.test(normCode))) {
    return false;
  }
  if (normDesc && NO_BREAKFAST_REGEX.test(normDesc)) {
    return false;
  }

  // 2. Known standard codes check (fast path)
  if (normCode && BREAKFAST_CODES[normCode]) {
    return true;
  }

  // 3. Semantic keyword analysis on description
  if (normDesc && BREAKFAST_SEMANTIC_REGEX.test(normDesc)) {
    return true;
  }

  // 4. Multiple descriptions check
  if (Array.isArray(descriptions) && descriptions.some((d) => d && BREAKFAST_SEMANTIC_REGEX.test(d))) {
    return true;
  }

  // 5. Code heuristics (BF prefix, BB code, BKF code)
  if (normCode && (normCode.startsWith("BF") || normCode.endsWith("BF") || normCode.includes("BB") || normCode.includes("BKF") || BREAKFAST_SEMANTIC_REGEX.test(normCode))) {
    return true;
  }

  // 6. Rate code heuristics (BNB, WHOBB, BB, PROBB)
  if (normRate && (normRate.includes("BB") || normRate.includes("BNB") || normRate.includes("BKF") || BREAKFAST_SEMANTIC_REGEX.test(normRate))) {
    return true;
  }

  // 7. Any product codes list check
  if (Array.isArray(products) && products.some((p) => {
    const c = normalizeCode(p);
    return Boolean(BREAKFAST_CODES[c]) || c.startsWith("BF") || c.includes("BB") || BREAKFAST_SEMANTIC_REGEX.test(c);
  })) {
    return true;
  }

  return false;
}

export function isBreakfastCode(code) {
  return isBreakfastSemantic({ code });
}

export function isNoBreakfastSemantic({ code = "", description = "", products = [], descriptions = [] } = {}) {
  const normCode = normalizeCode(code);
  const normDesc = normalizeText(description);

  if (normCode && (NO_BREAKFAST_CODES[normCode] || NO_BREAKFAST_REGEX.test(normCode))) {
    return true;
  }
  if (normDesc && NO_BREAKFAST_REGEX.test(normDesc)) {
    return true;
  }
  if (Array.isArray(products) && products.some((p) => {
    const c = normalizeCode(p);
    return Boolean(NO_BREAKFAST_CODES[c]) || NO_BREAKFAST_REGEX.test(c);
  })) {
    return true;
  }
  if (Array.isArray(descriptions) && descriptions.some((d) => d && NO_BREAKFAST_REGEX.test(d))) {
    return true;
  }
  return false;
}

export function isNoBreakfastCode(code) {
  return isNoBreakfastSemantic({ code });
}

export function aggregateForecastRows(forecastRows, keyForRow = (row) => normalizeText(row?.confirmationNumber) || `room:${normalizeRoom(row?.roomNumber)}`) {
  const grouped = new Map();
  const safeRows = Array.isArray(forecastRows) ? forecastRows : [];

  safeRows.forEach((row) => {
    if (!row) return;
    const key = keyForRow(row);
    if (!key) {
      return;
    }

    const current = grouped.get(key) || {
      confirmationNumber: normalizeText(row.confirmationNumber),
      roomNumber: normalizeRoom(row.roomNumber),
      firstName: row.firstName || "",
      lastName: row.lastName || "",
      adults: row.adults ?? 0,
      children: row.children ?? 0,
      reservationStatus: row.reservationStatus || "CHECKED IN",
      arrival: row.arrival || "",
      departure: row.departure || "",
      rateCode: row.rateCode || "",
      products: [],
      productDescriptions: [],
      breakfastQuantity: 0,
      packageQuantity: 0
    };

    if (row.products && Array.isArray(row.products)) {
      current.products.push(...row.products);
    }
    if (row.productGroupCode) {
      current.products.push(row.productGroupCode);
    }
    if (row.productDescription) {
      current.productDescriptions.push(row.productDescription);
    }

    const rowQty = parseInteger(row.packageQuantity, 0);
    current.packageQuantity += rowQty;

    const isRowBreakfast = isBreakfastSemantic({
      code: row.productGroupCode,
      description: row.productDescription,
      rateCode: row.rateCode,
      products: row.products
    });

    if (isRowBreakfast) {
      // Dynamic data-driven quantity accumulation
      current.breakfastQuantity += rowQty || Math.max((row.adults || 0) + (row.children || 0), 1);
    }

    current.reservationStatus = current.reservationStatus || row.reservationStatus;
    current.rateCode = current.rateCode || row.rateCode;
    current.adults = Math.max(current.adults, row.adults ?? 0);
    current.children = Math.max(current.children, row.children ?? 0);

    grouped.set(key, current);
  });

  return grouped;
}

export function breakfastDecision(mealPlan, products = [], productDescriptions = [], breakfastQuantity = 0, adults = 0, children = 0, rateCode = "") {
  const mealCode = normalizeCode(mealPlan);
  const safeProducts = Array.isArray(products) ? products : [];
  const normalizedProducts = uniqueList(safeProducts.map((code) => normalizeCode(code)));
  const safeDescriptions = Array.isArray(productDescriptions) ? productDescriptions : (productDescriptions ? [productDescriptions] : []);

  if (isNoBreakfastSemantic({ code: mealCode, products: normalizedProducts, descriptions: safeDescriptions })) {
    return {
      breakfastIncluded: false,
      breakfastStatus: BREAKFAST_STATUS.PAYMENT,
      breakfastQuantity: 0
    };
  }

  const isIncluded =
    isBreakfastSemantic({ code: mealCode, products: normalizedProducts, descriptions: safeDescriptions, rateCode }) ||
    breakfastQuantity > 0;

  if (isIncluded) {
    return {
      breakfastIncluded: true,
      breakfastStatus: BREAKFAST_STATUS.INCLUDED,
      breakfastQuantity: breakfastQuantity || Math.max((adults || 0) + (children || 0), 0)
    };
  }

  if (mealCode || normalizedProducts.length || safeDescriptions.length) {
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

function guestFromForecast(packageData) {
  const products = uniqueList((packageData.products || []).map(normalizeCode));
  const productDescriptions = uniqueList(packageData.productDescriptions || []);
  const breakfast = breakfastDecision(
    "",
    products,
    productDescriptions,
    packageData.breakfastQuantity || 0,
    packageData.adults,
    packageData.children,
    packageData.rateCode || ""
  );

  return {
    id: createId("guest"),
    roomNumber: normalizeRoom(packageData.roomNumber),
    firstName: packageData.firstName || "",
    lastName: packageData.lastName || "",
    fullName: joinName(packageData.firstName, packageData.lastName),
    arrival: packageData.arrival || "",
    departure: packageData.departure || "",
    adults: packageData.adults || 0,
    children: packageData.children || 0,
    confirmationNumber: normalizeText(packageData.confirmationNumber),
    mealPlan: "",
    products,
    productDescriptions,
    packageQuantity: packageData.packageQuantity || 0,
    reservationStatus: packageData.reservationStatus || "CHECKED IN",
    rateCode: packageData.rateCode || "",
    breakfastIncluded: breakfast.breakfastIncluded,
    breakfastStatus: breakfast.breakfastStatus,
    breakfastQuantity: breakfast.breakfastQuantity,
    guestType: GUEST_TYPES.HOTEL
  };
}

/**
 * Merges Meal Plan and Package Forecast datasets with full single/dual report tolerance.
 * @param {Array<object>} mealPlanRows
 * @param {Array<object>} packageForecastRows
 * @returns {Array<object>}
 */
export function mergeGuestData(mealPlanRows = [], packageForecastRows = []) {
  const safeMealRows = Array.isArray(mealPlanRows) ? mealPlanRows : [];
  const safeForecastRows = Array.isArray(packageForecastRows) ? packageForecastRows : [];

  const forecastByConfirmation = aggregateForecastRows(
    safeForecastRows.filter((row) => normalizeText(row?.confirmationNumber)),
    (row) => normalizeText(row.confirmationNumber)
  );
  const forecastByRoom = aggregateForecastRows(
    safeForecastRows.filter((row) => normalizeRoom(row?.roomNumber)),
    (row) => normalizeRoom(row.roomNumber)
  );

  const matchedConfirmations = new Set();
  const matchedRooms = new Set();

  const guestsFromMealPlan = safeMealRows.map((mealRow) => {
    const packageData = resolvePackageMatch(mealRow, forecastByConfirmation, forecastByRoom);
    if (packageData) {
      const confirmation = normalizeText(packageData.confirmationNumber);
      const room = normalizeRoom(packageData.roomNumber);
      if (confirmation) {
        matchedConfirmations.add(confirmation);
      }
      if (room) {
        matchedRooms.add(room);
      }
    }

    const products = uniqueList([
      ...(packageData?.products || []),
      mealRow.mealPlan
    ].map(normalizeCode));
    const productDescriptions = uniqueList(packageData?.productDescriptions || []);
    const fullName = joinName(mealRow.firstName, mealRow.lastName) || joinName(packageData?.firstName, packageData?.lastName);
    const breakfast = breakfastDecision(
      mealRow.mealPlan,
      products,
      productDescriptions,
      packageData?.breakfastQuantity || 0,
      mealRow.adults,
      mealRow.children,
      packageData?.rateCode || ""
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

  const guestsFromForecast = Array.from(forecastByConfirmation.values())
    .filter((packageData) => {
      const confirmation = normalizeText(packageData.confirmationNumber);
      const room = normalizeRoom(packageData.roomNumber);
      return !matchedConfirmations.has(confirmation) && !matchedRooms.has(room);
    })
    .map(guestFromForecast);

  const forecastWithoutConfirmation = Array.from(forecastByRoom.values())
    .filter((packageData) => !normalizeText(packageData.confirmationNumber))
    .filter((packageData) => !matchedRooms.has(normalizeRoom(packageData.roomNumber)))
    .map(guestFromForecast);

  return [...guestsFromMealPlan, ...guestsFromForecast, ...forecastWithoutConfirmation];
}

/**
 * Reconciles Oracle summary totals against parsed reservation details dynamically.
 * @param {Array<object>} packageForecastRows
 * @param {Record<string, number>} summaryTotals
 * @returns {{ isReconciled: boolean, totalSummaryPackages: number, totalDetailPackages: number, summaryTotals: Record<string, number>, detailTotals: Record<string, number>, discrepancies: Array<{ productCode: string, summaryCount: number, detailCount: number, difference: number }> }}
 */
export function reconcilePackageForecast(packageForecastRows = [], summaryTotals = {}) {
  const detailTotals = {};
  const safeRows = Array.isArray(packageForecastRows) ? packageForecastRows : [];

  safeRows.forEach((row) => {
    const code = normalizeCode(row.productGroupCode || (Array.isArray(row.products) ? row.products[0] : ""));
    if (!code) return;
    const qty = parseInteger(row.packageQuantity, 1);
    detailTotals[code] = (detailTotals[code] || 0) + qty;
  });

  const allCodes = uniqueList([...Object.keys(summaryTotals || {}), ...Object.keys(detailTotals)]);
  const discrepancies = [];
  let isReconciled = true;
  let totalSummaryPkgs = 0;
  let totalDetailPkgs = 0;

  allCodes.forEach((code) => {
    const summaryCount = summaryTotals ? (summaryTotals[code] ?? 0) : 0;
    const detailCount = detailTotals[code] ?? 0;
    totalSummaryPkgs += summaryCount;
    totalDetailPkgs += detailCount;
    const diff = detailCount - summaryCount;
    if (diff !== 0) {
      isReconciled = false;
      discrepancies.push({
        productCode: code,
        summaryCount,
        detailCount,
        difference: diff
      });
    }
  });

  return {
    isReconciled,
    totalSummaryPackages: totalSummaryPkgs,
    totalDetailPackages: totalDetailPkgs,
    summaryTotals: summaryTotals || {},
    detailTotals,
    discrepancies
  };
}
