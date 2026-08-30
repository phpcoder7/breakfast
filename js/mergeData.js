import {
  calculateReservationEntitlement
} from "./entitlement.js";
import {
  PRODUCT_CLASSIFICATION,
  productMaster
} from "./productMaster.js";
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
 * Delegates to Product Master first, with fallback to semantic keyword analysis.
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

  // 2. Product Master Resolution (Primary Source of Truth)
  if (normCode) {
    const resolved = productMaster.resolveProduct(normCode, { description: normDesc, rateCode: normRate });
    if (resolved.resolved) {
      return resolved.classification === PRODUCT_CLASSIFICATION.BREAKFAST;
    }
  }

  // 3. Known standard codes check (fast path)
  if (normCode && BREAKFAST_CODES[normCode]) {
    return true;
  }

  // 4. Semantic keyword analysis on description
  if (normDesc && BREAKFAST_SEMANTIC_REGEX.test(normDesc)) {
    return true;
  }

  // 5. Multiple descriptions check
  if (Array.isArray(descriptions) && descriptions.some((d) => d && BREAKFAST_SEMANTIC_REGEX.test(d))) {
    return true;
  }

  // 6. Code heuristics (BF prefix, BB code, BKF code)
  if (normCode && (normCode.startsWith("BF") || normCode.endsWith("BF") || normCode.includes("BB") || normCode.includes("BKF") || BREAKFAST_SEMANTIC_REGEX.test(normCode))) {
    return true;
  }

  // 7. Rate code heuristics (BNB, WHOBB, BB, PROBB)
  if (normRate && (normRate.includes("BB") || normRate.includes("BNB") || normRate.includes("BKF") || BREAKFAST_SEMANTIC_REGEX.test(normRate))) {
    return true;
  }

  // 8. Any product codes list check
  if (Array.isArray(products) && products.some((p) => {
    const c = normalizeCode(p);
    const res = productMaster.resolveProduct(c);
    if (res.resolved) return res.classification === PRODUCT_CLASSIFICATION.BREAKFAST;
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
  if (normCode) {
    const res = productMaster.resolveProduct(normCode);
    if (res.resolved && (res.classification === PRODUCT_CLASSIFICATION.OTHER || res.classification === PRODUCT_CLASSIFICATION.UPSELL) && !res.isBreakfast) {
      return false; // Upsell / other is not "explicit Room Only"
    }
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

/**
 * Aggregates forecast rows by confirmation number or room, preserving all detailed product items.
 * @param {Array<object>} forecastRows
 * @param {Function} [keyForRow]
 * @returns {Map<string, object>}
 */
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
      roomCategory: row.roomCategory || "",
      roomClass: row.roomClass || "",
      firstName: row.firstName || "",
      lastName: row.lastName || "",
      displayName: row.displayName || "",
      adults: row.adults ?? 0,
      children: row.children ?? 0,
      noOfRooms: row.noOfRooms ?? 1,
      reservationStatus: row.reservationStatus || "CHECKED IN",
      arrival: row.arrival || "",
      departure: row.departure || "",
      rateCode: row.rateCode || "",
      stayDate: row.stayDate || "",
      reportId: row.reportId || "",
      products: [],
      productDescriptions: [],
      productDetails: [],
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

    const rowQty = parseInteger(row.packageQuantity, 1);
    current.packageQuantity += rowQty;

    current.productDetails.push({
      productGroupCode: row.productGroupCode,
      productDescription: row.productDescription,
      packageQuantity: rowQty,
      quantity: row.quantity,
      persons: row.persons,
      calculationRule: row.calculationRule,
      stayDate: row.stayDate
    });

    current.reservationStatus = current.reservationStatus || row.reservationStatus;
    current.rateCode = current.rateCode || row.rateCode;
    current.adults = Math.max(current.adults, row.adults ?? 0);
    current.children = Math.max(current.children, row.children ?? 0);
    current.noOfRooms = Math.max(current.noOfRooms, row.noOfRooms ?? 1);

    grouped.set(key, current);
  });

  // Calculate breakfast quantities and entitlements for each aggregated group
  grouped.forEach((item) => {
    item.products = uniqueList(item.products.map(normalizeCode));
    item.productDescriptions = uniqueList(item.productDescriptions);

    const entitlement = calculateReservationEntitlement({
      products: item.products,
      productDetails: item.productDetails,
      adults: item.adults,
      children: item.children,
      rateCode: item.rateCode
    });

    item.breakfastQuantity = entitlement.totalBreakfastCovers;
    item.entitlement = entitlement;
  });

  return grouped;
}

/**
 * Entitlement decision wrapper maintaining backward compatibility.
 */
export function breakfastDecision(mealPlan, products = [], productDescriptions = [], breakfastQuantity = 0, adults = 0, children = 0, rateCode = "") {
  const safeProducts = Array.isArray(products) ? products : [];
  const safeDescriptions = Array.isArray(productDescriptions) ? productDescriptions : (productDescriptions ? [productDescriptions] : []);

  const result = calculateReservationEntitlement({
    mealPlan,
    products: safeProducts,
    productDetails: safeDescriptions.map((desc, idx) => ({
      productGroupCode: safeProducts[idx] || "",
      productDescription: desc
    })),
    adults,
    children,
    rateCode
  });

  return {
    breakfastIncluded: result.breakfastIncluded,
    breakfastStatus: result.breakfastStatus,
    breakfastQuantity: result.totalBreakfastCovers || breakfastQuantity
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

  const entitlement = packageData.entitlement || calculateReservationEntitlement({
    products,
    productDetails: packageData.productDetails || [],
    adults: packageData.adults,
    children: packageData.children,
    rateCode: packageData.rateCode || ""
  });

  return {
    id: createId("guest"),
    roomNumber: normalizeRoom(packageData.roomNumber),
    roomCategory: packageData.roomCategory || "",
    roomClass: packageData.roomClass || "",
    firstName: packageData.firstName || "",
    lastName: packageData.lastName || "",
    fullName: joinName(packageData.firstName, packageData.lastName) || packageData.displayName || "",
    arrival: packageData.arrival || "",
    departure: packageData.departure || "",
    adults: packageData.adults || 0,
    children: packageData.children || 0,
    noOfRooms: packageData.noOfRooms || 1,
    confirmationNumber: normalizeText(packageData.confirmationNumber),
    mealPlan: "",
    products,
    productDescriptions,
    productDetails: packageData.productDetails || [],
    packageQuantity: packageData.packageQuantity || 0,
    reservationStatus: packageData.reservationStatus || "CHECKED IN",
    rateCode: packageData.rateCode || "",
    stayDate: packageData.stayDate || "",
    reportId: packageData.reportId || "",
    breakfastIncluded: entitlement.breakfastIncluded,
    breakfastStatus: entitlement.breakfastStatus,
    breakfastQuantity: entitlement.totalBreakfastCovers,
    entitlementBreakdown: entitlement.breakdown,
    nonBreakfastProducts: entitlement.nonBreakfastProducts,
    unknownProducts: entitlement.unknownProducts,
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
    const productDetails = packageData?.productDetails || [];
    const fullName = joinName(mealRow.firstName, mealRow.lastName) || joinName(packageData?.firstName, packageData?.lastName);

    const entitlement = calculateReservationEntitlement({
      mealPlan: mealRow.mealPlan,
      products,
      productDetails,
      adults: mealRow.adults ?? packageData?.adults ?? 0,
      children: mealRow.children ?? packageData?.children ?? 0,
      rateCode: packageData?.rateCode || ""
    });

    return {
      id: createId("guest"),
      roomNumber: normalizeRoom(mealRow.roomNumber),
      roomCategory: packageData?.roomCategory || "",
      roomClass: packageData?.roomClass || "",
      firstName: mealRow.firstName || packageData?.firstName || "",
      lastName: mealRow.lastName || packageData?.lastName || "",
      fullName,
      arrival: mealRow.arrival || packageData?.arrival || "",
      departure: mealRow.departure || packageData?.departure || "",
      adults: mealRow.adults ?? packageData?.adults ?? 0,
      children: mealRow.children ?? packageData?.children ?? 0,
      noOfRooms: packageData?.noOfRooms || 1,
      confirmationNumber: normalizeText(mealRow.confirmationNumber || packageData?.confirmationNumber),
      mealPlan: normalizeCode(mealRow.mealPlan),
      products,
      productDescriptions,
      productDetails,
      packageQuantity: packageData?.packageQuantity || 0,
      reservationStatus: packageData?.reservationStatus || "CHECKED IN",
      rateCode: packageData?.rateCode || "",
      stayDate: packageData?.stayDate || "",
      reportId: packageData?.reportId || "",
      breakfastIncluded: entitlement.breakfastIncluded,
      breakfastStatus: entitlement.breakfastStatus,
      breakfastQuantity: entitlement.totalBreakfastCovers,
      entitlementBreakdown: entitlement.breakdown,
      nonBreakfastProducts: entitlement.nonBreakfastProducts,
      unknownProducts: entitlement.unknownProducts,
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
 * Distinguishes Breakfast packages from Non-Breakfast and Unknown packages.
 * @param {Array<object>} packageForecastRows
 * @param {Record<string, number>} summaryTotals
 * @returns {{ isReconciled: boolean, totalSummaryPackages: number, totalDetailPackages: number, totalBreakfastPackages: number, totalNonBreakfastPackages: number, summaryTotals: Record<string, number>, detailTotals: Record<string, number>, breakfastTotals: Record<string, number>, nonBreakfastTotals: Record<string, number>, unknownPackages: string[], discrepancies: Array<{ productCode: string, summaryCount: number, detailCount: number, difference: number, isBreakfast: boolean }> }}
 */
export function reconcilePackageForecast(packageForecastRows = [], summaryTotals = {}) {
  const detailTotals = {};
  const breakfastTotals = {};
  const nonBreakfastTotals = {};
  const safeRows = Array.isArray(packageForecastRows) ? packageForecastRows : [];

  safeRows.forEach((row) => {
    const code = normalizeCode(row.productGroupCode || (Array.isArray(row.products) ? row.products[0] : ""));
    if (!code) return;
    const qty = parseInteger(row.packageQuantity, 1);
    detailTotals[code] = (detailTotals[code] || 0) + qty;
  });

  const allCodes = uniqueList([...Object.keys(summaryTotals || {}), ...Object.keys(detailTotals)]);
  const discrepancies = [];
  const unknownPackages = [];
  let isReconciled = true;
  let totalSummaryPkgs = 0;
  let totalDetailPkgs = 0;
  let totalBreakfastPkgs = 0;
  let totalNonBreakfastPkgs = 0;

  allCodes.forEach((code) => {
    const summaryCount = summaryTotals ? (summaryTotals[code] ?? 0) : 0;
    const detailCount = detailTotals[code] ?? 0;
    totalSummaryPkgs += summaryCount;
    totalDetailPkgs += detailCount;

    const resolved = productMaster.resolveProduct(code);
    if (!resolved.resolved) {
      unknownPackages.push(code);
    }

    if (resolved.classification === PRODUCT_CLASSIFICATION.BREAKFAST) {
      breakfastTotals[code] = detailCount;
      totalBreakfastPkgs += detailCount;
    } else {
      nonBreakfastTotals[code] = detailCount;
      totalNonBreakfastPkgs += detailCount;
    }

    const diff = detailCount - summaryCount;
    if (diff !== 0) {
      isReconciled = false;
      discrepancies.push({
        productCode: code,
        summaryCount,
        detailCount,
        difference: diff,
        isBreakfast: resolved.classification === PRODUCT_CLASSIFICATION.BREAKFAST
      });
    }
  });

  return {
    isReconciled,
    totalSummaryPackages: totalSummaryPkgs,
    totalDetailPackages: totalDetailPkgs,
    totalBreakfastPackages: totalBreakfastPkgs,
    totalNonBreakfastPackages: totalNonBreakfastPkgs,
    summaryTotals: summaryTotals || {},
    detailTotals,
    breakfastTotals,
    nonBreakfastTotals,
    unknownPackages: uniqueList(unknownPackages),
    discrepancies
  };
}
