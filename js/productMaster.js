/**
 * Oracle Product Master & Classification Registry
 * Provides a data-driven, synchronizable registry for Oracle Package Codes.
 * Preserves Oracle metadata: product_type, pos_inventory, forecast_group, calculation_rule, etc.
 */

import { normalizeCode, normalizeText } from "./utils.js";

export const PRODUCT_CLASSIFICATION = {
  BREAKFAST: "BREAKFAST",
  FULL_BOARD: "FULL_BOARD",
  HALF_BOARD: "HALF_BOARD",
  UPSELL: "UPSELL",
  TECHNICAL: "TECHNICAL",
  OTHER_FOOD_BEVERAGE: "OTHER_FOOD_BEVERAGE",
  OTHER: "OTHER",
  UNKNOWN: "UNKNOWN"
};

export const CALCULATION_BASIS = {
  PER_ADULT: "PER_ADULT",
  PER_CHILD: "PER_CHILD",
  FLAT_RATE: "FLAT_RATE",
  PER_PERSON: "PER_PERSON",
  PER_ROOM: "PER_ROOM",
  UNKNOWN: "UNKNOWN"
};

export const ENTITLEMENT_SOURCE = {
  INCLUDED_IN_RATE: "INCLUDED_IN_RATE",
  ADD_ON_PACKAGE: "ADD_ON_PACKAGE",
  FLAT_PACKAGE: "FLAT_PACKAGE",
  BREAKFAST_PRODUCT: "BREAKFAST_PRODUCT",
  UNKNOWN: "UNKNOWN"
};

/**
 * Pre-seeded Oracle Package Master definitions from Oracle Package Codes Master (Package Codes.PDF)
 * @type {Record<string, object>}
 */
const DEFAULT_ORACLE_PACKAGES = {
  // Extra Bed Packages
  BEDAD: {
    productCode: "BEDAD",
    productType: "Others",
    description: "Extra Bed Charge - Transient",
    posInventory: "N",
    forecastGroup: "Flat Rate",
    calculationRule: "1110",
    classification: PRODUCT_CLASSIFICATION.OTHER,
    calculationBasis: CALCULATION_BASIS.FLAT_RATE,
    entitlementSource: ENTITLEMENT_SOURCE.UNKNOWN,
    active: true
  },
  BEDTA: {
    productCode: "BEDTA",
    productType: "Others",
    description: "Extra Bed Charge - TA",
    posInventory: "N",
    forecastGroup: "Flat Rate",
    calculationRule: "1110",
    classification: PRODUCT_CLASSIFICATION.OTHER,
    calculationBasis: CALCULATION_BASIS.FLAT_RATE,
    entitlementSource: ENTITLEMENT_SOURCE.UNKNOWN,
    active: true
  },

  // Breakfast Packages
  BFAAD: {
    productCode: "BFAAD",
    productType: "Others",
    description: "Breakfast Adult Add On Package",
    posInventory: "Breakfast",
    forecastGroup: "Breakfast",
    calculationRule: "Per Adult",
    classification: PRODUCT_CLASSIFICATION.BREAKFAST,
    calculationBasis: CALCULATION_BASIS.PER_ADULT,
    entitlementSource: ENTITLEMENT_SOURCE.ADD_ON_PACKAGE,
    guestType: "ADULT",
    active: true
  },
  BFAG: {
    productCode: "BFAG",
    productType: "Others",
    description: "Breakfast Adult Group",
    posInventory: "Breakfast",
    forecastGroup: "Breakfast",
    calculationRule: "Per Adult",
    classification: PRODUCT_CLASSIFICATION.BREAKFAST,
    calculationBasis: CALCULATION_BASIS.PER_ADULT,
    entitlementSource: ENTITLEMENT_SOURCE.INCLUDED_IN_RATE,
    guestType: "ADULT",
    active: true
  },
  BFAIN: {
    productCode: "BFAIN",
    productType: "Others",
    description: "Breakfast Adult Included in Rate",
    posInventory: "Breakfast",
    forecastGroup: "Breakfast",
    calculationRule: "Per Adult",
    classification: PRODUCT_CLASSIFICATION.BREAKFAST,
    calculationBasis: CALCULATION_BASIS.PER_ADULT,
    entitlementSource: ENTITLEMENT_SOURCE.INCLUDED_IN_RATE,
    guestType: "ADULT",
    active: true
  },
  BFCAD: {
    productCode: "BFCAD",
    productType: "Others",
    description: "Breakfast Child Add On Package",
    posInventory: "Breakfast",
    forecastGroup: "Breakfast",
    calculationRule: "Per Child",
    classification: PRODUCT_CLASSIFICATION.BREAKFAST,
    calculationBasis: CALCULATION_BASIS.PER_CHILD,
    entitlementSource: ENTITLEMENT_SOURCE.ADD_ON_PACKAGE,
    guestType: "CHILD",
    active: true
  },
  BFCIN: {
    productCode: "BFCIN",
    productType: "Others",
    description: "Breakfast Child Included in Rate",
    posInventory: "Breakfast",
    forecastGroup: "Breakfast",
    calculationRule: "Per Child",
    classification: PRODUCT_CLASSIFICATION.BREAKFAST,
    calculationBasis: CALCULATION_BASIS.PER_CHILD,
    entitlementSource: ENTITLEMENT_SOURCE.INCLUDED_IN_RATE,
    guestType: "CHILD",
    active: true
  },
  COMPBB: {
    productCode: "COMPBB",
    productType: "Others",
    description: "BB Comp Rooms",
    posInventory: "Breakfast",
    forecastGroup: "Breakfast",
    calculationRule: "Per Adult",
    classification: PRODUCT_CLASSIFICATION.BREAKFAST,
    calculationBasis: CALCULATION_BASIS.PER_ADULT,
    entitlementSource: ENTITLEMENT_SOURCE.INCLUDED_IN_RATE,
    guestType: "ADULT",
    active: true
  },

  // Flat-Rate Breakfast Packages (UPSBB1 - UPSBB4)
  UPSBB1: {
    productCode: "UPSBB1",
    productType: "Others",
    description: "Breakfast 1 person",
    posInventory: "Breakfast",
    forecastGroup: "Flat Rate",
    calculationRule: "1226",
    classification: PRODUCT_CLASSIFICATION.BREAKFAST,
    calculationBasis: CALCULATION_BASIS.FLAT_RATE,
    entitlementSource: ENTITLEMENT_SOURCE.FLAT_PACKAGE,
    flatCovers: 1,
    active: true
  },
  UPSBB2: {
    productCode: "UPSBB2",
    productType: "Others",
    description: "Breakfast 2 person",
    posInventory: "Breakfast",
    forecastGroup: "Flat Rate",
    calculationRule: "1226",
    classification: PRODUCT_CLASSIFICATION.BREAKFAST,
    calculationBasis: CALCULATION_BASIS.FLAT_RATE,
    entitlementSource: ENTITLEMENT_SOURCE.FLAT_PACKAGE,
    flatCovers: 2,
    active: true
  },
  UPSBB3: {
    productCode: "UPSBB3",
    productType: "Others",
    description: "Breakfast 3 people",
    posInventory: "Breakfast",
    forecastGroup: "Flat Rate",
    calculationRule: "1226",
    classification: PRODUCT_CLASSIFICATION.BREAKFAST,
    calculationBasis: CALCULATION_BASIS.FLAT_RATE,
    entitlementSource: ENTITLEMENT_SOURCE.FLAT_PACKAGE,
    flatCovers: 3,
    active: true
  },
  UPSBB4: {
    productCode: "UPSBB4",
    productType: "Others",
    description: "Breakfast 4 people",
    posInventory: "Breakfast",
    forecastGroup: "Flat Rate",
    calculationRule: "1226",
    classification: PRODUCT_CLASSIFICATION.BREAKFAST,
    calculationBasis: CALCULATION_BASIS.FLAT_RATE,
    entitlementSource: ENTITLEMENT_SOURCE.FLAT_PACKAGE,
    flatCovers: 4,
    active: true
  },

  // Web Breakfast Packages
  WEB_BFSA: {
    productCode: "WEB_BFSA",
    productType: "Others",
    description: "Breakfast - Adult",
    posInventory: "Breakfast",
    forecastGroup: "Breakfast",
    calculationRule: "Per Adult",
    classification: PRODUCT_CLASSIFICATION.BREAKFAST,
    calculationBasis: CALCULATION_BASIS.PER_ADULT,
    entitlementSource: ENTITLEMENT_SOURCE.BREAKFAST_PRODUCT,
    guestType: "ADULT",
    active: true
  },
  WEB_BFSC: {
    productCode: "WEB_BFSC",
    productType: "Others",
    description: "Breakfast - Child",
    posInventory: "Breakfast",
    forecastGroup: "Breakfast",
    calculationRule: "Per Child",
    classification: PRODUCT_CLASSIFICATION.BREAKFAST,
    calculationBasis: CALCULATION_BASIS.PER_CHILD,
    entitlementSource: ENTITLEMENT_SOURCE.BREAKFAST_PRODUCT,
    guestType: "CHILD",
    active: true
  },

  // Full Board Packages (FB)
  FBAAD: {
    productCode: "FBAAD",
    productType: "Others",
    description: "FB Adult Add On Package",
    posInventory: "Other food and beverage",
    forecastGroup: "Other food and beverage",
    calculationRule: "Per Adult",
    classification: PRODUCT_CLASSIFICATION.FULL_BOARD,
    calculationBasis: CALCULATION_BASIS.PER_ADULT,
    entitlementSource: ENTITLEMENT_SOURCE.UNKNOWN,
    active: true
  },
  FBAIN: {
    productCode: "FBAIN",
    productType: "Others",
    description: "FB Adult Included in Rate",
    posInventory: "Other food and beverage",
    forecastGroup: "Other food and beverage",
    calculationRule: "Per Adult",
    classification: PRODUCT_CLASSIFICATION.FULL_BOARD,
    calculationBasis: CALCULATION_BASIS.PER_ADULT,
    entitlementSource: ENTITLEMENT_SOURCE.UNKNOWN,
    active: true
  },
  FBCAD: {
    productCode: "FBCAD",
    productType: "Others",
    description: "FB Child Add On Package",
    posInventory: "Other food and beverage",
    forecastGroup: "Other food and beverage",
    calculationRule: "Per Child",
    classification: PRODUCT_CLASSIFICATION.FULL_BOARD,
    calculationBasis: CALCULATION_BASIS.PER_CHILD,
    entitlementSource: ENTITLEMENT_SOURCE.UNKNOWN,
    active: true
  },
  FBCIN: {
    productCode: "FBCIN",
    productType: "Others",
    description: "FB Child Included in Rate",
    posInventory: "Other food and beverage",
    forecastGroup: "Other food and beverage",
    calculationRule: "Per Child",
    classification: PRODUCT_CLASSIFICATION.FULL_BOARD,
    calculationBasis: CALCULATION_BASIS.PER_CHILD,
    entitlementSource: ENTITLEMENT_SOURCE.UNKNOWN,
    active: true
  },
  FBCOMP: {
    productCode: "FBCOMP",
    productType: "Others",
    description: "FB Complementary",
    posInventory: "Other food and beverage",
    forecastGroup: "Other food and beverage",
    calculationRule: "Per Adult",
    classification: PRODUCT_CLASSIFICATION.FULL_BOARD,
    calculationBasis: CALCULATION_BASIS.PER_ADULT,
    entitlementSource: ENTITLEMENT_SOURCE.UNKNOWN,
    active: true
  },
  WEB_FBSA: {
    productCode: "WEB_FBSA",
    productType: "Others",
    description: "Full Board - Adult",
    posInventory: "Other food and beverage",
    forecastGroup: "Other food and beverage",
    calculationRule: "Per Adult",
    classification: PRODUCT_CLASSIFICATION.FULL_BOARD,
    calculationBasis: CALCULATION_BASIS.PER_ADULT,
    entitlementSource: ENTITLEMENT_SOURCE.UNKNOWN,
    active: true
  },
  WEB_FBSC: {
    productCode: "WEB_FBSC",
    productType: "Others",
    description: "Full Board - Child",
    posInventory: "Other food and beverage",
    forecastGroup: "Other food and beverage",
    calculationRule: "Per Child",
    classification: PRODUCT_CLASSIFICATION.FULL_BOARD,
    calculationBasis: CALCULATION_BASIS.PER_CHILD,
    entitlementSource: ENTITLEMENT_SOURCE.UNKNOWN,
    active: true
  },

  // Half Board Packages (HB)
  HBAAD: {
    productCode: "HBAAD",
    productType: "Others",
    description: "HB Adult Add On Package",
    posInventory: "Other food and beverage",
    forecastGroup: "Other food and beverage",
    calculationRule: "Per Adult",
    classification: PRODUCT_CLASSIFICATION.HALF_BOARD,
    calculationBasis: CALCULATION_BASIS.PER_ADULT,
    entitlementSource: ENTITLEMENT_SOURCE.UNKNOWN,
    active: true
  },
  HBAIN: {
    productCode: "HBAIN",
    productType: "Others",
    description: "HB Adult Included in Rate",
    posInventory: "Other food and beverage",
    forecastGroup: "Other food and beverage",
    calculationRule: "Per Adult",
    classification: PRODUCT_CLASSIFICATION.HALF_BOARD,
    calculationBasis: CALCULATION_BASIS.PER_ADULT,
    entitlementSource: ENTITLEMENT_SOURCE.UNKNOWN,
    active: true
  },
  HBCAD: {
    productCode: "HBCAD",
    productType: "Others",
    description: "HB Child Add On Package",
    posInventory: "Other food and beverage",
    forecastGroup: "Other food and beverage",
    calculationRule: "Per Child",
    classification: PRODUCT_CLASSIFICATION.HALF_BOARD,
    calculationBasis: CALCULATION_BASIS.PER_CHILD,
    entitlementSource: ENTITLEMENT_SOURCE.UNKNOWN,
    active: true
  },
  HBCIN: {
    productCode: "HBCIN",
    productType: "Others",
    description: "HB Child Included in Rate",
    posInventory: "Other food and beverage",
    forecastGroup: "Other food and beverage",
    calculationRule: "Per Child",
    classification: PRODUCT_CLASSIFICATION.HALF_BOARD,
    calculationBasis: CALCULATION_BASIS.PER_CHILD,
    entitlementSource: ENTITLEMENT_SOURCE.UNKNOWN,
    active: true
  },
  HBCOMP: {
    productCode: "HBCOMP",
    productType: "Others",
    description: "HB Complementary",
    posInventory: "Other food and beverage",
    forecastGroup: "Other food and beverage",
    calculationRule: "Per Adult",
    classification: PRODUCT_CLASSIFICATION.HALF_BOARD,
    calculationBasis: CALCULATION_BASIS.PER_ADULT,
    entitlementSource: ENTITLEMENT_SOURCE.UNKNOWN,
    active: true
  },
  SHBAAD: {
    productCode: "SHBAAD",
    productType: "Others",
    description: "Special HB Adult Add On Package",
    posInventory: "Other food and beverage",
    forecastGroup: "Other food and beverage",
    calculationRule: "Per Adult",
    classification: PRODUCT_CLASSIFICATION.HALF_BOARD,
    calculationBasis: CALCULATION_BASIS.PER_ADULT,
    entitlementSource: ENTITLEMENT_SOURCE.UNKNOWN,
    active: true
  },
  SHBCAD: {
    productCode: "SHBCAD",
    productType: "Others",
    description: "Special HB Child Add On Package",
    posInventory: "Other food and beverage",
    forecastGroup: "Other food and beverage",
    calculationRule: "Per Child",
    classification: PRODUCT_CLASSIFICATION.HALF_BOARD,
    calculationBasis: CALCULATION_BASIS.PER_CHILD,
    entitlementSource: ENTITLEMENT_SOURCE.UNKNOWN,
    active: true
  },
  WEB_HBSA: {
    productCode: "WEB_HBSA",
    productType: "Others",
    description: "Half Board - Adult",
    posInventory: "Other food and beverage",
    forecastGroup: "Other food and beverage",
    calculationRule: "Per Adult",
    classification: PRODUCT_CLASSIFICATION.HALF_BOARD,
    calculationBasis: CALCULATION_BASIS.PER_ADULT,
    entitlementSource: ENTITLEMENT_SOURCE.UNKNOWN,
    active: true
  },
  WEB_HBSC: {
    productCode: "WEB_HBSC",
    productType: "Others",
    description: "Half Board - Child",
    posInventory: "Other food and beverage",
    forecastGroup: "Other food and beverage",
    calculationRule: "Per Child",
    classification: PRODUCT_CLASSIFICATION.HALF_BOARD,
    calculationBasis: CALCULATION_BASIS.PER_CHILD,
    entitlementSource: ENTITLEMENT_SOURCE.UNKNOWN,
    active: true
  },

  // Club Upsell & Late Check-out Packages (UPS)
  UPS300C: {
    productCode: "UPS300C",
    productType: "Others",
    description: "AED 300 Club Upsell package",
    posInventory: "N",
    forecastGroup: "Flat Rate",
    calculationRule: "1200",
    classification: PRODUCT_CLASSIFICATION.UPSELL,
    calculationBasis: CALCULATION_BASIS.FLAT_RATE,
    entitlementSource: ENTITLEMENT_SOURCE.UNKNOWN,
    active: true
  },
  UPS400C: {
    productCode: "UPS400C",
    productType: "Others",
    description: "AED 400 Club Upsell package",
    posInventory: "N",
    forecastGroup: "Flat Rate",
    calculationRule: "1200",
    classification: PRODUCT_CLASSIFICATION.UPSELL,
    calculationBasis: CALCULATION_BASIS.FLAT_RATE,
    entitlementSource: ENTITLEMENT_SOURCE.UNKNOWN,
    active: true
  },
  UPS500C: {
    productCode: "UPS500C",
    productType: "Others",
    description: "AED 500 Club Upsell package",
    posInventory: "N",
    forecastGroup: "Flat Rate",
    calculationRule: "1200",
    classification: PRODUCT_CLASSIFICATION.UPSELL,
    calculationBasis: CALCULATION_BASIS.FLAT_RATE,
    entitlementSource: ENTITLEMENT_SOURCE.UNKNOWN,
    active: true
  },
  UPSLCO4: {
    productCode: "UPSLCO4",
    productType: "Others",
    description: "Late C/O 4pm",
    posInventory: "N",
    forecastGroup: "Flat Rate",
    calculationRule: "1214",
    classification: PRODUCT_CLASSIFICATION.UPSELL,
    calculationBasis: CALCULATION_BASIS.FLAT_RATE,
    entitlementSource: ENTITLEMENT_SOURCE.UNKNOWN,
    active: true
  },
  UPSLOC6: {
    productCode: "UPSLOC6",
    productType: "Others",
    description: "Late C/O 6pm",
    posInventory: "N",
    forecastGroup: "Flat Rate",
    calculationRule: "1214",
    classification: PRODUCT_CLASSIFICATION.UPSELL,
    calculationBasis: CALCULATION_BASIS.FLAT_RATE,
    entitlementSource: ENTITLEMENT_SOURCE.UNKNOWN,
    active: true
  },

  // Laundry, Transport & Technical Items
  LAU3IN: {
    productCode: "LAU3IN",
    productType: "Others",
    description: "3 pieces of laundry per day Included in rate",
    posInventory: "N",
    forecastGroup: "Flat Rate",
    calculationRule: "4600",
    classification: PRODUCT_CLASSIFICATION.TECHNICAL,
    calculationBasis: CALCULATION_BASIS.FLAT_RATE,
    entitlementSource: ENTITLEMENT_SOURCE.UNKNOWN,
    active: true
  },
  WEB_ITSTRAN: {
    productCode: "WEB_ITSTRAN",
    productType: "Others",
    description: "Airport Pick-Up (accommodate 2 persons with 3 medium size luggage's)",
    posInventory: "Technical Items",
    forecastGroup: "Technical Items",
    calculationRule: "4300",
    classification: PRODUCT_CLASSIFICATION.TECHNICAL,
    calculationBasis: CALCULATION_BASIS.FLAT_RATE,
    entitlementSource: ENTITLEMENT_SOURCE.UNKNOWN,
    active: true
  },

  // Tourism Dirham Packages (TD1BDRM - TD5BDRM)
  TD1BDRM: { productCode: "TD1BDRM", description: "Tourism Dirham 1 Bedroom", classification: PRODUCT_CLASSIFICATION.OTHER, active: true },
  TD2BDRM: { productCode: "TD2BDRM", description: "Tourism Dirham 2 Bedroom", classification: PRODUCT_CLASSIFICATION.OTHER, active: true },
  TD3BDRM: { productCode: "TD3BDRM", description: "Tourism Dirham 3 Bedroom", classification: PRODUCT_CLASSIFICATION.OTHER, active: true },
  TD4BDRM: { productCode: "TD4BDRM", description: "Tourism Dirham 4 Bedroom", classification: PRODUCT_CLASSIFICATION.OTHER, active: true },
  TD5BDRM: { productCode: "TD5BDRM", description: "Tourism Dirham 5 Bedroom", classification: PRODUCT_CLASSIFICATION.OTHER, active: true },

  // Generic Meal Plan / Rate Codes
  BB: {
    productCode: "BB",
    productType: "MealPlan",
    description: "Bed & Breakfast Package",
    posInventory: "Breakfast",
    forecastGroup: "Breakfast",
    calculationRule: "Per Person",
    classification: PRODUCT_CLASSIFICATION.BREAKFAST,
    calculationBasis: CALCULATION_BASIS.PER_PERSON,
    entitlementSource: ENTITLEMENT_SOURCE.INCLUDED_IN_RATE,
    active: true
  },
  CLB: {
    productCode: "CLB",
    productType: "MealPlan",
    description: "Club Lounge Access (Breakfast Included)",
    posInventory: "Breakfast",
    forecastGroup: "Breakfast",
    calculationRule: "Per Person",
    classification: PRODUCT_CLASSIFICATION.BREAKFAST,
    calculationBasis: CALCULATION_BASIS.PER_PERSON,
    entitlementSource: ENTITLEMENT_SOURCE.INCLUDED_IN_RATE,
    active: true
  },
  RO: {
    productCode: "RO",
    productType: "MealPlan",
    description: "Room Only",
    posInventory: "N",
    forecastGroup: "N",
    calculationRule: "Room Only",
    classification: PRODUCT_CLASSIFICATION.OTHER,
    calculationBasis: CALCULATION_BASIS.PER_ROOM,
    entitlementSource: ENTITLEMENT_SOURCE.UNKNOWN,
    active: true
  },
  EP: {
    productCode: "EP",
    productType: "MealPlan",
    description: "European Plan (Room Only)",
    posInventory: "N",
    forecastGroup: "N",
    calculationRule: "Room Only",
    classification: PRODUCT_CLASSIFICATION.OTHER,
    calculationBasis: CALCULATION_BASIS.PER_ROOM,
    entitlementSource: ENTITLEMENT_SOURCE.UNKNOWN,
    active: true
  }
};

// Seed all USS upsell packages dynamically (USS100 - USS15000)
const USS_AMOUNTS = [
  100, 300, 400, 500, 700, 800, 1000, 1500, 2000, 2500, 2700,
  3000, 3200, 3400, 3500, 3900, 4000, 4200, 4500, 4900, 5000,
  5200, 5500, 5900, 6000, 6500, 9000, 9200, 9500, 9900,
  10000, 11000, 11500, 14200, 14500, 14900, 15000
];

USS_AMOUNTS.forEach((amount) => {
  const code = `USS${amount}`;
  DEFAULT_ORACLE_PACKAGES[code] = {
    productCode: code,
    productType: "Others",
    description: `AED ${amount} Upsell package`,
    posInventory: "N",
    forecastGroup: "Flat Rate",
    calculationRule: "1230",
    classification: PRODUCT_CLASSIFICATION.UPSELL,
    calculationBasis: CALCULATION_BASIS.FLAT_RATE,
    entitlementSource: ENTITLEMENT_SOURCE.UNKNOWN,
    active: true
  };
});

class ProductMasterRegistry {
  constructor() {
    this.registry = new Map();
    this.unknownProducts = new Map();
    this.initDefaults();
  }

  initDefaults() {
    Object.entries(DEFAULT_ORACLE_PACKAGES).forEach(([code, def]) => {
      this.registry.set(normalizeCode(code), { ...def });
    });
  }

  /**
   * Registers or updates a product definition in the Product Master.
   * @param {object} productDef
   */
  registerProduct(productDef) {
    if (!productDef || !productDef.productCode) return;
    const code = normalizeCode(productDef.productCode);
    const existing = this.registry.get(code) || {};
    this.registry.set(code, {
      ...existing,
      ...productDef,
      productCode: code,
      active: productDef.active !== false
    });
    if (this.unknownProducts.has(code)) {
      this.unknownProducts.delete(code);
    }
  }

  /**
   * Resolves a product code against the Product Master.
   * If unknown, registers it safely as UNKNOWN without silently guessing.
   * @param {string} code
   * @param {object} [context]
   * @returns {{ resolved: boolean, productCode: string, classification: string, description: string, calculationBasis: string, entitlementSource: string, isBreakfast: boolean, flatCovers?: number, rawContext?: object }}
   */
  resolveProduct(code, context = {}) {
    const normCode = normalizeCode(code);
    if (!normCode) {
      return {
        resolved: false,
        productCode: "",
        classification: PRODUCT_CLASSIFICATION.UNKNOWN,
        description: "",
        calculationBasis: CALCULATION_BASIS.UNKNOWN,
        entitlementSource: ENTITLEMENT_SOURCE.UNKNOWN,
        isBreakfast: false
      };
    }

    if (this.registry.has(normCode)) {
      const def = this.registry.get(normCode);
      return {
        resolved: true,
        productCode: def.productCode,
        productType: def.productType || "Others",
        classification: def.classification || PRODUCT_CLASSIFICATION.OTHER,
        description: def.description || context.description || "",
        posInventory: def.posInventory || "",
        forecastGroup: def.forecastGroup || "",
        calculationRule: def.calculationRule || context.calculationRule || "",
        calculationBasis: def.calculationBasis || CALCULATION_BASIS.UNKNOWN,
        entitlementSource: def.entitlementSource || ENTITLEMENT_SOURCE.UNKNOWN,
        guestType: def.guestType,
        flatCovers: def.flatCovers,
        isBreakfast: def.classification === PRODUCT_CLASSIFICATION.BREAKFAST,
        active: def.active !== false
      };
    }

    // Product is NOT in Master Registry: Use Oracle Metadata & Semantic Analysis
    const rawDesc = normalizeText(context.description);
    const rawCalcRule = normalizeText(context.calculationRule);
    const combinedText = `${normCode} ${rawDesc} ${rawCalcRule}`.toLowerCase();

    const isExplicitNoMeal = /\b(room\s*only|no\s*breakfast|ro|ep|roomonly)\b/i.test(combinedText);
    const isSemanticBreakfast = !isExplicitNoMeal && (
      /\b(breakfast|petit[- ]?d[eé]jeuner|fr[uü]hst[uü]ck|desayuno|colazione|buffet|morning|bed\s*(?:&|and)\s*breakfast|b[&/]b|lounge|bkf|bb)\b/i.test(combinedText) ||
      normCode.startsWith("BF") || normCode.endsWith("BF") || normCode.includes("BB") || normCode.includes("BKF")
    );
    const isFullBoard = !isSemanticBreakfast && /\b(full\s*board|fb\b|fbaad|fbain)/i.test(combinedText);
    const isHalfBoard = !isSemanticBreakfast && !isFullBoard && /\b(half\s*board|hb\b|hbaad|hbain)/i.test(combinedText);
    const isUpsell = !isSemanticBreakfast && !isFullBoard && !isHalfBoard && (/\b(upsell|late\s*c\/o)\b/i.test(combinedText) || normCode.startsWith("USS") || normCode.startsWith("UPS"));

    if (isExplicitNoMeal) {
      return {
        resolved: true,
        productCode: normCode,
        productType: "Others",
        classification: PRODUCT_CLASSIFICATION.OTHER,
        description: rawDesc || "Room Only",
        posInventory: "N",
        forecastGroup: "N",
        calculationRule: rawCalcRule,
        calculationBasis: CALCULATION_BASIS.PER_ROOM,
        entitlementSource: ENTITLEMENT_SOURCE.UNKNOWN,
        isBreakfast: false,
        active: true
      };
    }

    if (isSemanticBreakfast) {
      const isChild = /\b(child|kinder|enfant|niño)\b/i.test(combinedText) || normCode.includes("CHILD") || normCode.includes("CHD");
      const isAdult = /\b(adult|erwachsene|adulte|adulto)\b/i.test(combinedText) || normCode.includes("ADULT") || normCode.includes("ADT");
      const calcBasis = isChild ? CALCULATION_BASIS.PER_CHILD : (isAdult ? CALCULATION_BASIS.PER_ADULT : CALCULATION_BASIS.PER_PERSON);
      const guestType = isChild ? "CHILD" : (isAdult ? "ADULT" : undefined);

      return {
        resolved: true,
        productCode: normCode,
        productType: "Others",
        classification: PRODUCT_CLASSIFICATION.BREAKFAST,
        description: rawDesc || "Breakfast Package",
        posInventory: "Breakfast",
        forecastGroup: "Breakfast",
        calculationRule: rawCalcRule,
        calculationBasis: calcBasis,
        entitlementSource: ENTITLEMENT_SOURCE.BREAKFAST_PRODUCT,
        guestType,
        isBreakfast: true,
        active: true
      };
    }

    if (isFullBoard) {
      return {
        resolved: true,
        productCode: normCode,
        productType: "Others",
        classification: PRODUCT_CLASSIFICATION.FULL_BOARD,
        description: rawDesc || "Full Board Package",
        posInventory: "Other food and beverage",
        forecastGroup: "Other food and beverage",
        calculationRule: rawCalcRule,
        calculationBasis: CALCULATION_BASIS.PER_PERSON,
        entitlementSource: ENTITLEMENT_SOURCE.UNKNOWN,
        isBreakfast: false,
        active: true
      };
    }

    if (isHalfBoard) {
      return {
        resolved: true,
        productCode: normCode,
        productType: "Others",
        classification: PRODUCT_CLASSIFICATION.HALF_BOARD,
        description: rawDesc || "Half Board Package",
        posInventory: "Other food and beverage",
        forecastGroup: "Other food and beverage",
        calculationRule: rawCalcRule,
        calculationBasis: CALCULATION_BASIS.PER_PERSON,
        entitlementSource: ENTITLEMENT_SOURCE.UNKNOWN,
        isBreakfast: false,
        active: true
      };
    }

    if (isUpsell) {
      return {
        resolved: true,
        productCode: normCode,
        productType: "Others",
        classification: PRODUCT_CLASSIFICATION.UPSELL,
        description: rawDesc || "Upsell Package",
        posInventory: "N",
        forecastGroup: "Flat Rate",
        calculationRule: rawCalcRule,
        calculationBasis: CALCULATION_BASIS.FLAT_RATE,
        entitlementSource: ENTITLEMENT_SOURCE.UNKNOWN,
        isBreakfast: false,
        active: true
      };
    }

    // Truly unknown product with no interpretable metadata: Record as unknown product
    const unknownEntry = {
      productCode: normCode,
      description: rawDesc || "Unknown Oracle Package",
      calculationRule: rawCalcRule,
      firstSeen: new Date().toISOString(),
      occurrences: (this.unknownProducts.get(normCode)?.occurrences || 0) + 1
    };
    this.unknownProducts.set(normCode, unknownEntry);

    return {
      resolved: false,
      productCode: normCode,
      productType: "Unknown",
      classification: PRODUCT_CLASSIFICATION.UNKNOWN,
      description: unknownEntry.description,
      posInventory: "",
      forecastGroup: "",
      calculationRule: unknownEntry.calculationRule,
      calculationBasis: CALCULATION_BASIS.UNKNOWN,
      entitlementSource: ENTITLEMENT_SOURCE.UNKNOWN,
      isBreakfast: false,
      active: true,
      unknownWarning: `Unknown Oracle product code '${normCode}' encountered. No automatic breakfast entitlement assigned.`
    };
  }

  /**
   * Returns all registered products in the Product Master.
   * @returns {Array<object>}
   */
  getAllProducts() {
    return Array.from(this.registry.values());
  }

  /**
   * Returns all detected unknown products.
   * @returns {Array<object>}
   */
  getUnknownProducts() {
    return Array.from(this.unknownProducts.values());
  }
}

// Singleton global Product Master instance
export const productMaster = new ProductMasterRegistry();
