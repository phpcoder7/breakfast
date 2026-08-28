import {
  escapeHtml,
  formatDate,
  formatTime,
  listToText,
  normalizeSearchText,
  parseInteger,
  statusMeta
} from "./utils.js";
import { normalizeTable } from "./checkin.js";
import { renderSearchResults } from "./search.js";

const RECENT_LIMIT = 6;

function guestCountForRecord(record) {
  const actual = parseInteger(record.actualGuests, NaN);
  if (Number.isFinite(actual) && actual >= 0) {
    return actual;
  }
  return parseInteger(record.adults, 0) + parseInteger(record.children, 0);
}

function tableCardMarkup(tableNumber, occupants) {
  const occupied = occupants.length > 0;
  const cardClass = occupied
    ? "border-red-100 bg-gradient-to-br from-red-50 to-white text-danger"
    : "border-green-100 bg-gradient-to-br from-green-50 to-white text-success";
  const statusLabel = occupied ? "Occupied" : "Available";
  const partiesLabel =
    occupied
      ? occupants.length === 1
        ? "1 party"
        : `${occupants.length} parties`
      : "Free";

  return `
    <button
      class="card-enter flex min-h-[88px] flex-col items-center justify-center gap-1 rounded-2xl border p-3 text-center transition active:scale-[0.97] ${cardClass}"
      type="button"
      data-table-number="${escapeHtml(tableNumber)}"
      data-table-occupied="${occupied ? "true" : "false"}"
    >
      <span class="text-2xl font-black tracking-tight text-slate-900">${escapeHtml(tableNumber)}</span>
      <span class="text-[10px] font-extrabold uppercase tracking-wider">${statusLabel}</span>
      <span class="text-xs font-bold text-slate-500">${escapeHtml(partiesLabel)}</span>
    </button>
  `;
}

function matchesCheckInFilters(record, tableQuery, guestQuery) {
  const tableNeedle = normalizeSearchText(tableQuery);
  const guestNeedle = normalizeSearchText(guestQuery);

  if (tableNeedle) {
    const tableHaystack = normalizeSearchText(record.tableNumber || "");
    if (!tableHaystack.includes(tableNeedle)) {
      return false;
    }
  }

  if (guestNeedle) {
    const guestHaystack = normalizeSearchText(
      [record.roomNumber, record.guestName].filter(Boolean).join(" ")
    );
    if (!guestHaystack.includes(guestNeedle)) {
      return false;
    }
  }

  return true;
}

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
          Load XML files (Meal Plan or Package Forecast) and search for a room to begin breakfast check-in.
        </p>
      </div>
    `;
  }

  const status = statusMeta(guest.breakfastStatus);
  const statusTone =
    guest.breakfastStatus === "included"
      ? "from-green-50 to-white border-green-100"
      : guest.breakfastStatus === "payment"
        ? "from-red-50 to-white border-red-100"
        : "from-yellow-50 to-white border-yellow-100";

  const mealPlan = guest.mealPlan && guest.mealPlan !== "-" ? guest.mealPlan : "";
  const packages = listToText(guest.products);
  const mealPlanPackage = [mealPlan, packages !== "-" ? packages : ""]
    .filter(Boolean)
    .join(" · ") || "-";

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
  const badgeClass = record.checkedOut
    ? "bg-slate-200 text-slate-600"
    : statusBadgeClass(record.breakfastStatus, record.guestType);
  const badgeLabel = record.checkedOut
    ? "Checked out"
    : statusBadgeLabel(record.breakfastStatus, record.guestType);
  const cardClass = record.checkedOut
    ? "bg-slate-100 opacity-70"
    : "bg-slate-50 hover:bg-white hover:shadow-card";
  const checkOutTime = record.checkedOutAt ? formatTime(record.checkedOutAt) : "";
  const timeLine = record.checkedOut
    ? `${escapeHtml(record.timeLabel || "")}${checkOutTime ? ` · Out ${escapeHtml(checkOutTime)}` : ""}`
    : escapeHtml(record.timeLabel || "");
  const guestCount = guestCountForRecord(record);
  const guestCountMarkup = record.checkedOut
    ? `
        <span class="inline-flex items-center gap-1.5 rounded-xl bg-white/70 px-2.5 py-1.5 text-slate-500">
          <i class="fa-solid fa-user-group text-slate-400"></i>
          <span>Guests ${guestCount}</span>
        </span>`
    : `
        <button
          class="inline-flex items-center gap-1.5 rounded-xl bg-white px-2.5 py-1.5 text-slate-700 transition active:scale-[0.97] hover:bg-blue-50"
          type="button"
          data-add-guests-id="${escapeHtml(record.id)}"
          title="Add late arrivals"
        >
          <i class="fa-solid fa-user-group text-primary"></i>
          <span>Guests ${guestCount}</span>
          <i class="fa-solid fa-plus text-[10px] text-slate-400"></i>
        </button>`;

  return `
    <article class="card-enter cursor-pointer rounded-2xl p-3 transition ${cardClass}" data-checkin-id="${escapeHtml(record.id)}">
      <div class="mb-2 flex items-center justify-between gap-2">
        <span class="text-xs font-bold text-slate-400">${timeLine}</span>
        <span class="inline-flex rounded-full px-2.5 py-1 text-[10px] font-extrabold ${badgeClass}">${escapeHtml(badgeLabel)}</span>
      </div>
      <div class="text-2xl font-black tracking-tight text-slate-900">${escapeHtml(record.roomNumber || "")}</div>
      <div class="mt-1 truncate text-sm font-semibold text-slate-600">${escapeHtml(record.guestName || "")}</div>
      <div class="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-slate-500">
        <button
          class="inline-flex items-center gap-1.5 rounded-xl bg-white px-2.5 py-1.5 text-slate-700 transition active:scale-[0.97] hover:bg-blue-50 ${record.checkedOut ? "pointer-events-none opacity-60" : ""}"
          type="button"
          data-edit-table-id="${escapeHtml(record.id)}"
          title="Change table number"
          ${record.checkedOut ? "disabled" : ""}
        >
          <i class="fa-solid fa-chair text-primary"></i>
          <span>Table ${escapeHtml(String(record.tableNumber || "-"))}</span>
          ${record.checkedOut ? "" : '<i class="fa-solid fa-pen text-[10px] text-slate-400"></i>'}
        </button>
        ${guestCountMarkup}
      </div>
      <div class="mt-2 text-xs font-bold text-slate-500">${escapeHtml(record.guestType || "")}</div>
      ${
        record.checkedOut
          ? ""
          : `
      <div class="mt-3 flex justify-end">
        <button
          class="inline-flex h-10 min-h-touch items-center gap-2 rounded-xl bg-slate-900 px-3 text-xs font-extrabold text-white transition active:scale-[0.97]"
          type="button"
          data-checkout-id="${escapeHtml(record.id)}"
        >
          <i class="fa-solid fa-door-open"></i>
          Check Out
        </button>
      </div>`
      }
    </article>
  `;
}

function paymentCardMarkup(record) {
  const paid = Boolean(record.paid);
  const tableButtonTone = paid ? "text-success" : "text-danger";
  const tableButtonClass = paid
    ? "bg-white text-slate-700 hover:bg-green-50"
    : "bg-white text-slate-700 hover:bg-red-50";

  if (paid) {
    return `
      <article class="card-enter cursor-pointer rounded-2xl border border-green-100 bg-gradient-to-br from-green-50 to-white p-3 opacity-90" data-payment-id="${escapeHtml(record.id)}">
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
    <article class="card-enter cursor-pointer rounded-2xl border border-red-100 bg-gradient-to-br from-red-50 to-white p-3 shadow-press" data-payment-id="${escapeHtml(record.id)}">
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

export class BreakfastUI {
  constructor() {
    this.recentRooms = [];
    this._lastCheckIns = [];
    this._lastPayments = [];
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
      checkinTableSearchInput: document.querySelector("#checkinTableSearchInput"),
      checkinGuestSearchInput: document.querySelector("#checkinGuestSearchInput"),
      checkinTableBody: document.querySelector("#checkinTableBody"),
      paymentTableBody: document.querySelector("#paymentTableBody"),
      tablesGrid: document.querySelector("#tablesGrid"),
      tablesAvailableCount: document.querySelector("#tablesAvailableCount"),
      tablesOccupiedCount: document.querySelector("#tablesOccupiedCount"),
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
      statPaymentRequired: document.querySelector("#statPaymentRequired"),
      statActualGuests: document.querySelector("#statActualGuests"),
      statForecastGuests: document.querySelector("#statForecastGuests"),
      statAdults: document.querySelector("#statAdults"),
      statChildren: document.querySelector("#statChildren"),
      statForecastRooms: document.querySelector("#statForecastRooms"),
      statActiveRooms: document.querySelector("#statActiveRooms"),
      statCheckedOutRooms: document.querySelector("#statCheckedOutRooms"),
      statForecastIncluded: document.querySelector("#statForecastIncluded"),
      statIncludedGuests: document.querySelector("#statIncludedGuests"),
      statPayGuests: document.querySelector("#statPayGuests"),
      reportsDashboardButton: document.querySelector("#reportsDashboardButton"),
      mobileReportsDashboardButton: document.querySelector("#mobileReportsDashboardButton"),
      reportsDashboardModal: document.querySelector("#reportsDashboardModal"),
      reportsDashboardCloseButton: document.querySelector("#reportsDashboardCloseButton"),
      reportSearchInput: document.querySelector("#reportSearchInput"),
      reportBrandFilter: document.querySelector("#reportBrandFilter"),
      reportDateFilter: document.querySelector("#reportDateFilter"),
      reportRefreshButton: document.querySelector("#reportRefreshButton"),
      reportsListContainer: document.querySelector("#reportsListContainer"),
      syncCurrentDayCloudButton: document.querySelector("#syncCurrentDayCloudButton"),
      kpiReportsCount: document.querySelector("#kpiReportsCount"),
      kpiCheckinsCount: document.querySelector("#kpiCheckinsCount"),
      kpiGuestsCount: document.querySelector("#kpiGuestsCount"),
      kpiPaymentsCount: document.querySelector("#kpiPaymentsCount"),
      manageTablesButton: document.querySelector("#manageTablesButton"),
      tableManagerModal: document.querySelector("#tableManagerModal"),
      tableManagerCloseButton: document.querySelector("#tableManagerCloseButton"),
      tableManagerDoneButton: document.querySelector("#tableManagerDoneButton"),
      tableManagerBrandSubtitle: document.querySelector("#tableManagerBrandSubtitle"),
      addTableForm: document.querySelector("#addTableForm"),
      newTableInput: document.querySelector("#newTableInput"),
      tableCountBadge: document.querySelector("#tableCountBadge"),
      tableManagerGrid: document.querySelector("#tableManagerGrid"),
      superAdminBrandWrap: document.querySelector("#superAdminBrandWrap"),
      superAdminBrandSelect: document.querySelector("#superAdminBrandSelect"),
      syncStatusBadge: document.querySelector("#syncStatusBadge"),
      mobileSyncStatusBadge: document.querySelector("#mobileSyncStatusBadge"),
      filterCheckinsAll: document.querySelector("#filterCheckinsAll"),
      filterCheckinsActive: document.querySelector("#filterCheckinsActive"),
      filterCheckinsCheckedOut: document.querySelector("#filterCheckinsCheckedOut"),
      filterCheckinsAllCount: document.querySelector("#filterCheckinsAllCount"),
      filterCheckinsActiveCount: document.querySelector("#filterCheckinsActiveCount"),
      filterCheckinsCheckedOutCount: document.querySelector("#filterCheckinsCheckedOutCount")
    };

    this._checkinStatusFilter = "all";

    this.bindRecentSearchClicks();
    this.bindCheckInSearch();
    this.bindCheckInFilterButtons();
    this.renderRecentSearches();
  }

  bindCheckInFilterButtons() {
    const buttons = [
      this.elements.filterCheckinsAll,
      this.elements.filterCheckinsActive,
      this.elements.filterCheckinsCheckedOut
    ].filter(Boolean);

    buttons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const filter = btn.dataset.checkinFilter || "all";
        this.setCheckInStatusFilter(filter);
      });
    });
  }

  setCheckInStatusFilter(filter) {
    this._checkinStatusFilter = filter;

    const buttons = [
      { el: this.elements.filterCheckinsAll, key: "all" },
      { el: this.elements.filterCheckinsActive, key: "active" },
      { el: this.elements.filterCheckinsCheckedOut, key: "checkedout" }
    ];

    buttons.forEach(({ el, key }) => {
      if (!el) return;
      const isActive = key === filter;
      if (isActive) {
        el.className = "btn-checkin-filter inline-flex h-9 items-center gap-1.5 rounded-xl bg-primary px-3 text-xs font-bold text-white shadow-soft transition active:scale-[0.97]";
      } else {
        el.className = "btn-checkin-filter inline-flex h-9 items-center gap-1.5 rounded-xl bg-slate-100 px-3 text-xs font-bold text-slate-700 transition active:scale-[0.97] hover:bg-slate-200";
      }
    });

    this.filterCheckIns();
  }

  bindCheckInSearch() {
    const rerender = () => this.filterCheckIns();
    this.elements.checkinTableSearchInput?.addEventListener("input", rerender);
    this.elements.checkinGuestSearchInput?.addEventListener("input", rerender);
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
    const mobileElement =
      type === "mealPlan"
        ? document.querySelector("#mobileMealPlanStatus")
        : document.querySelector("#mobilePackageForecastStatus");
    const label = type === "mealPlan" ? "Meal Plan" : "Package Forecast";
    const shortLabel = type === "mealPlan" ? "Meal Plan" : "Forecast";

    const desktopClass = loaded
      ? "file-status is-loaded inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-2 text-xs font-bold"
      : "file-status is-missing inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-2 text-xs font-bold";
    const mobileClass = loaded
      ? "file-status is-loaded rounded-xl px-3 py-2 text-center text-[11px] font-bold"
      : "file-status is-missing rounded-xl px-3 py-2 text-center text-[11px] font-bold";
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
    const mobileElement =
      type === "mealPlan"
        ? document.querySelector("#mobileMealPlanStatus")
        : document.querySelector("#mobilePackageForecastStatus");
    const label = type === "mealPlan" ? "Meal Plan" : "Package Forecast";
    const shortLabel = type === "mealPlan" ? "Meal Plan" : "Forecast";

    if (element) {
      element.className =
        "file-status is-loading inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-2 text-xs font-bold";
      element.textContent = `${label}: Reading...`;
      element.title = fileName;
    }
    if (mobileElement) {
      mobileElement.className = "file-status is-loading rounded-xl px-3 py-2 text-center text-[11px] font-bold";
      mobileElement.textContent = `${shortLabel}: Reading...`;
      mobileElement.title = fileName;
    }
  }

  setSyncStatus({ syncing = false, success = false, error = "" } = {}) {
    const badges = [this.elements.syncStatusBadge, this.elements.mobileSyncStatusBadge].filter(Boolean);
    if (!badges.length) return;

    badges.forEach((badge) => {
      const isDesktop = badge.id === "syncStatusBadge";
      const baseClass = isDesktop
        ? "inline-flex h-3 w-3 shrink-0 items-center justify-center rounded-full transition-colors duration-300"
        : "inline-flex h-2.5 w-2.5 shrink-0 items-center justify-center rounded-full transition-colors duration-300 xl:hidden";

      if (!navigator.onLine) {
        badge.className = `${baseClass} bg-amber-500`;
        badge.title = "Offline mode. Changes saved locally.";
        return;
      }

      if (error) {
        badge.className = `${baseClass} bg-rose-500`;
        badge.title = `Sync notice: ${error}`;
        return;
      }

      // Online & Healthy (Live)
      badge.className = `${baseClass} bg-emerald-500`;
      badge.title = "Connected & Synced (Live)";
    });
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
      this.elements.recentSearches.innerHTML =
        `<span class="rounded-full bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-300">No recent rooms</span>`;
      return;
    }

    this.elements.recentSearches.innerHTML = this.recentRooms
      .map(
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
      )
      .join("");
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

  setRosterGuests(guests = []) {
    this._lastGuests = Array.isArray(guests) ? guests : [];
    this.updateStatistics(this._lastCheckIns || [], this._lastPayments || [], this._lastGuests);
  }

  updateStatistics(checkIns = [], payments = [], guests = this._lastGuests || []) {
    const safeCheckIns = Array.isArray(checkIns) ? checkIns : [];
    const safePayments = Array.isArray(payments) ? payments : [];
    const safeGuests = Array.isArray(guests) ? guests : [];

    // Actual check-in statistics
    const totalCheckIns = safeCheckIns.length;
    const activeRooms = safeCheckIns.filter((r) => !r.checkedOut).length;
    const checkedOutRooms = safeCheckIns.filter((r) => Boolean(r.checkedOut)).length;

    const actualAdults = safeCheckIns.reduce((sum, r) => sum + (Number(r.adults) || 0), 0);
    const actualChildren = safeCheckIns.reduce((sum, r) => sum + (Number(r.children) || 0), 0);
    const actualGuests = safeCheckIns.reduce(
      (sum, r) => sum + (Number(r.actualGuests) || (Number(r.adults) || 0) + (Number(r.children) || 0) || 1),
      0
    );

    const includedCheckIns = safeCheckIns.filter((r) => r.breakfastStatus === "included");
    const includedCount = includedCheckIns.length;
    const includedGuests = includedCheckIns.reduce(
      (sum, r) => sum + (Number(r.actualGuests) || (Number(r.adults) || 0) + (Number(r.children) || 0) || 1),
      0
    );

    const payCheckIns = safeCheckIns.filter(
      (r) =>
        r.breakfastStatus === "payment" ||
        r.guestType === "Apartment" ||
        r.guestType === "Walk-In" ||
        Number(r.extraGuests) > 0
    );
    const payEntries = payCheckIns.length;
    const payGuests =
      safeCheckIns
        .filter((r) => r.breakfastStatus === "payment" || r.guestType === "Apartment" || r.guestType === "Walk-In")
        .reduce((sum, r) => sum + (Number(r.actualGuests) || (Number(r.adults) || 0) + (Number(r.children) || 0) || 1), 0) +
      safeCheckIns.reduce((sum, r) => sum + (Number(r.extraGuests) || 0), 0);

    const unpaid = safePayments.filter((record) => !record.paid).length;

    // Forecast / Roster statistics (from Meal Plan & Package Forecast)
    const forecastRooms = safeGuests.length;
    const forecastAdults = safeGuests.reduce((sum, g) => sum + (Number(g.adults) || 0), 0);
    const forecastChildren = safeGuests.reduce((sum, g) => sum + (Number(g.children) || 0), 0);
    const forecastGuests = forecastAdults + forecastChildren;
    const forecastIncluded = safeGuests.filter((g) => g.breakfastStatus === "included").length;

    // Update Card 1: Total Guests & Breakdown
    if (this.elements.statActualGuests) {
      this.elements.statActualGuests.textContent = String(actualGuests);
    }
    if (this.elements.statForecastGuests) {
      this.elements.statForecastGuests.textContent = String(forecastGuests);
    }
    if (this.elements.statAdults) {
      this.elements.statAdults.textContent = `${actualAdults}/${forecastAdults}`;
    }
    if (this.elements.statChildren) {
      this.elements.statChildren.textContent = `${actualChildren}/${forecastChildren}`;
    }

    // Update Card 2: Check-ins / Rooms
    if (this.elements.statCheckIns) {
      this.elements.statCheckIns.textContent = String(totalCheckIns);
    }
    if (this.elements.statForecastRooms) {
      this.elements.statForecastRooms.textContent = String(forecastRooms);
    }
    if (this.elements.statActiveRooms) {
      this.elements.statActiveRooms.textContent = String(activeRooms);
    }
    if (this.elements.statCheckedOutRooms) {
      this.elements.statCheckedOutRooms.textContent = String(checkedOutRooms);
    }

    // Update Card 3: Included
    if (this.elements.statIncluded) {
      this.elements.statIncluded.textContent = String(includedCount);
    }
    if (this.elements.statForecastIncluded) {
      this.elements.statForecastIncluded.textContent = String(forecastIncluded);
    }
    if (this.elements.statIncludedGuests) {
      this.elements.statIncludedGuests.textContent = String(includedGuests);
    }

    // Update Card 4: Pay & Payments
    if (this.elements.statPaymentRequired) {
      this.elements.statPaymentRequired.textContent = String(payEntries);
    }
    if (this.elements.statPayGuests) {
      this.elements.statPayGuests.textContent = String(payGuests);
    }
    if (this.elements.statPayments) {
      this.elements.statPayments.textContent = String(unpaid);
    }
  }

  renderCheckIns(records, guests = this._lastGuests || []) {
    this._lastCheckIns = records;
    if (guests) {
      this._lastGuests = guests;
    }
    if (!records.length) {
      if (this.elements.checkinTableSearchInput) {
        this.elements.checkinTableSearchInput.value = "";
      }
      if (this.elements.checkinGuestSearchInput) {
        this.elements.checkinGuestSearchInput.value = "";
      }
    }

    const totalCount = records.length;
    const activeCount = records.filter((r) => !r.checkedOut).length;
    const checkedOutCount = records.filter((r) => Boolean(r.checkedOut)).length;

    if (this.elements.filterCheckinsAllCount) {
      this.elements.filterCheckinsAllCount.textContent = String(totalCount);
    }
    if (this.elements.filterCheckinsActiveCount) {
      this.elements.filterCheckinsActiveCount.textContent = String(activeCount);
    }
    if (this.elements.filterCheckinsCheckedOutCount) {
      this.elements.filterCheckinsCheckedOutCount.textContent = String(checkedOutCount);
    }

    this.filterCheckIns();
    this.updateStatistics(records, this._lastPayments || [], this._lastGuests || []);
  }

  filterCheckIns() {
    const records = this._lastCheckIns || [];
    if (!this.elements.checkinTableBody) {
      return;
    }

    if (!records.length) {
      this.elements.checkinTableBody.innerHTML = emptyCardsMarkup("No check-ins recorded yet.");
      return;
    }

    const tableQuery = this.elements.checkinTableSearchInput?.value || "";
    const guestQuery = this.elements.checkinGuestSearchInput?.value || "";
    const statusFilter = this._checkinStatusFilter || "all";

    const filtered = records
      .filter((record) => {
        if (statusFilter === "active" && record.checkedOut) return false;
        if (statusFilter === "checkedout" && !record.checkedOut) return false;
        return matchesCheckInFilters(record, tableQuery, guestQuery);
      })
      .sort((a, b) => {
        // Priority 1: In restaurant (checkedOut = false) first, Checked Out (checkedOut = true) last
        const aCheckedOut = a.checkedOut ? 1 : 0;
        const bCheckedOut = b.checkedOut ? 1 : 0;
        if (aCheckedOut !== bCheckedOut) {
          return aCheckedOut - bCheckedOut;
        }
        // Priority 2: Newest timestamp first within each group
        return String(b.timestamp || "").localeCompare(String(a.timestamp || ""));
      });

    this.elements.checkinTableBody.innerHTML = filtered.length
      ? filtered.map((record) => checkInCardMarkup(record)).join("")
      : emptyCardsMarkup("No matching check-ins.");
  }

  renderPayments(records, guests = this._lastGuests || []) {
    this._lastPayments = records;
    if (guests) {
      this._lastGuests = guests;
    }
    this.elements.paymentTableBody.innerHTML = records.length
      ? records.map((record) => paymentCardMarkup(record)).join("")
      : emptyCardsMarkup("No payment items queued.");
    this.updateStatistics(this._lastCheckIns || [], records, this._lastGuests || []);
  }

  renderTables(tableNumbers, checkIns = []) {
    if (!this.elements.tablesGrid) {
      return;
    }

    if (!tableNumbers.length) {
      this.elements.tablesGrid.innerHTML = emptyCardsMarkup("No restaurant tables configured for this property.");
      if (this.elements.tablesAvailableCount) {
        this.elements.tablesAvailableCount.textContent = "0";
      }
      if (this.elements.tablesOccupiedCount) {
        this.elements.tablesOccupiedCount.textContent = "0";
      }
      return;
    }

    const activeByTable = new Map();
    checkIns
      .filter((record) => record.checkedOut !== true)
      .forEach((record) => {
        const key = normalizeTable(record.tableNumber);
        if (!key) {
          return;
        }
        if (!activeByTable.has(key)) {
          activeByTable.set(key, []);
        }
        activeByTable.get(key).push(record);
      });

    let available = 0;
    let occupied = 0;
    this.elements.tablesGrid.innerHTML = tableNumbers
      .map((tableNumber) => {
        const occupants = activeByTable.get(normalizeTable(tableNumber)) || [];
        if (occupants.length) {
          occupied += 1;
        } else {
          available += 1;
        }
        return tableCardMarkup(tableNumber, occupants);
      })
      .join("");

    if (this.elements.tablesAvailableCount) {
      this.elements.tablesAvailableCount.textContent = String(available);
    }
    if (this.elements.tablesOccupiedCount) {
      this.elements.tablesOccupiedCount.textContent = String(occupied);
    }
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
    this.elements.searchInput.disabled = false;
    this.elements.tableNumberInput.disabled = false;
    this.elements.actualGuestsInput.disabled = false;
    this.elements.checkInButton.disabled = !enabled;
  }

  setExportState(hasCheckIns) {
    if (this.elements.exportTodayButton) {
      this.elements.exportTodayButton.disabled = !hasCheckIns;
    }

    const mobileExportToday = document.querySelector("#mobileExportTodayButton");
    if (mobileExportToday) {
      mobileExportToday.disabled = !hasCheckIns;
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
      workspace.classList.remove(
        "mobile-view-search",
        "mobile-view-checkin",
        "mobile-view-checkins",
        "mobile-view-payments",
        "mobile-view-tables"
      );
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

  promptChoice({ title, message, choices = [] }) {
    return new Promise((resolve) => {
      this.openModal({
        title,
        body: `<p class="text-base leading-relaxed">${escapeHtml(message)}</p>`,
        actions: choices.map((choice) => ({
          label: choice.label,
          variant: choice.variant || "btn-secondary",
          onClick: () => {
            this.closeModal();
            resolve(choice.id);
          }
        }))
      });
    });
  }

  promptForm({ title, fields, submitLabel = "Save", message = "" }) {
    return new Promise((resolve) => {
      const messageHtml = message
        ? `<p class="mb-4 text-sm font-semibold leading-relaxed text-slate-600">${escapeHtml(message)}</p>`
        : "";
      const body = `
        ${messageHtml}
        <form id="dynamicModalForm" class="modal-form">
          ${fields
            .map((field) => {
              if (field.type === "select") {
                return `
                  <label class="form-field">
                    <span>${escapeHtml(field.label)}</span>
                    <select name="${escapeHtml(field.name)}" ${field.required ? "required" : ""}>
                      ${(field.options || [])
                        .map(
                          (option) => `
                            <option value="${escapeHtml(option.value)}" ${
                              String(option.value) === String(field.value || "") ? "selected" : ""
                            }>
                              ${escapeHtml(option.label)}
                            </option>
                          `
                        )
                        .join("")}
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
                    ${field.type === "number" ? 'inputmode="numeric" pattern="[0-9]*"' : ""}
                    ${field.min !== undefined ? `min="${escapeHtml(String(field.min))}"` : ""}
                    ${field.required ? "required" : ""}
                    autocomplete="off"
                  />
                </label>
              `;
            })
            .join("")}
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

  openReportsDashboard() {
    if (this.elements.reportsDashboardModal) {
      this.elements.reportsDashboardModal.hidden = false;
      this.elements.reportsDashboardModal.setAttribute("aria-hidden", "false");
    }
  }

  closeReportsDashboard() {
    if (this.elements.reportsDashboardModal) {
      this.elements.reportsDashboardModal.hidden = true;
      this.elements.reportsDashboardModal.setAttribute("aria-hidden", "true");
    }
  }

  renderReportsLoading() {
    if (!this.elements.reportsListContainer) return;
    this.elements.reportsListContainer.innerHTML = `
      <div class="flex h-48 flex-col items-center justify-center text-slate-400">
        <i class="fa-solid fa-spinner fa-spin text-3xl text-primary"></i>
        <span class="mt-3 text-sm font-bold">Fetching reports from Cloudflare D1...</span>
      </div>
    `;
  }

  renderReportsError(message) {
    if (!this.elements.reportsListContainer) return;
    this.elements.reportsListContainer.innerHTML = `
      <div class="flex h-48 flex-col items-center justify-center text-center p-4">
        <div class="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-danger mb-2">
          <i class="fa-solid fa-circle-exclamation text-2xl"></i>
        </div>
        <div class="text-sm font-bold text-slate-800">Unable to load cloud reports</div>
        <div class="mt-1 text-xs text-slate-500 max-w-sm">${escapeHtml(message)}</div>
      </div>
    `;
  }

  updateReportsKpi(reports = []) {
    let totalCheckins = 0;
    let totalGuests = 0;
    let totalPayments = 0;

    reports.forEach((r) => {
      totalCheckins += Number(r.totalCheckins) || 0;
      totalGuests += Number(r.totalGuests) || 0;
      totalPayments += Number(r.totalPayments) || 0;
    });

    if (this.elements.kpiReportsCount) this.elements.kpiReportsCount.textContent = String(reports.length);
    if (this.elements.kpiCheckinsCount) this.elements.kpiCheckinsCount.textContent = String(totalCheckins);
    if (this.elements.kpiGuestsCount) this.elements.kpiGuestsCount.textContent = String(totalGuests);
    if (this.elements.kpiPaymentsCount) this.elements.kpiPaymentsCount.textContent = String(totalPayments);
  }

  renderReportsList(reports = [], { query = "", onExportReport, onInspectReport }) {
    if (!this.elements.reportsListContainer) return;

    this.updateReportsKpi(reports);

    if (reports.length === 0) {
      this.elements.reportsListContainer.innerHTML = `
        <div class="flex h-48 flex-col items-center justify-center text-center p-4 text-slate-400">
          <i class="fa-solid fa-folder-open text-3xl mb-2 text-slate-300"></i>
          <span class="text-sm font-bold text-slate-600">No reports found</span>
          <span class="text-xs text-slate-400 mt-0.5">${query ? `No records matched "${escapeHtml(query)}"` : "Try adjusting your date or search filters."}</span>
        </div>
      `;
      return;
    }

    const hasQuery = Boolean(query && query.trim());

    const cardsHtml = reports
      .map((report) => {
        const brandBadgeClass = report.brand === "KCA" ? "bg-amber-100 text-amber-800" : "bg-blue-100 text-blue-800";
        const isAutoExpanded = hasQuery;
        return `
          <div class="report-card rounded-2xl border border-slate-200/80 bg-slate-50/50 p-3.5 transition hover:bg-white hover:shadow-sm sm:p-4" data-report-id="${escapeHtml(report.id)}">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div class="flex items-center gap-2.5">
                <span class="inline-flex rounded-lg px-2 py-0.5 text-xs font-black uppercase ${brandBadgeClass}">
                  ${escapeHtml(report.brand)}
                </span>
                <span class="text-sm font-black text-slate-900 sm:text-base">
                  ${escapeHtml(report.serviceDate)}
                </span>
                ${hasQuery ? `<span class="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-black text-primary"><i class="fa-solid fa-magnifying-glass text-[9px]"></i> Matching "${escapeHtml(query)}"</span>` : ""}
              </div>

              <!-- Action Buttons -->
              <div class="flex items-center gap-1.5 sm:gap-2">
                <button
                  type="button"
                  class="btn-export-breakfast inline-flex h-9 items-center gap-1.5 rounded-xl bg-green-50 px-2.5 text-xs font-bold text-success transition active:scale-[0.96] hover:bg-green-100 sm:h-10 sm:px-3 sm:text-xs"
                  data-date="${escapeHtml(report.serviceDate)}"
                  data-brand="${escapeHtml(report.brand)}"
                  title="Download Breakfast Report"
                >
                  <i class="fa-solid fa-file-excel"></i>
                  <span>Report</span>
                </button>
                <button
                  type="button"
                  class="btn-inspect-report inline-flex h-9 items-center justify-center rounded-xl bg-slate-200/70 px-2.5 text-xs font-bold text-slate-700 transition active:scale-[0.96] hover:bg-slate-300 sm:h-10 sm:px-3"
                  data-date="${escapeHtml(report.serviceDate)}"
                  data-brand="${escapeHtml(report.brand)}"
                  title="Inspect Check-ins"
                >
                  <i class="fa-solid ${isAutoExpanded ? "fa-chevron-up" : "fa-chevron-down"} text-xs"></i>
                </button>
              </div>
            </div>

            <!-- Stats Row -->
            <div class="mt-3 grid grid-cols-3 gap-2 text-xs font-semibold">
              <div class="rounded-xl bg-white px-2.5 py-1.5 shadow-2xs border border-slate-100">
                <span class="text-slate-400">Check-ins:</span>
                <span class="font-bold text-slate-800 ml-1">${report.totalCheckins}</span>
              </div>
              <div class="rounded-xl bg-white px-2.5 py-1.5 shadow-2xs border border-slate-100">
                <span class="text-slate-400">Guests:</span>
                <span class="font-bold text-slate-800 ml-1">${report.totalGuests}</span>
              </div>
              <div class="rounded-xl bg-white px-2.5 py-1.5 shadow-2xs border border-slate-100">
                <span class="text-slate-400">Payments:</span>
                <span class="font-bold text-purple-700 ml-1">${report.totalPayments}</span>
              </div>
            </div>

            <!-- Expanded Details Slot -->
            <div class="report-details-panel mt-3 rounded-xl bg-white p-3 border border-slate-200" ${isAutoExpanded ? "" : "hidden"}></div>
          </div>
        `;
      })
      .join("");

    this.elements.reportsListContainer.innerHTML = cardsHtml;

    // Attach click handlers
    this.elements.reportsListContainer.querySelectorAll(".btn-export-breakfast").forEach((btn) => {
      btn.addEventListener("click", () => {
        onExportReport(btn.dataset.date, btn.dataset.brand);
      });
    });

    this.elements.reportsListContainer.querySelectorAll(".btn-inspect-report").forEach((btn) => {
      btn.addEventListener("click", () => {
        const card = btn.closest(".report-card");
        const panel = card?.querySelector(".report-details-panel");
        const icon = btn.querySelector("i");
        if (panel) {
          const isHidden = panel.hidden;
          panel.hidden = !isHidden;
          if (icon) {
            icon.className = isHidden ? "fa-solid fa-chevron-up text-xs" : "fa-solid fa-chevron-down text-xs";
          }
          if (isHidden) {
            panel.dataset.loaded = "true";
            onInspectReport(btn.dataset.date, btn.dataset.brand, panel, query);
          }
        }
      });
    });

    // If query is provided, auto-load the inspected tables
    if (hasQuery) {
      this.elements.reportsListContainer.querySelectorAll(".report-card").forEach((card) => {
        const btn = card.querySelector(".btn-inspect-report");
        const panel = card.querySelector(".report-details-panel");
        if (btn && panel) {
          panel.dataset.loaded = "true";
          onInspectReport(btn.dataset.date, btn.dataset.brand, panel, query);
        }
      });
    }
  }

  openTableManager(brand, tables = [], { onEditTable, onDeleteTable }) {
    if (!this.elements.tableManagerModal) return;
    if (this.elements.tableManagerBrandSubtitle) {
      this.elements.tableManagerBrandSubtitle.textContent = `Property: ${brand} (Dynamic Cloudflare D1)`;
    }
    if (this.elements.tableCountBadge) {
      this.elements.tableCountBadge.textContent = String(tables.length);
    }
    this.renderTableManagerGrid(brand, tables, { onEditTable, onDeleteTable });
    this.elements.tableManagerModal.hidden = false;
    this.elements.tableManagerModal.setAttribute("aria-hidden", "false");
  }

  closeTableManager() {
    if (this.elements.tableManagerModal) {
      this.elements.tableManagerModal.hidden = true;
      this.elements.tableManagerModal.setAttribute("aria-hidden", "true");
    }
  }

  renderTableManagerGrid(brand, tables = [], { onEditTable, onDeleteTable }) {
    if (!this.elements.tableManagerGrid) return;
    if (this.elements.tableCountBadge) {
      this.elements.tableCountBadge.textContent = String(tables.length);
    }

    if (tables.length === 0) {
      this.elements.tableManagerGrid.innerHTML = `
        <div class="col-span-full py-8 text-center text-xs font-bold text-slate-400">
          No tables configured yet for ${escapeHtml(brand)}.
        </div>
      `;
      return;
    }

    this.elements.tableManagerGrid.innerHTML = tables
      .map(
        (t) => `
        <div class="group relative flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white p-2.5 shadow-2xs transition hover:border-primary hover:shadow-sm" data-table-number="${escapeHtml(t)}">
          <span class="text-base font-black text-slate-900">${escapeHtml(t)}</span>
          <div class="mt-1 flex items-center gap-1 opacity-80 group-hover:opacity-100">
            <button
              type="button"
              class="btn-edit-table-row flex h-6 w-6 items-center justify-center rounded-lg bg-slate-100 text-slate-600 transition hover:bg-blue-50 hover:text-primary"
              title="Edit Table ${escapeHtml(t)}"
              data-table="${escapeHtml(t)}"
            >
              <i class="fa-solid fa-pen text-[10px]"></i>
            </button>
            <button
              type="button"
              class="btn-delete-table-row flex h-6 w-6 items-center justify-center rounded-lg bg-slate-100 text-slate-600 transition hover:bg-red-50 hover:text-danger"
              title="Delete Table ${escapeHtml(t)}"
              data-table="${escapeHtml(t)}"
            >
              <i class="fa-solid fa-trash text-[10px]"></i>
            </button>
          </div>
        </div>
      `
      )
      .join("");

    this.elements.tableManagerGrid.querySelectorAll(".btn-edit-table-row").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        onEditTable(btn.dataset.table);
      });
    });

    this.elements.tableManagerGrid.querySelectorAll(".btn-delete-table-row").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        onDeleteTable(btn.dataset.table);
      });
    });
  }
}
