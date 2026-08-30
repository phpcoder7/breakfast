/**
 * Oracle-Aware Breakfast Entitlement Engine
 * Decouples XML parsing, Product Master resolution, and Breakfast Cover calculations.
 * Supports multi-product reservations, calculation bases, and explainable breakdowns.
 */

import {
  CALCULATION_BASIS,
  ENTITLEMENT_SOURCE,
  PRODUCT_CLASSIFICATION,
  productMaster
} from "./productMaster.js";
import {
  BREAKFAST_STATUS,
  normalizeCode,
  parseInteger
} from "./utils.js";

/**
 * @typedef {object} ProductEntitlementItem
 * @property {string} productCode
 * @property {string} description
 * @property {string} classification
 * @property {string} calculationBasis
 * @property {string} entitlementSource
 * @property {number} covers
 * @property {number} packageQuantity
 * @property {string} [guestType]
 * @property {boolean} isBreakfast
 */

/**
 * @typedef {object} ReservationEntitlementResult
 * @property {boolean} breakfastIncluded
 * @property {string} breakfastStatus
 * @property {number} totalBreakfastCovers
 * @property {number} adultCovers
 * @property {number} childCovers
 * @property {number} flatCovers
 * @property {ProductEntitlementItem[]} breakdown
 * @property {object[]} nonBreakfastProducts
 * @property {object[]} unknownProducts
 * @property {string[]} warnings
 */

/**
 * Evaluates breakfast entitlement for a reservation given its products, meal plan, and guest counts.
 * @param {object} params
 * @param {string} [params.mealPlan]
 * @param {string[]} [params.products]
 * @param {Array<object>} [params.productDetails] - Array of { productGroupCode, productDescription, packageQuantity, calculationRule, ... }
 * @param {number} [params.adults]
 * @param {number} [params.children]
 * @param {string} [params.rateCode]
 * @returns {ReservationEntitlementResult}
 */
export function calculateReservationEntitlement({
  mealPlan = "",
  products = [],
  productDetails = [],
  adults = 0,
  children = 0,
  rateCode = ""
} = {}) {
  const normMealPlan = normalizeCode(mealPlan);
  const rawProducts = Array.isArray(products) ? products : [];
  const safeDetails = Array.isArray(productDetails) ? productDetails : [];
  const numAdults = Math.max(parseInteger(adults, 0), 0);
  const numChildren = Math.max(parseInteger(children, 0), 0);

  const breakdown = [];
  const nonBreakfastProducts = [];
  const unknownProducts = [];
  const warnings = [];

  let adultCovers = 0;
  let childCovers = 0;
  let flatCovers = 0;
  let hasExplicitNoBreakfast = false;

  const processedCodes = new Set();
  let hasForecastBreakfast = false;

  // 1. Process Detailed Forecast Product Rows first (hierarchical G_PRODUCT_GROUP rows)
  if (safeDetails.length > 0) {
    safeDetails.forEach((detail) => {
      const code = normalizeCode(detail.productGroupCode || detail.productCode);
      if (!code) return;

      const resolved = productMaster.resolveProduct(code, {
        description: detail.productDescription,
        calculationRule: detail.calculationRule
      });

      const pkgQty = parseInteger(detail.packageQuantity || detail.quantity, 1);

      if (resolved.classification === PRODUCT_CLASSIFICATION.BREAKFAST) {
        hasForecastBreakfast = true;
        let covers = 0;

        if (resolved.calculationBasis === CALCULATION_BASIS.FLAT_RATE) {
          const flatPerPkg = resolved.flatCovers || 1;
          covers = flatPerPkg * pkgQty;
          flatCovers += covers;
        } else if (resolved.guestType === "CHILD" || resolved.calculationBasis === CALCULATION_BASIS.PER_CHILD) {
          covers = pkgQty;
          childCovers += covers;
        } else if (resolved.guestType === "ADULT" || resolved.calculationBasis === CALCULATION_BASIS.PER_ADULT) {
          covers = pkgQty;
          adultCovers += covers;
        } else {
          // Per Person or generic breakfast
          covers = pkgQty || Math.max(numAdults + numChildren, 1);
          adultCovers += covers;
        }

        breakdown.push({
          productCode: code,
          description: resolved.description,
          classification: resolved.classification,
          calculationBasis: resolved.calculationBasis,
          entitlementSource: resolved.entitlementSource,
          covers,
          packageQuantity: pkgQty,
          guestType: resolved.guestType || (resolved.flatCovers ? "FLAT" : "PERSON"),
          isBreakfast: true
        });
      } else if (!resolved.resolved) {
        unknownProducts.push(resolved);
        warnings.push(`Unknown product code '${code}' in forecast details`);
      } else {
        nonBreakfastProducts.push({
          productCode: code,
          description: resolved.description,
          classification: resolved.classification,
          packageQuantity: pkgQty
        });
      }

      processedCodes.add(code);
    });
  }

  // 2. Process any remaining raw products in products[] list
  rawProducts.forEach((rawCode) => {
    const code = normalizeCode(rawCode);
    if (!code || processedCodes.has(code) || code === normMealPlan) return;

    const resolved = productMaster.resolveProduct(code, { rateCode });

    if (resolved.classification === PRODUCT_CLASSIFICATION.BREAKFAST) {
      let covers = 0;
      if (resolved.calculationBasis === CALCULATION_BASIS.FLAT_RATE) {
        covers = resolved.flatCovers || 1;
        flatCovers += covers;
      } else if (resolved.guestType === "CHILD" || resolved.calculationBasis === CALCULATION_BASIS.PER_CHILD) {
        covers = numChildren;
        childCovers += covers;
      } else if (resolved.guestType === "ADULT" || resolved.calculationBasis === CALCULATION_BASIS.PER_ADULT) {
        covers = numAdults > 0 ? numAdults : (numChildren === 0 ? 1 : 0);
        adultCovers += covers;
      } else {
        covers = (numAdults + numChildren) > 0 ? (numAdults + numChildren) : 1;
        adultCovers += covers;
      }

      if (covers > 0) {
        hasForecastBreakfast = true;
        breakdown.push({
          productCode: code,
          description: resolved.description,
          classification: resolved.classification,
          calculationBasis: resolved.calculationBasis,
          entitlementSource: resolved.entitlementSource,
          covers,
          packageQuantity: 1,
          guestType: resolved.guestType || (resolved.flatCovers ? "FLAT" : "PERSON"),
          isBreakfast: true
        });
      }
    } else if (!resolved.resolved) {
      unknownProducts.push(resolved);
      warnings.push(`Unknown product code '${code}' in products list`);
    } else {
      nonBreakfastProducts.push({
        productCode: code,
        description: resolved.description,
        classification: resolved.classification
      });
    }

    processedCodes.add(code);
  });

  // 3. Process Meal Plan (if present)
  // If forecast already gave explicit breakfast packages, mealPlan is not double-counted.
  if (normMealPlan) {
    const resolvedMeal = productMaster.resolveProduct(normMealPlan, { rateCode });
    if (resolvedMeal.classification === PRODUCT_CLASSIFICATION.BREAKFAST) {
      if (!hasForecastBreakfast) {
        const covers = Math.max(numAdults + numChildren, 1);
        adultCovers += numAdults || covers;
        childCovers += numChildren;
        breakdown.push({
          productCode: normMealPlan,
          description: resolvedMeal.description || "Meal Plan Breakfast",
          classification: resolvedMeal.classification,
          calculationBasis: resolvedMeal.calculationBasis,
          entitlementSource: resolvedMeal.entitlementSource || ENTITLEMENT_SOURCE.INCLUDED_IN_RATE,
          covers,
          packageQuantity: 1,
          guestType: "ALL",
          isBreakfast: true
        });
      }
    } else if (normMealPlan === "RO" || normMealPlan === "EP" || resolvedMeal.description.toLowerCase().includes("room only")) {
      if (!hasForecastBreakfast) {
        hasExplicitNoBreakfast = true;
      }
      nonBreakfastProducts.push({
        productCode: normMealPlan,
        description: resolvedMeal.description,
        classification: resolvedMeal.classification
      });
    } else if (!resolvedMeal.resolved) {
      unknownProducts.push(resolvedMeal);
      warnings.push(`Unknown meal plan code '${normMealPlan}'`);
    } else {
      nonBreakfastProducts.push(resolvedMeal);
    }
  }

  const totalBreakfastCovers = adultCovers + childCovers + flatCovers;

  // Status & Decision
  let breakfastIncluded = false;
  let breakfastStatus = BREAKFAST_STATUS.UNKNOWN;

  if (totalBreakfastCovers > 0) {
    breakfastIncluded = true;
    breakfastStatus = BREAKFAST_STATUS.INCLUDED;
  } else if (hasExplicitNoBreakfast) {
    breakfastIncluded = false;
    breakfastStatus = BREAKFAST_STATUS.PAYMENT;
  } else if (nonBreakfastProducts.length > 0 && !normMealPlan) {
    // Only non-breakfast packages (e.g. Room Only with Upsell or Laundry)
    breakfastIncluded = false;
    breakfastStatus = BREAKFAST_STATUS.PAYMENT;
  } else if (unknownProducts.length > 0) {
    breakfastIncluded = false;
    breakfastStatus = BREAKFAST_STATUS.UNKNOWN;
  }

  return {
    breakfastIncluded,
    breakfastStatus,
    totalBreakfastCovers,
    adultCovers,
    childCovers,
    flatCovers,
    breakdown,
    nonBreakfastProducts,
    unknownProducts,
    warnings
  };
}
