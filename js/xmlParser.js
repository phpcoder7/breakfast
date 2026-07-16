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

function parseXml(xmlText) {
  const parser = new DOMParser();
  const xmlDocument = parser.parseFromString(xmlText, "application/xml");
  const parseError = xmlDocument.querySelector("parsererror");

  if (parseError) {
    throw new Error("Unable to read file. Please export a fresh report from OPERA.");
  }

  return xmlDocument;
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

export function parsePackageForecastXml(xmlText) {
  const xmlDocument = parseXml(xmlText);
  requireFileType(xmlDocument, "PKGFORECAST");

  const reservationNodes = Array.from(xmlDocument.getElementsByTagName("G_RESV_DETAILS"));
  if (!reservationNodes.length) {
    throw new Error("Unable to read file. Please export a fresh report from OPERA.");
  }

  return reservationNodes.map((reservationNode) => {
    const productGroup = findAncestorByTagName(reservationNode, "G_PRODUCT_GROUP");
    const productGroupCode = normalizeCode(getChildText(productGroup, "PRODUCT_ID1"));
    const productDescription = getChildText(productGroup, "PRODUCT_DESC");
    const displayName = getChildText(reservationNode, "DISPLAY_NAME");
    const fallbackLastName = getChildText(reservationNode, "GUEST_NAME");
    const firstName = getChildText(reservationNode, "GUEST_FIRST_NAME");
    const lastName = displayName.includes(",") ? displayName.split(",")[0].trim() : fallbackLastName;

    return {
      confirmationNumber: normalizeText(getChildText(reservationNode, "CONFIRMATION_NO")),
      roomNumber: normalizeRoom(getChildText(reservationNode, "ROOM")),
      firstName,
      lastName,
      products: splitProducts(getChildText(reservationNode, "PRODUCTS")),
      productGroupCode,
      productDescription,
      packageQuantity: parseInteger(getChildText(reservationNode, "PKG_QTY") || getChildText(reservationNode, "QUANTITY")),
      adults: parseInteger(getChildText(reservationNode, "ADULTS")),
      children: parseInteger(getChildText(reservationNode, "CHILDREN")),
      reservationStatus: getChildText(reservationNode, "COMPUTED_RESV_STATUS") || getChildText(reservationNode, "RESV_STATUS"),
      arrival: getChildText(reservationNode, "TRUNC_ARRIVAL"),
      departure: getChildText(reservationNode, "TRUNC_DEPARTURE"),
      rateCode: getChildText(reservationNode, "RATE_CODE"),
      source: "packageForecast"
    };
  });
}
