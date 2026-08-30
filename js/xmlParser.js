import {
  normalizeCode,
  normalizeRoom,
  normalizeText,
  parseInteger
} from "./utils.js";

const ROWSET_NS = "urn:schemas-microsoft-com:xml-analysis:rowset";
const XSD_NS = "http://www.w3.org/2001/XMLSchema";
const SAW_SQL_NS = "urn:saw-sql";

const MEAL_HEADING_MATCHERS = {
  roomNumber: ["room"],
  firstName: ["first name", "guest first name"],
  lastName: ["last name", "guest last name"],
  arrival: ["arrival"],
  departure: ["departure"],
  adults: ["adults", "adult"],
  children: ["child", "children"],
  confirmationNumber: ["confirmation number", "confirmation"],
  mealPlan: ["meal plan"]
};

// Lightweight, zero-dependency XML DOM implementation for Node.js / non-browser environments
class FallbackElement {
  constructor(tagName, localName) {
    this.nodeType = 1;
    this.tagName = tagName;
    this.localName = localName;
    this.attributes = new Map();
    this.children = [];
    this.childNodes = [];
    this.parentNode = null;
  }

  get textContent() {
    return this.childNodes
      .map((c) => (typeof c === "string" ? c : c?.textContent || ""))
      .join("");
  }

  getAttribute(name) {
    return this.attributes.get(name) || null;
  }

  getAttributeNS(ns, localName) {
    for (const [key, value] of this.attributes.entries()) {
      if (key === localName || key.endsWith(`:${localName}`)) {
        return value;
      }
    }
    return null;
  }

  getElementsByTagName(name) {
    const results = [];
    const searchName = name.toLowerCase();
    const walk = (el) => {
      for (const child of el.children) {
        if (name === "*" || child.tagName.toLowerCase() === searchName || child.localName.toLowerCase() === searchName) {
          results.push(child);
        }
        walk(child);
      }
    };
    walk(this);
    return results;
  }

  getElementsByTagNameNS(ns, localName) {
    const results = [];
    const searchLocal = localName.toLowerCase();
    const walk = (el) => {
      for (const child of el.children) {
        if (localName === "*" || child.localName.toLowerCase() === searchLocal) {
          results.push(child);
        }
        walk(child);
      }
    };
    walk(this);
    return results;
  }

  querySelector(selector) {
    return null;
  }
}

class FallbackDocument {
  constructor(root) {
    this.documentElement = root;
  }

  getElementsByTagName(name) {
    if (!this.documentElement) return [];
    const lower = name.toLowerCase();
    const sub = this.documentElement.getElementsByTagName(name);
    if (name === "*" || this.documentElement.tagName.toLowerCase() === lower || this.documentElement.localName.toLowerCase() === lower) {
      return [this.documentElement, ...sub];
    }
    return sub;
  }

  getElementsByTagNameNS(ns, localName) {
    if (!this.documentElement) return [];
    const lower = localName.toLowerCase();
    const sub = this.documentElement.getElementsByTagNameNS(ns, localName);
    if (localName === "*" || this.documentElement.localName.toLowerCase() === lower) {
      return [this.documentElement, ...sub];
    }
    return sub;
  }

  querySelector(selector) {
    return null;
  }
}

function parseXmlFallback(xmlText) {
  const tagRegex = /<(!\[CDATA\[[\s\S]*?\]\]>|!--[\s\S]*?--|\?[\s\S]*?\?|\/?[a-zA-Z0-9_:\.-]+(?:\s+[^>]*)?\/?)>|([^<]+)/g;
  let root = null;
  let current = null;
  const stack = [];
  let match;

  while ((match = tagRegex.exec(xmlText)) !== null) {
    if (match[2]) {
      const text = match[2];
      if (current && text) {
        current.childNodes.push(text);
      }
      continue;
    }

    const tagContent = match[1];
    if (!tagContent || tagContent.startsWith("?xml") || tagContent.startsWith("!--")) {
      continue;
    }

    if (tagContent.startsWith("![CDATA[")) {
      const cdata = tagContent.slice(8, -2);
      if (current) {
        current.childNodes.push(cdata);
      }
      continue;
    }

    if (tagContent.startsWith("/")) {
      stack.pop();
      current = stack.length > 0 ? stack[stack.length - 1] : null;
      continue;
    }

    const isSelfClosing = tagContent.endsWith("/");
    const cleanTag = isSelfClosing ? tagContent.slice(0, -1).trim() : tagContent.trim();
    const spaceIdx = cleanTag.search(/\s/);
    const rawTagName = spaceIdx === -1 ? cleanTag : cleanTag.slice(0, spaceIdx);
    const attrString = spaceIdx === -1 ? "" : cleanTag.slice(spaceIdx);

    const colonIdx = rawTagName.indexOf(":");
    const localName = colonIdx === -1 ? rawTagName : rawTagName.slice(colonIdx + 1);

    const element = new FallbackElement(rawTagName, localName);

    if (attrString) {
      const attrRegex = /([a-zA-Z0-9_:\.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
      let attrMatch;
      while ((attrMatch = attrRegex.exec(attrString)) !== null) {
        element.attributes.set(attrMatch[1], attrMatch[2] !== undefined ? attrMatch[2] : attrMatch[3]);
      }
    }

    if (!root) {
      root = element;
    }
    if (current) {
      current.children.push(element);
      current.childNodes.push(element);
      element.parentNode = current;
    }

    if (!isSelfClosing) {
      stack.push(element);
      current = element;
    }
  }

  return new FallbackDocument(root);
}

function parseXml(xmlText) {
  if (typeof DOMParser !== "undefined") {
    const parser = new DOMParser();
    const xmlDocument = parser.parseFromString(xmlText, "application/xml");
    const parseError = xmlDocument.querySelector("parsererror");

    if (parseError) {
      throw new Error("Unable to read file. Please export a fresh report from OPERA.");
    }

    return xmlDocument;
  }

  // Node.js fallback
  return parseXmlFallback(xmlText);
}

function getRootName(xmlDocument) {
  return xmlDocument.documentElement?.localName || xmlDocument.documentElement?.nodeName || "";
}

function requireFileType(xmlDocument, expectedRoot) {
  if (getRootName(xmlDocument).toUpperCase() !== expectedRoot.toUpperCase()) {
    throw new Error(`This doesn't look like a ${expectedRoot === "RS" ? "Meal Plan" : "Package Forecast"} report.`);
  }
}

function getRowsetElements(xmlDocument, localName) {
  return Array.from(xmlDocument.getElementsByTagNameNS(ROWSET_NS, localName));
}

function getSchemaElements(xmlDocument) {
  return Array.from(xmlDocument.getElementsByTagNameNS(XSD_NS, "element"));
}

function normalizeHeading(heading) {
  return normalizeText(heading).toLowerCase();
}

function mapMealColumns(xmlDocument) {
  const schemaElements = getSchemaElements(xmlDocument);
  const rawMappings = schemaElements
    .map((element) => ({
      key: element.getAttribute("name"),
      heading: element.getAttributeNS(SAW_SQL_NS, "columnHeading") || element.getAttribute("saw-sql:columnHeading") || ""
    }))
    .filter((entry) => entry.key && entry.heading);

  const byField = {};

  Object.entries(MEAL_HEADING_MATCHERS).forEach(([fieldName, candidates]) => {
    const match = rawMappings.find(({ heading }) => {
      const normalized = normalizeHeading(heading);
      return candidates.some((candidate) => normalized.includes(candidate));
    });

    if (match) {
      byField[fieldName] = match.key;
    }
  });

  ["roomNumber", "confirmationNumber", "mealPlan"].forEach((requiredField) => {
    if (!byField[requiredField]) {
      throw new Error(`Required column not found: ${requiredField}. Contact IT if report format changed.`);
    }
  });

  return byField;
}

function getChildText(parent, tagName) {
  if (!parent || !parent.children) return "";
  const node = Array.from(parent.children).find((child) => child.tagName === tagName || child.localName === tagName);
  return normalizeText(node?.textContent);
}

function splitProducts(value) {
  return normalizeText(value)
    .split(",")
    .map((part) => normalizeCode(part))
    .filter(Boolean);
}

function findAncestorByTagName(node, tagName) {
  let current = node?.parentNode;
  while (current) {
    if (current.nodeType === 1 && (current.tagName === tagName || current.localName === tagName)) {
      return current;
    }
    current = current.parentNode;
  }
  return null;
}

export function parseMealPlanXml(xmlText) {
  const xmlDocument = parseXml(xmlText);
  requireFileType(xmlDocument, "RS");

  const columnMap = mapMealColumns(xmlDocument);
  const rowElements = getRowsetElements(xmlDocument, "R");

  if (!rowElements.length) {
    throw new Error("Unable to read file. Please export a fresh report from OPERA.");
  }

  return rowElements.map((rowElement) => {
    const valueFor = (fieldName) => {
      const columnName = columnMap[fieldName];
      if (!columnName) {
        return "";
      }

      const valueNode = Array.from(rowElement.children).find((child) => child.localName === columnName || child.tagName === columnName);
      return normalizeText(valueNode?.textContent);
    };

    return {
      roomNumber: normalizeRoom(valueFor("roomNumber")),
      firstName: valueFor("firstName"),
      lastName: valueFor("lastName"),
      arrival: valueFor("arrival"),
      departure: valueFor("departure"),
      adults: parseInteger(valueFor("adults")),
      children: parseInteger(valueFor("children")),
      confirmationNumber: normalizeText(valueFor("confirmationNumber")),
      mealPlan: normalizeCode(valueFor("mealPlan")),
      source: "mealPlan"
    };
  });
}

/**
 * Extracts summary totals and report metadata from Oracle PKGFORECAST XML (multi-date aware)
 * @param {Document|FallbackDocument} xmlDocument
 * @returns {{ stayDate: string, stayDateChar: string, stayDay: string, reportId: string, stayDates: string[], summaryByDate: Record<string, object>, summaryTotals: Record<string, number>, totalSummaryPackages: number }}
 */
export function extractPackageForecastSummary(xmlDocument) {
  let primaryStayDate = "";
  let primaryStayDateChar = "";
  let primaryStayDay = "";
  let primaryReportId = "";
  const summaryTotals = {};
  const summaryByDate = {};
  const stayDates = [];
  let totalSummaryPackages = 0;

  const stayDateNodes = Array.from(xmlDocument.getElementsByTagName("G_STAY_DATE"));
  for (const stayNode of stayDateNodes) {
    const stayDate = getChildText(stayNode, "STAY_DATE") || "UNKNOWN_DATE";
    const stayDateChar = getChildText(stayNode, "STAY_DATE_CHAR");
    const stayDay = getChildText(stayNode, "STAY_DAY");

    if (!primaryStayDate && stayDate !== "UNKNOWN_DATE") {
      primaryStayDate = stayDate;
      primaryStayDateChar = stayDateChar;
      primaryStayDay = stayDay;
    }

    if (!stayDates.includes(stayDate) && stayDate !== "UNKNOWN_DATE") {
      stayDates.push(stayDate);
    }

    const dateSummaryTotals = {};
    let dateTotalPackages = 0;
    let dateReportId = "";

    const productNodes = Array.from(stayNode.getElementsByTagName("G_PRODUCT_ID"));
    for (const prodNode of productNodes) {
      const prodCode = normalizeCode(getChildText(prodNode, "PRODUCT_ID"));
      if (!prodCode) continue;

      let productTotal = 0;
      const reportNodes = Array.from(prodNode.getElementsByTagName("G_REPORT_ID"));
      for (const repNode of reportNodes) {
        const repId = getChildText(repNode, "REPORT_ID");
        if (repId) {
          dateReportId = dateReportId || repId;
          primaryReportId = primaryReportId || repId;
        }
        const totalPkgsStr = getChildText(repNode, "TOTAL_PKGS");
        const count = parseInteger(totalPkgsStr, 0);
        productTotal += count;
      }

      dateSummaryTotals[prodCode] = (dateSummaryTotals[prodCode] || 0) + productTotal;
      summaryTotals[prodCode] = (summaryTotals[prodCode] || 0) + productTotal;
      dateTotalPackages += productTotal;
      totalSummaryPackages += productTotal;
    }

    summaryByDate[stayDate] = {
      stayDate,
      stayDateChar,
      stayDay,
      reportId: dateReportId || primaryReportId,
      summaryTotals: dateSummaryTotals,
      totalSummaryPackages: dateTotalPackages
    };
  }

  return {
    stayDate: primaryStayDate,
    stayDateChar: primaryStayDateChar,
    stayDay: primaryStayDay,
    reportId: primaryReportId,
    stayDates,
    summaryByDate,
    summaryTotals,
    totalSummaryPackages
  };
}

/**
 * Parses Oracle PKGFORECAST XML with dynamic package identification,
 * multi-date preservation, hierarchical context preservation, and data-driven summary extraction.
 * @param {string} xmlText
 * @returns {Array<object>}
 */
export function parsePackageForecastXml(xmlText) {
  const xmlDocument = parseXml(xmlText);
  requireFileType(xmlDocument, "PKGFORECAST");

  // 1. Dynamic Summary Section Extraction (Multi-Date Aware)
  const summary = extractPackageForecastSummary(xmlDocument);

  // 2. Dynamic Reservation Details Extraction
  const reservationNodes = Array.from(xmlDocument.getElementsByTagName("G_RESV_DETAILS"));
  if (!reservationNodes.length) {
    throw new Error("Unable to read file. Please export a fresh report from OPERA.");
  }

  const rows = reservationNodes.map((reservationNode) => {
    const productGroup = findAncestorByTagName(reservationNode, "G_PRODUCT_GROUP");
    const productGroupCode = normalizeCode(getChildText(productGroup, "PRODUCT_ID1"));
    const productDescription = getChildText(productGroup, "PRODUCT_DESC");
    const displayName = getChildText(reservationNode, "DISPLAY_NAME");
    const fallbackLastName = getChildText(reservationNode, "GUEST_NAME");
    const rawFirstName = getChildText(reservationNode, "GUEST_FIRST_NAME");
    const firstName = rawFirstName || (displayName.includes(",") ? displayName.split(",")[1].trim() : "");
    const lastName = displayName.includes(",") ? displayName.split(",")[0].trim() : (fallbackLastName || displayName);

    const rawPkgQty = getChildText(reservationNode, "PKG_QTY") || getChildText(reservationNode, "QUANTITY") || getChildText(reservationNode, "TOTAL_PKGS1");
    const packageQuantity = parseInteger(rawPkgQty, 1);
    const quantity = parseInteger(getChildText(reservationNode, "QUANTITY"), packageQuantity);
    const persons = parseInteger(getChildText(reservationNode, "PERSONS"), 0);
    const adults = parseInteger(getChildText(reservationNode, "ADULTS"), 0);
    const children = parseInteger(getChildText(reservationNode, "CHILDREN"), 0);
    const noOfRooms = parseInteger(getChildText(reservationNode, "NO_OF_ROOMS"), 1);

    const rawProducts = splitProducts(getChildText(reservationNode, "PRODUCTS"));
    // Ensure parent product group code is captured if not in products list
    if (productGroupCode && !rawProducts.includes(productGroupCode)) {
      rawProducts.push(productGroupCode);
    }

    const stayDate = getChildText(reservationNode, "STAY_DATE1") || summary.stayDate;
    const reportId = getChildText(reservationNode, "REPORT_ID1") || summary.reportId;

    return {
      confirmationNumber: normalizeText(getChildText(reservationNode, "CONFIRMATION_NO")),
      resvNameId: normalizeText(getChildText(reservationNode, "RESV_NAME_ID")),
      guestNameId: normalizeText(getChildText(reservationNode, "GUEST_NAME_ID")),
      roomNumber: normalizeRoom(getChildText(reservationNode, "ROOM")),
      roomCategory: getChildText(reservationNode, "ROOM_CATEGORY_LABEL") || getChildText(reservationNode, "ROOM_CATEGORY"),
      roomClass: getChildText(reservationNode, "ROOM_CLASS"),
      firstName,
      lastName,
      displayName,
      products: rawProducts,
      rawProductsString: getChildText(reservationNode, "PRODUCTS"),
      productGroupCode,
      productDescription,
      packageQuantity,
      quantity,
      persons,
      noOfRooms,
      calculationRule: getChildText(reservationNode, "CALCULATION_RULE"),
      adults,
      children,
      reservationStatus: getChildText(reservationNode, "COMPUTED_RESV_STATUS") || getChildText(reservationNode, "RESV_STATUS") || getChildText(reservationNode, "RES_STATUS") || "CHECKED IN",
      resStatus: getChildText(reservationNode, "RES_STATUS"),
      arrival: getChildText(reservationNode, "TRUNC_ARRIVAL"),
      departure: getChildText(reservationNode, "TRUNC_DEPARTURE"),
      rateCode: getChildText(reservationNode, "RATE_CODE"),
      pkgForecastGroup: getChildText(reservationNode, "PKG_FORCAST_GROUP"),
      stayDate,
      reportId,
      source: "packageForecast"
    };
  });

  // Attach metadata and summary totals to the result array for zero-overhead access
  Object.assign(rows, {
    summaryTotals: summary.summaryTotals,
    summaryByDate: summary.summaryByDate,
    stayDates: summary.stayDates,
    metadata: {
      stayDate: summary.stayDate,
      stayDateChar: summary.stayDateChar,
      stayDay: summary.stayDay,
      reportId: summary.reportId,
      stayDates: summary.stayDates,
      totalSummaryPackages: summary.totalSummaryPackages
    }
  });

  return rows;
}
