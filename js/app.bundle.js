(() => {
  // js/utils.js
  var BREAKFAST_CODES = {
    BFAAD: "Breakfast Adult Add On Package",
    BFAIN: "Breakfast Adult Included in Rate",
    BFCAD: "Breakfast Child Add On Package",
    BFCIN: "Breakfast Child Included in Rate",
    UPSBB1: "Breakfast 1 Person",
    WEB_BFSA: "Breakfast Adult",
    BB: "Breakfast Package",
    CLB: "Club Lounge (Breakfast Included)"
  };
  var NO_BREAKFAST_CODES = {
    RO: "Room Only"
  };
  var BREAKFAST_STATUS = {
    INCLUDED: "included",
    PAYMENT: "payment",
    UNKNOWN: "unknown"
  };
  var GUEST_TYPES = {
    HOTEL: "Hotel",
    WALK_IN: "Walk-In",
    APARTMENT: "Apartment"
  };
  var BREAKFAST_PRICE_AED = 150;
  var APARTMENT_PRICE_AED = 120;
  var STORAGE_KEYS = {
    SNAPSHOT: "breakfast-checkin-state"
  };
  function normalizeText(value) {
    return String(value ?? "").trim();
  }
  function normalizeCode(value) {
    return normalizeText(value).toUpperCase();
  }
  function normalizeRoom(value) {
    return normalizeText(value).replace(/\s+/g, "");
  }
  function normalizeSearchText(value) {
    return normalizeText(value).toLowerCase();
  }
  function roomSearchVariants(value) {
    const room = normalizeRoom(value);
    if (!room) {
      return [];
    }
    const trimmedZeros = room.replace(/^0+/, "");
    return Array.from(/* @__PURE__ */ new Set([room, trimmedZeros || "0"]));
  }
  function parseInteger(value, fallback = 0) {
    const parsed = Number.parseInt(String(value ?? "").trim(), 10);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  function uniqueList(values) {
    return Array.from(new Set(values.filter(Boolean)));
  }
  function todayKey() {
    const now = /* @__PURE__ */ new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }
  function formatDate(value) {
    const text = normalizeText(value);
    if (!text) {
      return "-";
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
      const [year, month, day] = text.split("-");
      return `${day}/${month}/${year}`;
    }
    const shortOracleDateMatch = text.match(/^(\d{2})-([A-Z]{3})-(\d{2})$/i);
    if (shortOracleDateMatch) {
      const [, day, month, year] = shortOracleDateMatch;
      return `${day}/${month.toUpperCase()}/20${year}`;
    }
    return text;
  }
  function formatTime(value = /* @__PURE__ */ new Date()) {
    const date = value instanceof Date ? value : new Date(value);
    return date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
  }
  function toTimestamp(value = /* @__PURE__ */ new Date()) {
    const date = value instanceof Date ? value : new Date(value);
    return date.toISOString();
  }
  function safeJsonParse(value, fallback) {
    try {
      return JSON.parse(value);
    } catch (error) {
      return fallback;
    }
  }
  function readStoredState() {
    const snapshot = localStorage.getItem(STORAGE_KEYS.SNAPSHOT);
    if (!snapshot) {
      return null;
    }
    const parsed = safeJsonParse(snapshot, null);
    if (!parsed || parsed.serviceDate !== todayKey()) {
      return null;
    }
    return parsed;
  }
  function writeStoredState(state) {
    localStorage.setItem(STORAGE_KEYS.SNAPSHOT, JSON.stringify(state));
  }
  function createId(prefix = "id") {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
  function escapeHtml(value) {
    return normalizeText(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function joinName(firstName, lastName) {
    return normalizeText([firstName, lastName].filter(Boolean).join(" "));
  }
  function listToText(values) {
    return uniqueList(values).join(", ") || "-";
  }
  function statusMeta(status) {
    switch (status) {
      case BREAKFAST_STATUS.INCLUDED:
        return {
          label: "Breakfast Included",
          className: "status-included"
        };
      case BREAKFAST_STATUS.PAYMENT:
        return {
          label: "Payment Required",
          className: "status-payment"
        };
      default:
        return {
          label: "Unknown Package",
          className: "status-unknown"
        };
    }
  }
  function reasonLabel(guestType, breakfastStatus) {
    if (guestType === GUEST_TYPES.WALK_IN) {
      return "Walk-In";
    }
    if (guestType === GUEST_TYPES.APARTMENT) {
      return "Apartment (120 AED \u2014 20% discount)";
    }
    if (breakfastStatus === BREAKFAST_STATUS.PAYMENT) {
      return "Payment Required";
    }
    return "Unknown Package";
  }

  // js/checkin.js
  function buildBaseRecord({
    roomNumber,
    guestName,
    adults,
    children,
    tableNumber,
    mealPlan,
    products,
    breakfastStatus,
    guestType,
    actualGuests,
    confirmationNumber = "",
    discount = "",
    entitlementExceeded = false,
    extraGuests = 0,
    breakfastQuantity = 0,
    statusOverride = false
  }) {
    const timestamp = toTimestamp();
    return {
      id: createId("checkin"),
      timestamp,
      timeLabel: formatTime(timestamp),
      roomNumber,
      guestName,
      adults,
      children,
      tableNumber,
      mealPlan,
      products,
      breakfastStatus,
      actualGuests,
      guestType,
      confirmationNumber,
      discount,
      entitlementExceeded,
      extraGuests,
      breakfastQuantity,
      statusOverride: Boolean(statusOverride),
      paid: false,
      paidAt: ""
    };
  }
  function findHotelCheckInByRoom(checkIns, roomNumber) {
    const room = normalizeRoom(roomNumber);
    if (!room) {
      return null;
    }
    return checkIns.find(
      (record) => record.guestType === GUEST_TYPES.HOTEL && normalizeRoom(record.roomNumber) === room
    ) || null;
  }
  function checkEntitlement(guest, actualGuests) {
    if (guest.breakfastStatus !== BREAKFAST_STATUS.INCLUDED) {
      return false;
    }
    return parseInteger(actualGuests, 0) > parseInteger(guest.breakfastQuantity, 0);
  }
  function getExtraGuests(guest, actualGuests) {
    if (guest.breakfastStatus !== BREAKFAST_STATUS.INCLUDED) {
      return 0;
    }
    const actual = parseInteger(actualGuests, 0);
    const entitled = parseInteger(guest.breakfastQuantity, 0);
    return Math.max(0, actual - entitled);
  }
  function applyLateArrivals(record, { additionalGuests, tableNumber }) {
    const added = Math.max(1, parseInteger(additionalGuests, 1));
    const previousActual = parseInteger(record.actualGuests, 0);
    const nextActual = previousActual + added;
    const breakfastQuantity = parseInteger(record.breakfastQuantity, 0);
    const previousExtras = parseInteger(record.extraGuests, 0);
    let extraGuests = 0;
    let entitlementExceeded = false;
    if (record.breakfastStatus === BREAKFAST_STATUS.INCLUDED) {
      extraGuests = Math.max(0, nextActual - breakfastQuantity);
      entitlementExceeded = extraGuests > 0;
    }
    const nextTable = normalizeText(tableNumber) || record.tableNumber;
    const extrasIncreased = extraGuests > previousExtras;
    const resetPaid = extrasIncreased && Boolean(record.paid);
    return {
      ...record,
      actualGuests: nextActual,
      tableNumber: nextTable,
      extraGuests,
      entitlementExceeded,
      paid: resetPaid ? false : Boolean(record.paid),
      paidAt: resetPaid ? "" : record.paidAt || "",
      lateArrivalAdded: added
    };
  }
  function createHotelCheckIn(guest, formValues) {
    const actualGuests = parseInteger(
      formValues.actualGuests,
      parseInteger(guest.adults, 0) + parseInteger(guest.children, 0)
    );
    const breakfastQuantity = parseInteger(guest.breakfastQuantity, 0);
    const extraGuests = getExtraGuests(guest, actualGuests);
    const entitlementExceeded = extraGuests > 0;
    const products = Array.isArray(guest.products) ? guest.products.join(", ") : String(guest.products || "-");
    return buildBaseRecord({
      roomNumber: guest.roomNumber,
      guestName: guest.fullName,
      adults: guest.adults,
      children: guest.children,
      tableNumber: normalizeText(formValues.tableNumber),
      mealPlan: guest.mealPlan,
      products,
      breakfastStatus: guest.breakfastStatus,
      guestType: GUEST_TYPES.HOTEL,
      actualGuests,
      confirmationNumber: guest.confirmationNumber,
      entitlementExceeded,
      extraGuests,
      breakfastQuantity,
      statusOverride: Boolean(guest.statusOverride)
    });
  }
  function createWalkInCheckIn(formValues) {
    return buildBaseRecord({
      roomNumber: "Walk-In",
      guestName: normalizeText(formValues.guestName) || "Walk-In Guest",
      adults: parseInteger(formValues.adults, 1),
      children: parseInteger(formValues.children, 0),
      tableNumber: normalizeText(formValues.tableNumber),
      mealPlan: "-",
      products: "-",
      breakfastStatus: BREAKFAST_STATUS.PAYMENT,
      guestType: GUEST_TYPES.WALK_IN,
      actualGuests: parseInteger(formValues.adults, 1) + parseInteger(formValues.children, 0)
    });
  }
  function createApartmentCheckIn(formValues) {
    return buildBaseRecord({
      roomNumber: `APT ${normalizeText(formValues.apartmentNumber)}`,
      guestName: normalizeText(formValues.guestName) || "Apartment Guest",
      adults: parseInteger(formValues.adults, 1),
      children: parseInteger(formValues.children, 0),
      tableNumber: normalizeText(formValues.tableNumber),
      mealPlan: "-",
      products: "-",
      breakfastStatus: BREAKFAST_STATUS.PAYMENT,
      guestType: GUEST_TYPES.APARTMENT,
      actualGuests: parseInteger(formValues.adults, 1) + parseInteger(formValues.children, 0),
      discount: "20%"
    });
  }
  function createManualGuest(formValues) {
    const adults = parseInteger(formValues.adults, 1);
    const children = parseInteger(formValues.children, 0);
    const breakfastStatus = normalizeText(formValues.breakfastStatus) || BREAKFAST_STATUS.INCLUDED;
    const breakfastQuantity = breakfastStatus === BREAKFAST_STATUS.INCLUDED ? parseInteger(formValues.breakfastQuantity, adults + children) : 0;
    return {
      id: createId("guest"),
      roomNumber: normalizeRoom(formValues.roomNumber),
      fullName: normalizeText(formValues.guestName) || "Hotel Guest",
      adults,
      children,
      mealPlan: normalizeText(formValues.mealPlan) || "FO Correction",
      products: ["FO Override"],
      productDescriptions: ["Manual entry \u2014 Front Office correction"],
      breakfastStatus,
      breakfastQuantity,
      confirmationNumber: normalizeText(formValues.confirmationNumber),
      arrival: "",
      departure: "",
      reservationStatus: "Manual",
      rateCode: "",
      guestType: GUEST_TYPES.HOTEL,
      statusOverride: true
    };
  }
  function updateCheckInTableNumber(checkIns, checkInId, tableNumber) {
    const nextTable = normalizeText(tableNumber);
    if (!checkInId || !nextTable) {
      return checkIns;
    }
    return checkIns.map((record) => {
      if (record.id !== checkInId) {
        return record;
      }
      return {
        ...record,
        tableNumber: nextTable
      };
    });
  }

  // js/export.js
  function ensureXlsx() {
    if (!window.XLSX) {
      throw new Error("Excel export library is not available offline.");
    }
    return window.XLSX;
  }
  function writeWorkbook(rows, fileName, sheetName) {
    const XLSX = ensureXlsx();
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    XLSX.writeFile(workbook, fileName);
  }
  function exportTodayReport(checkIns) {
    const rows = checkIns.map((record) => ({
      Time: record.timeLabel,
      "Room Number": record.roomNumber,
      "Guest Name": record.guestName,
      Adults: record.adults,
      Children: record.children,
      Table: record.tableNumber,
      "Meal Plan": record.mealPlan,
      Package: record.products,
      "Breakfast Included": record.breakfastStatus === "included" ? "Yes" : "No",
      "Guest Type": record.guestType,
      "FO Override": record.statusOverride ? "Yes" : "No"
    }));
    writeWorkbook(rows, `breakfast-report-${todayKey()}.xlsx`, "Breakfast Report");
  }
  function exportAccountingReport(paymentList) {
    const rows = paymentList.map((record) => ({
      Time: record.timestamp ? new Date(record.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "",
      "Room / Apartment": record.displayLocation,
      Guest: record.guestName,
      Table: record.tableNumber,
      "Guest Type": record.guestType,
      Reason: record.reason,
      "Extra Guests": record.extraGuests || "",
      "Guests Charged": record.chargeableGuests ?? "",
      "Unit Price (AED)": record.unitPriceAed ?? "",
      "Amount (AED)": record.amountAed ?? "",
      Paid: record.paid ? "Yes" : "No",
      "Paid At": record.paidAt ? new Date(record.paidAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : ""
    }));
    writeWorkbook(rows, `breakfast-accounting-${todayKey()}.xlsx`, "Accounting");
  }

  // js/mergeData.js
  function isBreakfastCode(code) {
    return Boolean(BREAKFAST_CODES[normalizeCode(code)]);
  }
  function isNoBreakfastCode(code) {
    return Boolean(NO_BREAKFAST_CODES[normalizeCode(code)]);
  }
  function aggregateForecastRows(forecastRows, keyForRow = (row) => normalizeText(row.confirmationNumber) || `room:${normalizeRoom(row.roomNumber)}`) {
    const grouped = /* @__PURE__ */ new Map();
    forecastRows.forEach((row) => {
      const key = keyForRow(row);
      if (!key) {
        return;
      }
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
      current.products.push(...row.products || [], row.productGroupCode);
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
  function guestFromForecast(packageData) {
    const products = uniqueList((packageData.products || []).map(normalizeCode));
    const breakfast = breakfastDecision(
      "",
      products,
      packageData.breakfastQuantity || 0,
      packageData.adults,
      packageData.children
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
      productDescriptions: uniqueList(packageData.productDescriptions || []),
      packageQuantity: packageData.packageQuantity || 0,
      reservationStatus: packageData.reservationStatus || "CHECKED IN",
      rateCode: packageData.rateCode || "",
      breakfastIncluded: breakfast.breakfastIncluded,
      breakfastStatus: breakfast.breakfastStatus,
      breakfastQuantity: breakfast.breakfastQuantity,
      guestType: GUEST_TYPES.HOTEL
    };
  }
  function mergeGuestData(mealPlanRows, packageForecastRows) {
    const forecastByConfirmation = aggregateForecastRows(
      packageForecastRows.filter((row) => normalizeText(row.confirmationNumber)),
      (row) => normalizeText(row.confirmationNumber)
    );
    const forecastByRoom = aggregateForecastRows(
      packageForecastRows.filter((row) => normalizeRoom(row.roomNumber)),
      (row) => normalizeRoom(row.roomNumber)
    );
    const matchedConfirmations = /* @__PURE__ */ new Set();
    const matchedRooms = /* @__PURE__ */ new Set();
    const guestsFromMealPlan = mealPlanRows.map((mealRow) => {
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
        ...packageData?.products || [],
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
    const guestsFromForecast = Array.from(forecastByConfirmation.values()).filter((packageData) => {
      const confirmation = normalizeText(packageData.confirmationNumber);
      const room = normalizeRoom(packageData.roomNumber);
      return !matchedConfirmations.has(confirmation) && !matchedRooms.has(room);
    }).map(guestFromForecast);
    const forecastWithoutConfirmation = Array.from(forecastByRoom.values()).filter((packageData) => !normalizeText(packageData.confirmationNumber)).filter((packageData) => !matchedRooms.has(normalizeRoom(packageData.roomNumber))).map(guestFromForecast);
    return [...guestsFromMealPlan, ...guestsFromForecast, ...forecastWithoutConfirmation];
  }

  // js/payment.js
  function requiresPayment(record) {
    return record.guestType === "Walk-In" || record.guestType === "Apartment" || record.breakfastStatus === BREAKFAST_STATUS.PAYMENT || Boolean(record.entitlementExceeded);
  }
  function paymentReason(record) {
    if (record.entitlementExceeded) {
      const count = Number(record.extraGuests) || 0;
      return `Extra guests (${count}) \u2014 entitlement exceeded`;
    }
    return reasonLabel(record.guestType, record.breakfastStatus);
  }
  function chargeableGuests(record) {
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
  function unitPriceAed(record) {
    return record.guestType === GUEST_TYPES.APARTMENT ? APARTMENT_PRICE_AED : BREAKFAST_PRICE_AED;
  }
  function createPaymentRecord(checkInRecord) {
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
  function syncPaymentList(checkIns) {
    return checkIns.filter(requiresPayment).map((record) => createPaymentRecord(record)).sort((a, b) => Number(a.paid) - Number(b.paid) || String(b.timestamp).localeCompare(String(a.timestamp)));
  }
  function markPaymentPaid(checkIns, paymentId) {
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

  // js/search.js
  function includesRoom(guestRoom, query) {
    const variants = roomSearchVariants(query);
    return variants.some((variant) => guestRoom.includes(variant) || variant.includes(guestRoom));
  }
  function fullNameValue(guest) {
    return [guest.firstName, guest.lastName].filter(Boolean).join(" ").trim();
  }
  function searchGuests(guests, query, limit = 8) {
    const normalizedQuery = normalizeSearchText(query);
    if (!normalizedQuery) {
      return [];
    }
    return guests.filter((guest) => {
      const room = normalizeSearchText(guest.roomNumber);
      const firstName = normalizeSearchText(guest.firstName);
      const lastName = normalizeSearchText(guest.lastName);
      const fullName = normalizeSearchText(fullNameValue(guest));
      const confirmation = normalizeSearchText(guest.confirmationNumber);
      return includesRoom(room, normalizedQuery) || firstName.includes(normalizedQuery) || lastName.includes(normalizedQuery) || fullName.includes(normalizedQuery) || confirmation.includes(normalizedQuery);
    }).slice(0, limit);
  }
  function exactRoomMatch(guests, query) {
    const variants = roomSearchVariants(query);
    return guests.find(
      (guest) => variants.includes(guest.roomNumber.replace(/^0+/, "") || "0") || variants.includes(guest.roomNumber)
    );
  }
  function highlightMatch(text, query) {
    const source = String(text ?? "");
    const normalizedSource = source.toLowerCase();
    const normalizedQuery = query.toLowerCase();
    const start = normalizedSource.indexOf(normalizedQuery);
    if (start === -1 || !query) {
      return escapeHtml(source);
    }
    const end = start + query.length;
    return `${escapeHtml(source.slice(0, start))}<mark>${escapeHtml(source.slice(start, end))}</mark>${escapeHtml(source.slice(end))}`;
  }
  function renderSearchResults(results, query) {
    if (!results.length) {
      return `<div class="rounded-2xl bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-400">No matching guest found.</div>`;
    }
    return results.map((guest, index) => {
      const mealPlan = guest.mealPlan && guest.mealPlan !== "-" ? guest.mealPlan : "";
      const packages = Array.isArray(guest.products) ? guest.products.filter(Boolean).join(", ") : String(guest.products || "");
      const mealPlanPackage = [mealPlan, packages].filter(Boolean).join(" \xB7 ") || "-";
      return `
        <button
          class="search-result flex w-full items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-left transition hover:bg-blue-50 active:scale-[0.99]"
          type="button"
          data-result-index="${index}"
        >
          <span class="min-w-[4.5rem] text-2xl font-extrabold tracking-wide text-slate-900">${highlightMatch(guest.roomNumber, query)}</span>
          <span class="min-w-0 flex-1">
            <strong class="block truncate text-sm font-bold text-slate-800">${highlightMatch(guest.fullName, query)}</strong>
            <span class="block truncate text-xs font-medium text-slate-400">${escapeHtml(mealPlanPackage)}</span>
          </span>
          <i class="fa-solid fa-chevron-right text-slate-300"></i>
        </button>
      `;
    }).join("");
  }

  // js/ui.js
  var RECENT_LIMIT = 6;
  function statusBadgeClass(status, guestType = "") {
    if (guestType === "Apartment") {
      return "status-apartment";
    }
    return statusMeta(status).className;
  }
  function statusBadgeLabel(status, guestType = "") {
    if (guestType === "Apartment") {
      return "Apartment Guest";
    }
    return statusMeta(status).label;
  }
  function infoChip(icon, label, value, wide = false) {
    return `
    <div class="rounded-2xl bg-slate-50 px-3 py-2.5${wide ? " col-span-2" : ""}">
      <div class="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
        <i class="fa-solid ${icon}"></i>
        <span>${escapeHtml(label)}</span>
      </div>
      <div class="text-sm font-bold text-slate-800">${escapeHtml(value)}</div>
    </div>
  `;
  }
  function guestPanelMarkup(guest) {
    if (!guest) {
      return `
      <div class="empty-guest-panel flex min-h-[180px] flex-col items-center justify-center gap-3 rounded-3xl bg-slate-50 px-6 text-center sm:min-h-[280px]">
        <div class="flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-primary shadow-card">
          <i class="fa-solid fa-mug-saucer text-2xl"></i>
        </div>
        <p class="max-w-xs text-sm font-medium leading-relaxed text-slate-400">
          Load both XML files and search for a room to begin breakfast check-in.
        </p>
      </div>
    `;
    }
    const status = statusMeta(guest.breakfastStatus);
    const statusTone = guest.breakfastStatus === "included" ? "from-green-50 to-white border-green-100" : guest.breakfastStatus === "payment" ? "from-red-50 to-white border-red-100" : "from-yellow-50 to-white border-yellow-100";
    const mealPlan = guest.mealPlan && guest.mealPlan !== "-" ? guest.mealPlan : "";
    const packages = listToText(guest.products);
    const mealPlanPackage = [mealPlan, packages !== "-" ? packages : ""].filter(Boolean).join(" \xB7 ") || "-";
    return `
    <div class="card-enter overflow-hidden rounded-3xl border bg-gradient-to-b ${statusTone}">
      <div class="flex items-start justify-between gap-3 p-4 pb-2">
        <div>
          <p class="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Room</p>
          <div class="room-title text-slate-900">${escapeHtml(guest.roomNumber)}</div>
          <div class="mt-1 flex items-center gap-2 text-lg font-bold text-slate-700">
            <i class="fa-solid fa-user text-sm text-slate-400"></i>
            <span>${escapeHtml(guest.fullName || "-")}</span>
          </div>
        </div>
        <span class="status-pill inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-extrabold ${status.className}">
          <i class="fa-solid ${guest.breakfastStatus === "included" ? "fa-circle-check" : guest.breakfastStatus === "payment" ? "fa-circle-exclamation" : "fa-triangle-exclamation"}"></i>
          ${escapeHtml(status.label)}
        </span>
      </div>

      <div class="guest-detail-grid p-3 pt-1 sm:p-4 sm:pt-2">
        ${infoChip("fa-user-group", "Adults", String(guest.adults))}
        ${infoChip("fa-child", "Children", String(guest.children))}
        ${infoChip("fa-utensils", "Meal Plan / Package", mealPlanPackage, true)}
        ${infoChip("fa-calendar-check", "Arrival", formatDate(guest.arrival))}
        ${infoChip("fa-calendar-xmark", "Departure", formatDate(guest.departure))}
        ${infoChip("fa-mug-hot", "BF Qty", String(guest.breakfastQuantity))}
      </div>

      <div class="flex flex-wrap items-center justify-between gap-2 border-t border-black/5 px-4 py-3">
        <p class="text-xs font-medium text-slate-500">
          <i class="fa-solid fa-circle-info mr-1 text-slate-300"></i>
          ${escapeHtml(listToText(guest.productDescriptions))}
          ${guest.statusOverride ? '<span class="ml-1 font-bold text-amber-600">(FO Override)</span>' : ""}
        </p>
        <button
          id="correctStatusButton"
          class="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-900 px-3 text-xs font-bold text-white transition active:scale-[0.97]"
          type="button"
        >
          <i class="fa-solid fa-pen-to-square"></i>
          <span>Correct Status</span>
        </button>
      </div>
    </div>
  `;
  }
  function checkInCardMarkup(record) {
    const badgeClass = statusBadgeClass(record.breakfastStatus, record.guestType);
    const badgeLabel = statusBadgeLabel(record.breakfastStatus, record.guestType);
    return `
    <article class="card-enter rounded-2xl bg-slate-50 p-3 transition hover:bg-white hover:shadow-card" data-checkin-id="${escapeHtml(record.id)}">
      <div class="mb-2 flex items-center justify-between gap-2">
        <span class="text-xs font-bold text-slate-400">${escapeHtml(record.timeLabel || "")}</span>
        <span class="inline-flex rounded-full px-2.5 py-1 text-[10px] font-extrabold ${badgeClass}">${escapeHtml(badgeLabel)}</span>
      </div>
      <div class="text-2xl font-black tracking-tight text-slate-900">${escapeHtml(record.roomNumber || "")}</div>
      <div class="mt-1 truncate text-sm font-semibold text-slate-600">${escapeHtml(record.guestName || "")}</div>
      <div class="mt-3 flex items-center justify-between gap-2 text-xs font-bold text-slate-500">
        <button
          class="inline-flex items-center gap-1.5 rounded-xl bg-white px-2.5 py-1.5 text-slate-700 transition active:scale-[0.97] hover:bg-blue-50"
          type="button"
          data-edit-table-id="${escapeHtml(record.id)}"
          title="Change table number"
        >
          <i class="fa-solid fa-chair text-primary"></i>
          <span>Table ${escapeHtml(String(record.tableNumber || "-"))}</span>
          <i class="fa-solid fa-pen text-[10px] text-slate-400"></i>
        </button>
        <span>${escapeHtml(record.guestType || "")}</span>
      </div>
    </article>
  `;
  }
  function paymentCardMarkup(record) {
    const paid = Boolean(record.paid);
    const tableButtonTone = paid ? "text-success" : "text-danger";
    const tableButtonClass = paid ? "bg-white text-slate-700 hover:bg-green-50" : "bg-white text-slate-700 hover:bg-red-50";
    if (paid) {
      return `
      <article class="card-enter rounded-2xl border border-green-100 bg-gradient-to-br from-green-50 to-white p-3 opacity-90" data-payment-id="${escapeHtml(record.id)}">
        <div class="mb-2 flex items-center justify-between gap-2">
          <span class="text-xs font-bold text-slate-400">${escapeHtml(record.timeLabel || "")}</span>
          <span class="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-1 text-[10px] font-extrabold text-success">
            <i class="fa-solid fa-circle-check"></i>
            Paid
          </span>
        </div>
        <div class="text-2xl font-black tracking-tight text-slate-900">${escapeHtml(record.displayLocation || "")}</div>
        <div class="mt-1 truncate text-sm font-semibold text-slate-600">${escapeHtml(record.guestName || "")}</div>
        <div class="mt-3 flex items-center justify-between gap-2 text-xs font-bold text-slate-500">
          <button
            class="inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 transition active:scale-[0.97] ${tableButtonClass}"
            type="button"
            data-edit-table-id="${escapeHtml(record.id)}"
            title="Change table number"
          >
            <i class="fa-solid fa-chair ${tableButtonTone}"></i>
            <span>Table ${escapeHtml(String(record.tableNumber || "-"))}</span>
            <i class="fa-solid fa-pen text-[10px] text-slate-400"></i>
          </button>
          <span>${escapeHtml(record.guestType || "")}</span>
        </div>
        <div class="mt-2 text-xs font-bold text-slate-500">${escapeHtml(record.reason || "")}</div>
      </article>
    `;
    }
    return `
    <article class="card-enter rounded-2xl border border-red-100 bg-gradient-to-br from-red-50 to-white p-3 shadow-press" data-payment-id="${escapeHtml(record.id)}">
      <div class="mb-2 flex items-center justify-between gap-2">
        <span class="text-xs font-bold text-slate-400">${escapeHtml(record.timeLabel || "")}</span>
        <span class="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-[10px] font-extrabold text-danger">
          <i class="fa-solid fa-receipt"></i>
          Unpaid
        </span>
      </div>
      <div class="text-2xl font-black tracking-tight text-slate-900">${escapeHtml(record.displayLocation || "")}</div>
      <div class="mt-1 truncate text-sm font-semibold text-slate-600">${escapeHtml(record.guestName || "")}</div>
      <div class="mt-3 flex items-center justify-between gap-2 text-xs font-bold text-slate-500">
        <button
          class="inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 transition active:scale-[0.97] ${tableButtonClass}"
          type="button"
          data-edit-table-id="${escapeHtml(record.id)}"
          title="Change table number"
        >
          <i class="fa-solid fa-chair ${tableButtonTone}"></i>
          <span>Table ${escapeHtml(String(record.tableNumber || "-"))}</span>
          <i class="fa-solid fa-pen text-[10px] text-slate-400"></i>
        </button>
        <span>${escapeHtml(record.guestType || "")}</span>
      </div>
      <div class="mt-2 text-xs font-bold text-danger">${escapeHtml(record.reason || "")}</div>
      <div class="mt-3 flex justify-end">
        <button
          class="pay-button inline-flex h-11 min-h-touch items-center gap-2 rounded-2xl bg-danger px-4 text-sm font-extrabold text-white transition active:scale-[0.97]"
          type="button"
          data-pay-id="${escapeHtml(record.id)}"
        >
          <i class="fa-solid fa-circle-check"></i>
          Paid
        </button>
      </div>
    </article>
  `;
  }
  function emptyCardsMarkup(message) {
    return `
    <div class="col-span-full flex min-h-[140px] flex-col items-center justify-center gap-2 rounded-2xl bg-slate-50 px-4 text-center">
      <i class="fa-regular fa-clipboard text-2xl text-slate-300"></i>
      <p class="text-sm font-semibold text-slate-400">${escapeHtml(message)}</p>
    </div>
  `;
  }
  var BreakfastUI = class {
    constructor() {
      this.recentRooms = [];
      this.elements = {
        mealPlanFile: document.querySelector("#mealPlanFile"),
        packageForecastFile: document.querySelector("#packageForecastFile"),
        mealPlanStatus: document.querySelector("#mealPlanStatus"),
        packageForecastStatus: document.querySelector("#packageForecastStatus"),
        searchInput: document.querySelector("#searchInput"),
        searchResults: document.querySelector("#searchResults"),
        recentSearches: document.querySelector("#recentSearches"),
        guestPanel: document.querySelector("#guestPanel"),
        tableNumberInput: document.querySelector("#tableNumber"),
        actualGuestsInput: document.querySelector("#actualGuests"),
        checkInButton: document.querySelector("#checkInButton"),
        walkInButton: document.querySelector("#walkInButton"),
        apartmentButton: document.querySelector("#apartmentButton"),
        manualGuestButton: document.querySelector("#manualGuestButton"),
        newDayButton: document.querySelector("#newDayButton"),
        exportTodayButton: document.querySelector("#exportTodayButton"),
        exportAccountingButton: document.querySelector("#exportAccountingButton"),
        checkinTableBody: document.querySelector("#checkinTableBody"),
        paymentTableBody: document.querySelector("#paymentTableBody"),
        tabButtons: Array.from(document.querySelectorAll("[data-tab-target]")),
        tabPanels: Array.from(document.querySelectorAll("[data-tab-panel]")),
        messageArea: document.querySelector("#messageArea"),
        modal: document.querySelector("#modal"),
        modalTitle: document.querySelector("#modalTitle"),
        modalBody: document.querySelector("#modalBody"),
        modalActions: document.querySelector("#modalActions"),
        successToast: document.querySelector("#successToast"),
        statCheckIns: document.querySelector("#statCheckIns"),
        statPayments: document.querySelector("#statPayments"),
        statIncluded: document.querySelector("#statIncluded"),
        statPaymentRequired: document.querySelector("#statPaymentRequired")
      };
      this.bindRecentSearchClicks();
      this.renderRecentSearches();
    }
    bindRecentSearchClicks() {
      this.elements.recentSearches?.addEventListener("click", (event) => {
        const chip = event.target.closest("[data-recent-room]");
        if (!chip || !this.elements.searchInput) {
          return;
        }
        this.elements.searchInput.value = chip.dataset.recentRoom;
        this.elements.searchInput.dispatchEvent(new Event("input", { bubbles: true }));
        this.elements.searchInput.focus();
      });
    }
    setFileStatus(type, loaded, fileName = "") {
      const element = type === "mealPlan" ? this.elements.mealPlanStatus : this.elements.packageForecastStatus;
      const mobileElement = type === "mealPlan" ? document.querySelector("#mobileMealPlanStatus") : document.querySelector("#mobilePackageForecastStatus");
      const label = type === "mealPlan" ? "Meal Plan" : "Package Forecast";
      const shortLabel = type === "mealPlan" ? "Meal Plan" : "Forecast";
      const desktopClass = loaded ? "file-status is-loaded inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-2 text-xs font-bold" : "file-status is-missing inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-2 text-xs font-bold";
      const mobileClass = loaded ? "file-status is-loaded rounded-xl px-3 py-2 text-center text-[11px] font-bold" : "file-status is-missing rounded-xl px-3 py-2 text-center text-[11px] font-bold";
      const text = loaded ? `${label}: Loaded` : `${label}: Missing`;
      const mobileText = loaded ? `${shortLabel}: Loaded` : `${shortLabel}: Missing`;
      if (element) {
        element.className = desktopClass;
        element.textContent = text;
        element.title = fileName;
      }
      if (mobileElement) {
        mobileElement.className = mobileClass;
        mobileElement.textContent = mobileText;
        mobileElement.title = fileName;
      }
    }
    setFileLoading(type, fileName = "") {
      const element = type === "mealPlan" ? this.elements.mealPlanStatus : this.elements.packageForecastStatus;
      const mobileElement = type === "mealPlan" ? document.querySelector("#mobileMealPlanStatus") : document.querySelector("#mobilePackageForecastStatus");
      const label = type === "mealPlan" ? "Meal Plan" : "Package Forecast";
      const shortLabel = type === "mealPlan" ? "Meal Plan" : "Forecast";
      if (element) {
        element.className = "file-status is-loading inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-2 text-xs font-bold";
        element.textContent = `${label}: Reading...`;
        element.title = fileName;
      }
      if (mobileElement) {
        mobileElement.className = "file-status is-loading rounded-xl px-3 py-2 text-center text-[11px] font-bold";
        mobileElement.textContent = `${shortLabel}: Reading...`;
        mobileElement.title = fileName;
      }
    }
    pushRecentRoom(guest) {
      if (!guest?.roomNumber) {
        return;
      }
      this.recentRooms = [
        { roomNumber: guest.roomNumber, guestName: guest.fullName || "" },
        ...this.recentRooms.filter((item) => item.roomNumber !== guest.roomNumber)
      ].slice(0, RECENT_LIMIT);
      this.renderRecentSearches();
    }
    renderRecentSearches() {
      if (!this.elements.recentSearches) {
        return;
      }
      if (!this.recentRooms.length) {
        this.elements.recentSearches.innerHTML = `<span class="rounded-full bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-300">No recent rooms</span>`;
        return;
      }
      this.elements.recentSearches.innerHTML = this.recentRooms.map(
        (item) => `
          <button
            type="button"
            data-recent-room="${escapeHtml(item.roomNumber)}"
            class="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-blue-50 hover:text-primary active:scale-[0.97]"
          >
            <i class="fa-solid fa-door-closed text-primary"></i>
            ${escapeHtml(item.roomNumber)}
          </button>
        `
      ).join("");
    }
    renderGuest(guest) {
      this.elements.guestPanel.innerHTML = guestPanelMarkup(guest);
      if (guest) {
        this.pushRecentRoom(guest);
      }
    }
    renderSearch(results, query, activeIndex = -1) {
      this.elements.searchResults.innerHTML = renderSearchResults(results, query);
      const resultButtons = Array.from(this.elements.searchResults.querySelectorAll(".search-result"));
      resultButtons.forEach((button, index) => {
        button.classList.toggle("is-active", index === activeIndex);
      });
    }
    clearSearchResults() {
      this.elements.searchResults.innerHTML = "";
    }
    updateStatistics(checkIns = [], payments = []) {
      const unpaid = payments.filter((record) => !record.paid);
      if (this.elements.statCheckIns) {
        this.elements.statCheckIns.textContent = String(checkIns.length);
      }
      if (this.elements.statPayments) {
        this.elements.statPayments.textContent = String(unpaid.length);
      }
      if (this.elements.statIncluded) {
        this.elements.statIncluded.textContent = String(
          checkIns.filter((record) => record.breakfastStatus === "included").length
        );
      }
      if (this.elements.statPaymentRequired) {
        this.elements.statPaymentRequired.textContent = String(
          checkIns.filter((record) => record.breakfastStatus === "payment" || record.guestType === "Apartment" || record.guestType === "Walk-In").length
        );
      }
    }
    renderCheckIns(records) {
      this._lastCheckIns = records;
      this.elements.checkinTableBody.innerHTML = records.length ? records.map((record) => checkInCardMarkup(record)).join("") : emptyCardsMarkup("No check-ins recorded yet.");
      this.updateStatistics(records, this._lastPayments || []);
    }
    renderPayments(records) {
      this._lastPayments = records;
      this.elements.paymentTableBody.innerHTML = records.length ? records.map((record) => paymentCardMarkup(record)).join("") : emptyCardsMarkup("No payment items queued.");
      this.updateStatistics(this._lastCheckIns || [], records);
    }
    playSuccessAnimation() {
      const toast = this.elements.successToast;
      const button = this.elements.checkInButton;
      if (toast) {
        toast.classList.add("is-visible");
        window.setTimeout(() => toast.classList.remove("is-visible"), 1200);
      }
      if (button) {
        button.classList.add("checkin-success-pulse");
        window.setTimeout(() => button.classList.remove("checkin-success-pulse"), 700);
      }
    }
    renderMessage(message, tone = "info") {
      this.elements.messageArea.className = `message-banner mb-2 shrink-0 rounded-2xl px-3 py-2 text-sm font-semibold sm:mb-3 sm:px-4 sm:py-3 ${tone}`;
      this.elements.messageArea.textContent = message;
      this.elements.messageArea.hidden = !message;
      if (tone === "success" && /checked in successfully/i.test(message || "")) {
        this.playSuccessAnimation();
      }
    }
    setCheckInEnabled(enabled) {
      this.elements.searchInput.disabled = !enabled;
      this.elements.tableNumberInput.disabled = !enabled;
      this.elements.actualGuestsInput.disabled = !enabled;
      this.elements.checkInButton.disabled = !enabled;
    }
    setExportState(hasCheckIns, hasPayments) {
      this.elements.exportTodayButton.disabled = !hasCheckIns;
      this.elements.exportAccountingButton.disabled = !hasPayments;
      const mobileExportToday = document.querySelector("#mobileExportTodayButton");
      const mobileExportAccounting = document.querySelector("#mobileExportAccountingButton");
      if (mobileExportToday) {
        mobileExportToday.disabled = !hasCheckIns;
      }
      if (mobileExportAccounting) {
        mobileExportAccounting.disabled = !hasPayments;
      }
    }
    activateTab(targetName) {
      this.elements.tabButtons.forEach((button) => {
        button.classList.toggle("is-active", button.dataset.tabTarget === targetName);
      });
      this.elements.tabPanels.forEach((panel) => {
        panel.hidden = panel.dataset.tabPanel !== targetName;
      });
      this.setMobileView(targetName);
    }
    setMobileView(viewName) {
      const workspace = document.querySelector(".main-workspace");
      if (workspace) {
        workspace.classList.remove("mobile-view-search", "mobile-view-checkin", "mobile-view-checkins", "mobile-view-payments");
        workspace.classList.add(`mobile-view-${viewName}`);
      }
      document.querySelectorAll("[data-mobile-view]").forEach((button) => {
        const isSearch = button.dataset.mobileView === "search";
        const active = button.dataset.mobileView === viewName;
        if (isSearch) {
          button.classList.toggle("is-active", active);
        }
      });
    }
    openModal({ title, body, actions = [] }) {
      this.elements.modalTitle.textContent = title;
      this.elements.modalBody.innerHTML = body;
      this.elements.modalActions.innerHTML = "";
      actions.forEach((action) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `btn ${action.variant || "btn-secondary"}`;
        button.textContent = action.label;
        button.addEventListener("click", () => action.onClick());
        this.elements.modalActions.appendChild(button);
      });
      this.elements.modal.hidden = false;
      this.elements.modal.setAttribute("aria-hidden", "false");
    }
    closeModal() {
      this.elements.modal.hidden = true;
      this.elements.modal.setAttribute("aria-hidden", "true");
      this.elements.modalTitle.textContent = "";
      this.elements.modalBody.innerHTML = "";
      this.elements.modalActions.innerHTML = "";
    }
    promptConfirm({ title, message, confirmLabel = "Confirm", cancelLabel = "Cancel", danger = false }) {
      return new Promise((resolve) => {
        this.openModal({
          title,
          body: `<p class="text-base leading-relaxed">${escapeHtml(message)}</p>`,
          actions: [
            {
              label: cancelLabel,
              variant: "btn-secondary",
              onClick: () => {
                this.closeModal();
                resolve(false);
              }
            },
            {
              label: confirmLabel,
              variant: danger ? "btn-danger" : "btn-primary",
              onClick: () => {
                this.closeModal();
                resolve(true);
              }
            }
          ]
        });
      });
    }
    promptForm({ title, fields, submitLabel = "Save" }) {
      return new Promise((resolve) => {
        const body = `
        <form id="dynamicModalForm" class="modal-form">
          ${fields.map((field) => {
          if (field.type === "select") {
            return `
                  <label class="form-field">
                    <span>${escapeHtml(field.label)}</span>
                    <select name="${escapeHtml(field.name)}" ${field.required ? "required" : ""}>
                      ${(field.options || []).map(
              (option) => `
                            <option value="${escapeHtml(option.value)}" ${String(option.value) === String(field.value || "") ? "selected" : ""}>
                              ${escapeHtml(option.label)}
                            </option>
                          `
            ).join("")}
                    </select>
                  </label>
                `;
          }
          return `
                <label class="form-field">
                  <span>${escapeHtml(field.label)}</span>
                  <input
                    type="${escapeHtml(field.type || "text")}"
                    name="${escapeHtml(field.name)}"
                    value="${escapeHtml(field.value || "")}"
                    ${field.min !== void 0 ? `min="${escapeHtml(String(field.min))}"` : ""}
                    ${field.required ? "required" : ""}
                  />
                </label>
              `;
        }).join("")}
        </form>
      `;
        this.openModal({
          title,
          body,
          actions: [
            {
              label: "Cancel",
              variant: "btn-secondary",
              onClick: () => {
                this.closeModal();
                resolve(null);
              }
            },
            {
              label: submitLabel,
              variant: "btn-primary",
              onClick: () => {
                const form = document.querySelector("#dynamicModalForm");
                if (!form.reportValidity()) {
                  return;
                }
                const formData = new FormData(form);
                this.closeModal();
                resolve(Object.fromEntries(formData.entries()));
              }
            }
          ]
        });
        const firstField = this.elements.modal.querySelector("input, select");
        firstField?.focus();
      });
    }
  };

  // js/auth.js
  var USERS = {
    KCA: "KCAadmin",
    KTB: "KTBadmin"
  };
  var BRAND_LOGOS = {
    KCA: "./assets/logos/kca.svg",
    KTB: "./assets/logos/ktb.svg"
  };
  var AUTH_KEY = "breakfast-auth-user";
  function normalizeUsername(username) {
    return String(username || "").trim().toUpperCase();
  }
  function getBrandLogo(username) {
    const key = normalizeUsername(username);
    return BRAND_LOGOS[key] || "";
  }
  function login(username, password) {
    const normalizedUsername = normalizeUsername(username);
    const expectedPassword = USERS[normalizedUsername];
    if (!expectedPassword || expectedPassword !== password) {
      return false;
    }
    sessionStorage.setItem(AUTH_KEY, normalizedUsername);
    return true;
  }
  function logout() {
    sessionStorage.removeItem(AUTH_KEY);
  }
  function isLoggedIn() {
    return Boolean(sessionStorage.getItem(AUTH_KEY));
  }
  function getCurrentUser() {
    return sessionStorage.getItem(AUTH_KEY) || "";
  }

  // js/xmlParser.js
  var ROWSET_NS = "urn:schemas-microsoft-com:xml-analysis:rowset";
  var XSD_NS = "http://www.w3.org/2001/XMLSchema";
  var SAW_SQL_NS = "urn:saw-sql";
  var MEAL_HEADING_MATCHERS = {
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
    const rawMappings = schemaElements.map((element) => ({
      key: element.getAttribute("name"),
      heading: element.getAttributeNS(SAW_SQL_NS, "columnHeading") || element.getAttribute("saw-sql:columnHeading") || ""
    })).filter((entry) => entry.key && entry.heading);
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
    return normalizeText(value).split(",").map((part) => normalizeCode(part)).filter(Boolean);
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
  function parseMealPlanXml(xmlText) {
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
  function parsePackageForecastXml(xmlText) {
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

  // js/app.js
  var BreakfastApp = class {
    constructor() {
      this.ui = new BreakfastUI();
      this.state = this.createInitialState();
      this.searchState = {
        results: [],
        activeIndex: -1
      };
      this.selectedGuest = null;
    }
    createInitialState() {
      const stored = readStoredState();
      if (stored) {
        return {
          ...stored,
          fileNames: stored.fileNames || {
            mealPlan: "",
            packageForecast: ""
          }
        };
      }
      return {
        guests: [],
        checkIns: [],
        paymentList: [],
        filesLoaded: {
          mealPlan: false,
          packageForecast: false
        },
        fileNames: {
          mealPlan: "",
          packageForecast: ""
        },
        rawData: {
          mealPlan: [],
          packageForecast: []
        },
        serviceDate: todayKey()
      };
    }
    init() {
      this.bindEvents();
      this.refreshUi();
      if (window.matchMedia("(max-width: 767px)").matches) {
        this.ui.setMobileView("search");
      }
    }
    bindEvents() {
      const { elements } = this.ui;
      this.bindRequiredElement(elements.mealPlanFile, "mealPlanFile");
      this.bindRequiredElement(elements.packageForecastFile, "packageForecastFile");
      elements.mealPlanFile.addEventListener("change", (event) => {
        this.handleFileUpload("mealPlan", event.target.files[0], event.target);
      });
      elements.packageForecastFile.addEventListener("change", (event) => {
        this.handleFileUpload("packageForecast", event.target.files[0], event.target);
      });
      elements.searchInput.addEventListener("input", (event) => this.handleSearch(event.target.value));
      elements.searchInput.addEventListener("keydown", (event) => this.handleSearchKeys(event));
      elements.searchResults.addEventListener("click", (event) => {
        const button = event.target.closest("[data-result-index]");
        if (!button) {
          return;
        }
        const guest = this.searchState.results[Number(button.dataset.resultIndex)];
        if (guest) {
          this.selectGuest(guest);
        }
      });
      elements.checkInButton.addEventListener("click", () => this.submitHotelCheckIn());
      elements.tableNumberInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          this.submitHotelCheckIn();
        }
      });
      elements.actualGuestsInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          if (elements.tableNumberInput.value.trim()) {
            this.submitHotelCheckIn();
          } else {
            elements.tableNumberInput.focus();
          }
        }
      });
      elements.walkInButton.addEventListener("click", () => this.handleSpecialGuest("walkIn"));
      elements.apartmentButton.addEventListener("click", () => this.handleSpecialGuest("apartment"));
      elements.manualGuestButton?.addEventListener("click", () => this.handleManualGuest());
      elements.newDayButton.addEventListener("click", () => this.handleNewDay());
      elements.exportTodayButton.addEventListener("click", () => this.handleExportToday());
      elements.exportAccountingButton.addEventListener("click", () => this.handleExportAccounting());
      elements.paymentTableBody?.addEventListener("click", (event) => {
        const editTableButton = event.target.closest("[data-edit-table-id]");
        if (editTableButton) {
          this.handleChangeTable(editTableButton.dataset.editTableId);
          return;
        }
        const payButton = event.target.closest("[data-pay-id]");
        if (payButton) {
          this.handleMarkPaid(payButton.dataset.payId);
        }
      });
      elements.checkinTableBody?.addEventListener("click", (event) => {
        const editTableButton = event.target.closest("[data-edit-table-id]");
        if (editTableButton) {
          this.handleChangeTable(editTableButton.dataset.editTableId);
        }
      });
      elements.guestPanel?.addEventListener("click", (event) => {
        if (event.target.closest("#correctStatusButton")) {
          this.handleCorrectStatus();
        }
      });
      document.querySelector("#modalCloseButton").addEventListener("click", () => {
        this.ui.closeModal();
        this.focusSearch();
      });
      elements.tabButtons.forEach((button) => {
        button.addEventListener("click", () => this.ui.activateTab(button.dataset.tabTarget));
      });
      document.querySelector("#mobileToolsToggle")?.addEventListener("click", () => {
        const panel = document.querySelector("#mobileToolsPanel");
        if (panel) {
          panel.hidden = !panel.hidden;
        }
      });
      document.querySelector('[data-mobile-view="search"]')?.addEventListener("click", () => {
        this.ui.setMobileView("search");
        this.focusSearch();
      });
      document.querySelector("#mobileNewDayButton")?.addEventListener("click", () => this.handleNewDay());
      document.querySelector("#mobileLogoutButton")?.addEventListener("click", () => {
        document.querySelector("#logoutButton")?.click();
      });
      document.querySelector("#mobileExportTodayButton")?.addEventListener("click", () => this.handleExportToday());
      document.querySelector("#mobileExportAccountingButton")?.addEventListener("click", () => this.handleExportAccounting());
      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && !this.ui.elements.modal.hidden) {
          this.ui.closeModal();
          this.focusSearch();
        }
      });
    }
    bindRequiredElement(element, name) {
      if (!element) {
        throw new Error(`Missing interface element: ${name}`);
      }
    }
    persistState() {
      writeStoredState(this.state);
    }
    refreshUi() {
      this.ui.setFileStatus("mealPlan", this.state.filesLoaded.mealPlan, this.state.fileNames?.mealPlan || "");
      this.ui.setFileStatus("packageForecast", this.state.filesLoaded.packageForecast, this.state.fileNames?.packageForecast || "");
      this.ui.renderGuest(this.selectedGuest);
      const checkInsForTable = this.state.checkIns.map((record) => ({
        ...record,
        breakfastLabel: statusMeta(record.breakfastStatus).label
      }));
      const paymentForTable = this.state.paymentList.map((record) => ({
        ...record,
        timeLabel: record.timestamp ? new Date(record.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : ""
      }));
      this.ui.renderCheckIns(checkInsForTable);
      this.ui.renderPayments(paymentForTable);
      const filesReady = this.state.filesLoaded.mealPlan && this.state.filesLoaded.packageForecast;
      const manualReady = Boolean(this.selectedGuest?.statusOverride);
      this.ui.setCheckInEnabled(filesReady || manualReady);
      this.ui.setExportState(
        Boolean(this.state.checkIns.length),
        Boolean(this.state.paymentList.length)
      );
      const activeTab = this.ui.elements.tabButtons.find((button) => button.classList.contains("is-active"))?.dataset.tabTarget || "checkin";
      this.ui.activateTab(activeTab);
    }
    async handleFileUpload(type, file, inputElement) {
      if (!file) {
        return;
      }
      this.ui.setFileLoading(type, file.name);
      this.ui.renderMessage(`Reading ${file.name}...`, "info");
      try {
        const text = await file.text();
        if (type === "mealPlan") {
          this.state.rawData.mealPlan = parseMealPlanXml(text);
        } else {
          this.state.rawData.packageForecast = parsePackageForecastXml(text);
        }
        this.state.filesLoaded[type] = true;
        this.state.fileNames[type] = file.name;
        if (this.state.filesLoaded.mealPlan && this.state.filesLoaded.packageForecast) {
          this.state.guests = mergeGuestData(this.state.rawData.mealPlan, this.state.rawData.packageForecast);
          this.ui.renderMessage(`Loaded ${this.state.guests.length} hotel guests for today's breakfast service.`, "success");
        } else {
          this.ui.renderMessage(`${type === "mealPlan" ? "Meal Plan" : "Package Forecast"} loaded. Please load the second XML report.`, "info");
        }
        this.persistState();
        this.refreshUi();
        this.focusSearch();
      } catch (error) {
        this.state.filesLoaded[type] = false;
        this.state.fileNames[type] = "";
        this.refreshUi();
        this.ui.renderMessage(error.message, "error");
      } finally {
        if (inputElement) {
          inputElement.value = "";
        }
      }
    }
    handleSearch(query) {
      if (!this.state.guests.length) {
        this.ui.renderMessage("Please load both XML reports before checking in guests.", "warning");
        return;
      }
      if (!query.trim()) {
        this.searchState.results = [];
        this.searchState.activeIndex = -1;
        this.ui.clearSearchResults();
        return;
      }
      this.searchState.results = searchGuests(this.state.guests, query);
      this.searchState.activeIndex = this.searchState.results.length ? 0 : -1;
      this.ui.renderSearch(this.searchState.results, query, this.searchState.activeIndex);
    }
    handleSearchKeys(event) {
      if (!this.searchState.results.length && event.key === "Enter") {
        const guest = exactRoomMatch(this.state.guests, event.target.value);
        if (guest) {
          event.preventDefault();
          this.selectGuest(guest);
        } else {
          this.ui.renderMessage("Guest not found. Check room number or use Walk-In.", "warning");
        }
        return;
      }
      if (!this.searchState.results.length) {
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        this.searchState.activeIndex = (this.searchState.activeIndex + 1) % this.searchState.results.length;
        this.ui.renderSearch(this.searchState.results, event.target.value, this.searchState.activeIndex);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        this.searchState.activeIndex = (this.searchState.activeIndex - 1 + this.searchState.results.length) % this.searchState.results.length;
        this.ui.renderSearch(this.searchState.results, event.target.value, this.searchState.activeIndex);
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        const exactGuest = exactRoomMatch(this.state.guests, event.target.value);
        const guest = exactGuest || this.searchState.results[this.searchState.activeIndex] || this.searchState.results[0];
        if (guest) {
          this.selectGuest(guest);
        } else {
          this.ui.renderMessage("Guest not found. Check room number or use Walk-In.", "warning");
        }
      }
    }
    selectGuest(guest) {
      this.selectedGuest = guest;
      this.ui.renderGuest(guest);
      this.ui.clearSearchResults();
      this.ui.activateTab("checkin");
      this.ui.elements.tableNumberInput.focus();
    }
    async submitHotelCheckIn() {
      if (!this.selectedGuest) {
        this.ui.renderMessage("Select a guest before checking in.", "warning");
        return;
      }
      const tableNumber = this.ui.elements.tableNumberInput.value.trim();
      if (!tableNumber) {
        this.ui.renderMessage("Table number is required.", "warning");
        this.ui.elements.tableNumberInput.focus();
        return;
      }
      const existingCheckIn = findHotelCheckInByRoom(this.state.checkIns, this.selectedGuest.roomNumber);
      if (existingCheckIn) {
        await this.handleLateArrivals(existingCheckIn, tableNumber);
        return;
      }
      const actualGuests = this.ui.elements.actualGuestsInput.value.trim();
      if (checkEntitlement(this.selectedGuest, actualGuests)) {
        const extraGuests = getExtraGuests(this.selectedGuest, actualGuests);
        const confirmed = await this.ui.promptConfirm({
          title: "Breakfast Entitlement Exceeded",
          message: `Breakfast entitlement exceeded. ${extraGuests} extra guest(s) will be added to the payment list. Do you want to continue?`,
          confirmLabel: "Continue"
        });
        if (!confirmed) {
          return;
        }
      }
      const record = createHotelCheckIn(this.selectedGuest, {
        tableNumber,
        actualGuests
      });
      const successMessage = record.entitlementExceeded ? `${this.selectedGuest.roomNumber} checked in successfully. ${record.extraGuests} extra guest(s) added to payment list.` : `${this.selectedGuest.roomNumber} checked in successfully.`;
      this.commitCheckIn(record, successMessage, "success");
    }
    async handleLateArrivals(existingCheckIn, tableNumber) {
      const formValues = await this.ui.promptForm({
        title: `Late Arrivals \u2014 Room ${existingCheckIn.roomNumber}`,
        submitLabel: "Add Arrivals",
        fields: [
          {
            name: "additionalGuests",
            label: "Additional guests arriving now",
            type: "number",
            min: 1,
            value: "1",
            required: true
          }
        ]
      });
      if (!formValues) {
        this.focusSearch();
        return;
      }
      const additionalGuests = parseInteger(formValues.additionalGuests, 0);
      if (additionalGuests < 1) {
        this.ui.renderMessage("Enter at least 1 additional guest.", "warning");
        return;
      }
      const updated = applyLateArrivals(existingCheckIn, {
        additionalGuests,
        tableNumber
      });
      this.state.checkIns = this.state.checkIns.map(
        (record) => record.id === existingCheckIn.id ? updated : record
      );
      this.state.paymentList = syncPaymentList(this.state.checkIns);
      this.persistState();
      this.ui.elements.tableNumberInput.value = "";
      this.ui.elements.actualGuestsInput.value = "";
      this.ui.elements.searchInput.value = "";
      this.selectedGuest = null;
      this.searchState.results = [];
      this.searchState.activeIndex = -1;
      this.ui.clearSearchResults();
      this.refreshUi();
      this.focusSearch();
      const extrasNote = updated.entitlementExceeded ? ` Payment list updated (${updated.extraGuests} extra guest(s)).` : "";
      this.ui.renderMessage(
        `Room ${updated.roomNumber} updated: +${updated.lateArrivalAdded} late arrival(s).${extrasNote}`,
        "success"
      );
    }
    async handleSpecialGuest(type) {
      const formValues = type === "walkIn" ? await this.ui.promptForm({
        title: "Walk-In Guest",
        submitLabel: "Check In",
        fields: [
          { name: "guestName", label: "Guest Name" },
          { name: "adults", label: "Adults", type: "number", min: 0, value: "1", required: true },
          { name: "children", label: "Children", type: "number", min: 0, value: "0", required: true },
          { name: "tableNumber", label: "Table Number", required: true }
        ]
      }) : await this.ui.promptForm({
        title: "Apartment Guest",
        submitLabel: "Check In",
        fields: [
          { name: "apartmentNumber", label: "Apartment Number", required: true },
          { name: "guestName", label: "Guest Name" },
          { name: "adults", label: "Adults", type: "number", min: 0, value: "1", required: true },
          { name: "children", label: "Children", type: "number", min: 0, value: "0", required: true },
          { name: "tableNumber", label: "Table Number", required: true }
        ]
      });
      if (!formValues) {
        this.focusSearch();
        return;
      }
      const record = type === "walkIn" ? createWalkInCheckIn(formValues) : createApartmentCheckIn(formValues);
      this.commitCheckIn(record, `${record.guestType} guest checked in successfully.`, "success");
    }
    async handleManualGuest() {
      const formValues = await this.ui.promptForm({
        title: "Manual Guest (FO Correction)",
        submitLabel: "Load Guest",
        fields: [
          { name: "roomNumber", label: "Room Number", required: true },
          { name: "guestName", label: "Guest Name", required: true },
          { name: "adults", label: "Adults", type: "number", min: 0, value: "1", required: true },
          { name: "children", label: "Children", type: "number", min: 0, value: "0", required: true },
          {
            name: "breakfastStatus",
            label: "Breakfast Status",
            type: "select",
            value: BREAKFAST_STATUS.INCLUDED,
            required: true,
            options: [
              { value: BREAKFAST_STATUS.INCLUDED, label: "Breakfast Included" },
              { value: BREAKFAST_STATUS.PAYMENT, label: "Payment Required (Room Only)" },
              { value: BREAKFAST_STATUS.UNKNOWN, label: "Unknown Package" }
            ]
          },
          { name: "breakfastQuantity", label: "Breakfast Qty", type: "number", min: 0, value: "2", required: true },
          { name: "confirmationNumber", label: "Confirmation (optional)" },
          { name: "mealPlan", label: "Meal Plan Note", value: "FO Correction" }
        ]
      });
      if (!formValues) {
        this.focusSearch();
        return;
      }
      const guest = createManualGuest(formValues);
      if (!guest.roomNumber) {
        this.ui.renderMessage("Room number is required for manual guest.", "warning");
        return;
      }
      const existingIndex = this.state.guests.findIndex(
        (item) => normalizeRoom(item.roomNumber) === guest.roomNumber
      );
      if (existingIndex >= 0) {
        this.state.guests[existingIndex] = {
          ...this.state.guests[existingIndex],
          ...guest,
          id: this.state.guests[existingIndex].id,
          statusOverride: true
        };
        this.selectGuest(this.state.guests[existingIndex]);
      } else {
        this.state.guests.push(guest);
        this.selectGuest(guest);
      }
      this.persistState();
      this.ui.renderMessage(`Manual guest ${guest.roomNumber} loaded. Review status then check in.`, "success");
    }
    async handleCorrectStatus() {
      if (!this.selectedGuest) {
        this.ui.renderMessage("Select a guest before correcting status.", "warning");
        return;
      }
      const formValues = await this.ui.promptForm({
        title: "Correct Breakfast Status (FO)",
        submitLabel: "Apply Correction",
        fields: [
          {
            name: "breakfastStatus",
            label: "Breakfast Status",
            type: "select",
            value: this.selectedGuest.breakfastStatus,
            required: true,
            options: [
              { value: BREAKFAST_STATUS.INCLUDED, label: "Breakfast Included" },
              { value: BREAKFAST_STATUS.PAYMENT, label: "Payment Required (Room Only)" },
              { value: BREAKFAST_STATUS.UNKNOWN, label: "Unknown Package" }
            ]
          },
          {
            name: "breakfastQuantity",
            label: "Breakfast Qty",
            type: "number",
            min: 0,
            value: String(this.selectedGuest.breakfastQuantity || 0),
            required: true
          },
          {
            name: "mealPlan",
            label: "Meal Plan Note",
            value: this.selectedGuest.mealPlan || ""
          }
        ]
      });
      if (!formValues) {
        return;
      }
      const breakfastStatus = formValues.breakfastStatus || BREAKFAST_STATUS.UNKNOWN;
      const breakfastQuantity = breakfastStatus === BREAKFAST_STATUS.INCLUDED ? parseInteger(formValues.breakfastQuantity, 0) : parseInteger(formValues.breakfastQuantity, 0);
      this.selectedGuest = {
        ...this.selectedGuest,
        breakfastStatus,
        breakfastQuantity,
        mealPlan: formValues.mealPlan || this.selectedGuest.mealPlan,
        statusOverride: true
      };
      const guestIndex = this.state.guests.findIndex(
        (guest) => guest.id === this.selectedGuest.id || normalizeRoom(guest.roomNumber) === normalizeRoom(this.selectedGuest.roomNumber)
      );
      if (guestIndex >= 0) {
        this.state.guests[guestIndex] = {
          ...this.state.guests[guestIndex],
          ...this.selectedGuest
        };
      }
      this.persistState();
      this.ui.renderGuest(this.selectedGuest);
      this.ui.renderMessage(`Status corrected for room ${this.selectedGuest.roomNumber}.`, "success");
    }
    handleMarkPaid(paymentId) {
      if (!paymentId) {
        return;
      }
      const payment = this.state.paymentList.find((record) => record.id === paymentId);
      if (!payment || payment.paid) {
        return;
      }
      this.state.checkIns = markPaymentPaid(this.state.checkIns, paymentId);
      this.state.paymentList = syncPaymentList(this.state.checkIns);
      this.persistState();
      this.refreshUi();
      this.ui.renderMessage(`${payment.displayLocation} marked as paid.`, "success");
    }
    async handleChangeTable(checkInId) {
      if (!checkInId) {
        return;
      }
      const record = this.state.checkIns.find((item) => item.id === checkInId);
      if (!record) {
        return;
      }
      const formValues = await this.ui.promptForm({
        title: "Change Table Number",
        submitLabel: "Update",
        fields: [
          {
            name: "tableNumber",
            label: "Table Number",
            value: String(record.tableNumber || ""),
            required: true
          }
        ]
      });
      if (!formValues) {
        return;
      }
      const nextTable = String(formValues.tableNumber || "").trim();
      if (!nextTable) {
        this.ui.renderMessage("Table number is required.", "warning");
        return;
      }
      if (nextTable === String(record.tableNumber || "")) {
        return;
      }
      this.state.checkIns = updateCheckInTableNumber(this.state.checkIns, checkInId, nextTable);
      this.state.paymentList = syncPaymentList(this.state.checkIns);
      this.persistState();
      this.refreshUi();
      this.ui.renderMessage(
        `Table updated for ${record.roomNumber}: ${record.tableNumber || "-"} \u2192 ${nextTable}.`,
        "success"
      );
    }
    commitCheckIn(record, message, tone) {
      this.state.checkIns.unshift(record);
      this.state.paymentList = syncPaymentList(this.state.checkIns);
      this.persistState();
      this.ui.renderMessage(message, tone);
      this.ui.elements.tableNumberInput.value = "";
      this.ui.elements.actualGuestsInput.value = "";
      this.ui.elements.searchInput.value = "";
      this.selectedGuest = null;
      this.searchState.results = [];
      this.searchState.activeIndex = -1;
      this.ui.clearSearchResults();
      this.refreshUi();
      this.focusSearch();
    }
    async handleNewDay() {
      const confirmed = await this.ui.promptConfirm({
        title: "Start New Day",
        message: "This will download today's Breakfast Report and Accounting Report, then clear check-ins, payments, and unload both XML files.",
        confirmLabel: "Download & New Day",
        danger: true
      });
      if (!confirmed) {
        return;
      }
      try {
        exportTodayReport(this.state.checkIns);
        exportAccountingReport(this.state.paymentList);
      } catch (error) {
        this.ui.renderMessage(`Could not download reports: ${error.message}. New day was cancelled.`, "error");
        return;
      }
      this.state.checkIns = [];
      this.state.paymentList = [];
      this.state.guests = [];
      this.state.rawData = {
        mealPlan: [],
        packageForecast: []
      };
      this.state.filesLoaded = {
        mealPlan: false,
        packageForecast: false
      };
      this.state.fileNames = {
        mealPlan: "",
        packageForecast: ""
      };
      this.state.serviceDate = todayKey();
      this.selectedGuest = null;
      this.searchState.results = [];
      this.searchState.activeIndex = -1;
      if (this.ui.elements.mealPlanFile) {
        this.ui.elements.mealPlanFile.value = "";
      }
      if (this.ui.elements.packageForecastFile) {
        this.ui.elements.packageForecastFile.value = "";
      }
      if (this.ui.elements.tableNumberInput) {
        this.ui.elements.tableNumberInput.value = "";
      }
      if (this.ui.elements.actualGuestsInput) {
        this.ui.elements.actualGuestsInput.value = "";
      }
      if (this.ui.elements.searchInput) {
        this.ui.elements.searchInput.value = "";
      }
      this.ui.clearSearchResults();
      this.ui.renderGuest(null);
      if (this.ui.recentRooms) {
        this.ui.recentRooms = [];
        this.ui.renderRecentSearches();
      }
      this.persistState();
      this.refreshUi();
      this.ui.renderMessage("Reports downloaded. New day started. Please load both XML reports.", "success");
    }
    handleExportToday() {
      try {
        exportTodayReport(this.state.checkIns);
        this.ui.renderMessage("Today's report exported successfully.", "success");
      } catch (error) {
        this.ui.renderMessage(error.message, "error");
      }
    }
    handleExportAccounting() {
      try {
        exportAccountingReport(this.state.paymentList);
        this.ui.renderMessage("Accounting report exported successfully.", "success");
      } catch (error) {
        this.ui.renderMessage(error.message, "error");
      }
    }
    focusSearch() {
      this.ui.elements.searchInput.focus();
    }
  };
  function applyBrandLogo(username) {
    const logoPath = getBrandLogo(username);
    const loginLogo = document.querySelector("#loginBrandLogo");
    const loginFallback = document.querySelector("#loginBrandFallback");
    const appLogo = document.querySelector("#appBrandLogo");
    if (loginLogo && loginFallback) {
      if (logoPath) {
        loginLogo.src = logoPath;
        loginLogo.alt = `${String(username || "").toUpperCase()} logo`;
        loginLogo.hidden = false;
        loginFallback.hidden = true;
      } else {
        loginLogo.hidden = true;
        loginFallback.hidden = false;
      }
    }
    if (appLogo && logoPath) {
      appLogo.src = logoPath;
      appLogo.alt = `${String(username || "").toUpperCase()} logo`;
    }
  }
  function showLoginScreen() {
    const loginScreen = document.querySelector("#loginScreen");
    const appShell = document.querySelector("#appShell");
    const loginError = document.querySelector("#loginError");
    const loginPassword = document.querySelector("#loginPassword");
    const loginUsername = document.querySelector("#loginUsername");
    if (loginScreen) {
      loginScreen.hidden = false;
    }
    if (appShell) {
      appShell.hidden = true;
    }
    if (loginError) {
      loginError.hidden = true;
    }
    if (loginPassword) {
      loginPassword.value = "";
    }
    applyBrandLogo(loginUsername?.value || "");
    loginUsername?.focus();
  }
  function showAppScreen() {
    const loginScreen = document.querySelector("#loginScreen");
    const appShell = document.querySelector("#appShell");
    const userBadge = document.querySelector("#currentUserBadge");
    const mobileUserBadge = document.querySelector("#mobileUserBadge");
    const currentUser = getCurrentUser();
    const userLabel = `User: ${currentUser}`;
    if (loginScreen) {
      loginScreen.hidden = true;
    }
    if (appShell) {
      appShell.hidden = false;
    }
    if (userBadge) {
      userBadge.textContent = userLabel;
    }
    if (mobileUserBadge) {
      mobileUserBadge.textContent = currentUser;
    }
    applyBrandLogo(currentUser);
  }
  function bindLoginForm() {
    const loginForm = document.querySelector("#loginForm");
    const loginError = document.querySelector("#loginError");
    const loginUsername = document.querySelector("#loginUsername");
    if (!loginForm) {
      throw new Error("Missing login form");
    }
    loginUsername?.addEventListener("input", (event) => {
      applyBrandLogo(event.target.value);
    });
    loginForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const username = document.querySelector("#loginUsername")?.value || "";
      const password = document.querySelector("#loginPassword")?.value || "";
      if (login(username, password)) {
        if (loginError) {
          loginError.hidden = true;
        }
        applyBrandLogo(username);
        launchBreakfastApp();
        return;
      }
      if (loginError) {
        loginError.hidden = false;
      }
      document.querySelector("#loginPassword")?.focus();
    });
  }
  function bindLogoutButton() {
    document.querySelector("#logoutButton")?.addEventListener("click", () => {
      logout();
      window.breakfastApp = null;
      showLoginScreen();
    });
  }
  function launchBreakfastApp() {
    showAppScreen();
    if (!window.breakfastApp) {
      const app = new BreakfastApp();
      app.init();
      window.breakfastApp = app;
    }
  }
  function showStartupError(message) {
    const banner = document.querySelector("#startupError");
    if (!banner) {
      return;
    }
    banner.hidden = false;
    banner.textContent = message;
  }
  function startApp() {
    try {
      bindLoginForm();
      bindLogoutButton();
      if (isLoggedIn()) {
        launchBreakfastApp();
      } else {
        showLoginScreen();
      }
    } catch (error) {
      showStartupError(`Application failed to start: ${error.message}`);
    }
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startApp);
  } else {
    startApp();
  }
})();
