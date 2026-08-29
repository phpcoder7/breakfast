import {
  applyLateArrivals,
  checkEntitlement,
  checkOutCheckIn,
  createApartmentCheckIn,
  createHotelCheckIn,
  createManualGuest,
  createWalkInCheckIn,
  guestFromCheckInRecord,
  findActiveCheckInsByTable,
  findHotelCheckInByRoom,
  getExtraGuests,
  normalizeTable,
  updateCheckInTableNumber
} from "./checkin.js";
import { exportTodayReport } from "./export.js";
import { fetchFullReport, fetchReportsFromCloud, saveDailyReportToCloud } from "./cloudSync.js";
import { mergeGuestData } from "./mergeData.js";
import { markPaymentPaid, syncPaymentList } from "./payment.js";
import { exactRoomMatch, globalSearchIndex, searchGuests } from "./search.js";
import { BreakfastUI } from "./ui.js";
import {
  canManageBrand,
  getActiveBrand,
  getBrandLogo,
  getCurrentUser,
  getCurrentUserProfile,
  isLoggedIn,
  isSuperAdmin,
  login,
  logout,
  setActiveBrand
} from "./auth.js";
import {
  addTableToCloud,
  deleteTableFromCloud,
  getTablesForUser,
  isValidTableNumber,
  syncTablesFromCloud,
  updateTableInCloud
} from "./tables.js";
import {
  BREAKFAST_STATUS,
  clearStoredState,
  escapeHtml,
  formatTime,
  normalizeRoom,
  parseInteger,
  readStoredState,
  statusMeta,
  todayKey,
  writeStoredState
} from "./utils.js";
import { parseMealPlanXml, parsePackageForecastXml } from "./xmlParser.js";
import { RealtimeSyncEngine } from "./realtimeSync.js";
import { putCheckIn, clearDailyDb } from "./offlineDb.js";

class BreakfastApp {
  constructor() {
    this.ui = new BreakfastUI();
    this.state = this.createInitialState();
    this.searchState = {
      results: [],
      activeIndex: -1
    };
    this.selectedGuest = null;
    this.realtimeSync = new RealtimeSyncEngine({
      getBrand: () => getActiveBrand(),
      getServiceDate: () => this.state.serviceDate || todayKey(),
      getRoster: () => ({
        guests: this.state.guests,
        fileNames: this.state.fileNames,
        filesLoaded: this.state.filesLoaded
      }),
      onRemoteUpdate: (data) => this.handleRemoteSyncUpdate(data),
      onSyncStatusChange: (status) => this.ui.setSyncStatus(status)
    });
  }

  createInitialState() {
    const brand = getActiveBrand();
    const stored = readStoredState(brand);
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
    if (this.state.guests && this.state.guests.length) {
      globalSearchIndex.buildIndex(this.state.guests);
    }
    this.refreshUi();
    if (window.matchMedia("(max-width: 767px)").matches) {
      this.ui.setMobileView("search");
    }
    this.realtimeSync.start();
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

    // Past Reports & Cloud Archive Dashboard Events
    elements.reportsDashboardButton?.addEventListener("click", () => this.handleOpenReportsDashboard());
    elements.mobileReportsDashboardButton?.addEventListener("click", () => this.handleOpenReportsDashboard());
    elements.reportsDashboardCloseButton?.addEventListener("click", () => this.ui.closeReportsDashboard());
    elements.reportRefreshButton?.addEventListener("click", () => this.loadReportsDashboardData());
    elements.reportBrandFilter?.addEventListener("change", () => this.loadReportsDashboardData());
    elements.reportDateFilter?.addEventListener("change", () => this.loadReportsDashboardData());
    elements.reportSearchInput?.addEventListener("input", () => this.debounceLoadReports());
    // Table Management Events
    elements.manageTablesButton?.addEventListener("click", () => this.handleOpenTableManager());
    elements.tableManagerCloseButton?.addEventListener("click", () => this.ui.closeTableManager());
    elements.tableManagerDoneButton?.addEventListener("click", () => this.ui.closeTableManager());
    elements.addTableForm?.addEventListener("submit", (e) => this.handleAddTableSubmit(e));
    elements.superAdminBrandSelect?.addEventListener("change", (e) => this.handleSuperAdminBrandChange(e));
    elements.mobileSuperAdminBrandSelect?.addEventListener("change", (e) => this.handleSuperAdminBrandChange(e));
    elements.mobileToolsBrandSelect?.addEventListener("change", (e) => this.handleSuperAdminBrandChange(e));
    elements.paymentTableBody?.addEventListener("click", (event) => {
      const editTableButton = event.target.closest("[data-edit-table-id]");
      if (editTableButton) {
        this.handleChangeTable(editTableButton.dataset.editTableId);
        return;
      }

      const payButton = event.target.closest("[data-pay-id]");
      if (payButton) {
        this.handleMarkPaid(payButton.dataset.payId);
        return;
      }

      const card = event.target.closest("[data-payment-id]");
      if (card) {
        this.showGuestFromCard(card.dataset.paymentId);
      }
    });
    elements.checkinTableBody?.addEventListener("click", (event) => {
      const editTableButton = event.target.closest("[data-edit-table-id]");
      if (editTableButton) {
        this.handleChangeTable(editTableButton.dataset.editTableId);
        return;
      }

      const addGuestsButton = event.target.closest("[data-add-guests-id]");
      if (addGuestsButton) {
        this.handleAddGuestsFromCard(addGuestsButton.dataset.addGuestsId);
        return;
      }

      const checkoutButton = event.target.closest("[data-checkout-id]");
      if (checkoutButton) {
        this.handleCheckOut(checkoutButton.dataset.checkoutId);
        return;
      }

      const card = event.target.closest("[data-checkin-id]");
      if (card) {
        this.showGuestFromCard(card.dataset.checkinId);
      }
    });
    elements.guestPanel?.addEventListener("click", (event) => {
      if (event.target.closest("#correctStatusButton")) {
        this.handleCorrectStatus();
      }
    });
    elements.tablesGrid?.addEventListener("click", (event) => {
      const tableButton = event.target.closest("[data-table-number]");
      if (!tableButton) {
        return;
      }
      this.handleTableBoardClick(
        tableButton.dataset.tableNumber,
        tableButton.dataset.tableOccupied === "true"
      );
    });
    document.querySelector("#modalCloseButton").addEventListener("click", () => {
      this.ui.closeModal();
      this.focusSearch();
    });

    elements.tabButtons.forEach((button) => {
      button.addEventListener("click", () => this.ui.activateTab(button.dataset.tabTarget));
    });

    elements.mobileToolsToggle?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.ui.toggleMobileTools();
    });

    document.querySelector('[data-mobile-view="search"]')?.addEventListener("click", () => {
      this.ui.closeMobileTools();
      this.ui.setMobileView("search");
      this.focusSearch();
    });

    document.querySelector("#mobileNewDayButton")?.addEventListener("click", () => {
      this.ui.closeMobileTools();
      this.handleNewDay();
    });
    document.querySelector("#mobileLogoutButton")?.addEventListener("click", () => {
      this.ui.closeMobileTools();
      document.querySelector("#logoutButton")?.click();
    });
    document.querySelector("#mobileExportTodayButton")?.addEventListener("click", () => {
      this.ui.closeMobileTools();
      this.handleExportToday();
    });
    document.querySelector("#mobileReportsDashboardButton")?.addEventListener("click", () => {
      this.ui.closeMobileTools();
      this.handleOpenReportsDashboard();
    });

    // Close mobile tools when clicking outside
    document.addEventListener("click", (event) => {
      const panel = document.querySelector("#mobileToolsPanel");
      const toggle = document.querySelector("#mobileToolsToggle");
      if (panel && !panel.hidden && toggle && !toggle.contains(event.target) && !panel.contains(event.target)) {
        this.ui.closeMobileTools();
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        if (!this.ui.elements.tableManagerModal?.hidden) {
          this.ui.closeTableManager();
          return;
        }
        if (!this.ui.elements.reportsDashboardModal?.hidden) {
          this.ui.closeReportsDashboard();
          return;
        }
        if (!this.ui.elements.modal?.hidden) {
          this.ui.closeModal();
          this.focusSearch();
        }
      }
    });
  }

  bindRequiredElement(element, name) {
    if (!element) {
      throw new Error(`Missing interface element: ${name}`);
    }
  }

  persistState() {
    writeStoredState(this.state, getActiveBrand());
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
      timeLabel: record.timestamp
        ? new Date(record.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
        : ""
    }));

    this.ui.setRosterGuests(this.state.guests || []);
    this.ui.renderCheckIns(checkInsForTable, this.state.guests || []);
    this.ui.renderPayments(paymentForTable, this.state.guests || []);
    this.ui.renderTables(getTablesForUser(getActiveBrand()), this.state.checkIns);
    const filesReady = this.state.filesLoaded.mealPlan || this.state.filesLoaded.packageForecast || (this.state.guests && this.state.guests.length > 0);
    const manualReady = Boolean(this.selectedGuest?.statusOverride);
    const guestReady = Boolean(this.selectedGuest);
    this.ui.setCheckInEnabled((filesReady && guestReady) || manualReady);
    this.ui.setExportState(Boolean(this.state.checkIns.length));
    const activeTab = this.ui.elements.tabButtons.find((button) => button.classList.contains("is-active"))?.dataset.tabTarget || "checkin";
    this.ui.activateTab(activeTab);
  }

  handleRemoteSyncUpdate(remoteData) {
    if (!remoteData) {
      return;
    }

    let stateChanged = false;
    const existingMap = new Map(this.state.checkIns.map((c) => [c.id, c]));

    if (Array.isArray(remoteData.checkins) && remoteData.checkins.length > 0) {
      for (const remote of remoteData.checkins) {
        const local = existingMap.get(remote.id);
        if (!local) {
          const mappedRecord = {
            id: remote.id,
            roomNumber: remote.room_number,
            displayLocation: remote.room_number,
            guestName: remote.guest_name,
            tableNumber: remote.table_number,
            adults: Number(remote.adults) || 0,
            children: Number(remote.children) || 0,
            actualGuests: Number(remote.actual_guests) || (Number(remote.adults) || 0) + (Number(remote.children) || 0) || 1,
            extraGuests: Number(remote.extra_guests) || 0,
            entitlementExceeded: Boolean(remote.entitlement_exceeded),
            guestType: remote.guest_type || "Hotel",
            mealPlan: remote.meal_plan || "",
            products: remote.products || "",
            breakfastStatus: remote.breakfast_status || "included",
            statusOverride: Boolean(remote.status_override),
            checkedOut: Boolean(remote.checked_out),
            checkedOutAt: remote.checked_out_at,
            paid: Boolean(remote.paid),
            paidAt: remote.paid_at,
            timestamp: remote.timestamp,
            timeLabel: remote.timestamp ? formatTime(remote.timestamp) : ""
          };
          existingMap.set(remote.id, mappedRecord);
          putCheckIn(mappedRecord, getActiveBrand(), this.state.serviceDate).catch(() => {});
          stateChanged = true;
        } else {
          if (!local.timeLabel && local.timestamp) {
            local.timeLabel = formatTime(local.timestamp);
          }
          const isDiff =
            Boolean(remote.checked_out) !== Boolean(local.checkedOut) ||
            Boolean(remote.paid) !== Boolean(local.paid) ||
            String(remote.table_number) !== String(local.tableNumber) ||
            Number(remote.actual_guests) !== Number(local.actualGuests) ||
            Number(remote.extra_guests) !== Number(local.extraGuests) ||
            remote.checked_out_at !== local.checkedOutAt ||
            remote.paid_at !== local.paidAt;

          if (isDiff) {
            local.checkedOut = Boolean(remote.checked_out);
            local.checkedOutAt = remote.checked_out_at;
            local.paid = Boolean(remote.paid);
            local.paidAt = remote.paid_at;
            local.tableNumber = remote.table_number;
            local.actualGuests = Number(remote.actual_guests) || local.actualGuests;
            local.extraGuests = Number(remote.extra_guests) || 0;
            local.entitlementExceeded = Boolean(remote.entitlement_exceeded);
            putCheckIn(local, getActiveBrand(), this.state.serviceDate).catch(() => {});
            stateChanged = true;
          }
        }
      }
    }

    // Shared Guest Roster Sync across mobile/tablets
    if (remoteData.roster && Array.isArray(remoteData.roster.guests) && remoteData.roster.guests.length > 0) {
      const hasLocalGuests = Array.isArray(this.state.guests) && this.state.guests.length > 0;
      const fileStatusMismatch =
        Boolean(this.state.filesLoaded?.packageForecast) !== Boolean(remoteData.roster.filesLoaded?.packageForecast) ||
        Boolean(this.state.filesLoaded?.mealPlan) !== Boolean(remoteData.roster.filesLoaded?.mealPlan);

      if (!hasLocalGuests || this.state.guests.length !== remoteData.roster.guests.length || fileStatusMismatch) {
        this.state.guests = remoteData.roster.guests;
        this.state.fileNames = remoteData.roster.fileNames || this.state.fileNames;
        this.state.filesLoaded = remoteData.roster.filesLoaded || {
          mealPlan: Boolean(this.state.fileNames?.mealPlan),
          packageForecast: Boolean(this.state.fileNames?.packageForecast)
        };
        globalSearchIndex.buildIndex(this.state.guests);
        this.persistState();
        stateChanged = true;
        if (!hasLocalGuests) {
          this.ui.renderMessage(`Loaded ${this.state.guests.length} hotel guests from cloud sync. Ready for search & check-in.`, "success");
        }
      }
    }

    if (stateChanged) {
      this.state.checkIns = Array.from(existingMap.values()).sort((a, b) =>
        String(b.timestamp).localeCompare(String(a.timestamp))
      );
      this.state.paymentList = syncPaymentList(this.state.checkIns);
      this.persistState();
      this.refreshUi();
    }
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

      this.state.guests = mergeGuestData(
        this.state.rawData.mealPlan || [],
        this.state.rawData.packageForecast || []
      );
      globalSearchIndex.buildIndex(this.state.guests);

      if (this.state.filesLoaded.mealPlan && this.state.filesLoaded.packageForecast) {
        this.ui.renderMessage(`Loaded ${this.state.guests.length} hotel guests for today's breakfast service (Both files loaded).`, "success");
      } else if (this.state.filesLoaded.mealPlan) {
        this.ui.renderMessage(`Loaded ${this.state.guests.length} guests from Meal Plan. Ready for check-in (Package Forecast is optional).`, "success");
      } else {
        this.ui.renderMessage(`Loaded ${this.state.guests.length} guests from Package Forecast. Ready for check-in (Meal Plan is optional).`, "success");
      }

      this.persistState();
      this.realtimeSync?.syncRoster(this.state.guests, this.state.fileNames, this.state.filesLoaded);
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
      this.ui.renderMessage("Please load an XML report (Meal Plan or Package Forecast) before searching.", "warning");
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
      this.searchState.activeIndex =
        (this.searchState.activeIndex - 1 + this.searchState.results.length) % this.searchState.results.length;
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
    this.refreshUi();
    this.ui.clearSearchResults();
    this.ui.activateTab("checkin");
    this.ui.elements.tableNumberInput.focus();
  }

  showGuestFromCard(checkInId) {
    if (!checkInId) {
      return;
    }

    const checkIn = this.state.checkIns.find((record) => record.id === checkInId);
    if (!checkIn) {
      return;
    }

    const guest = guestFromCheckInRecord(checkIn, this.state.guests);
    this.selectedGuest = guest;
    this.refreshUi();
    this.ui.setMobileView("search");
  }

  handleTableBoardClick(tableNumber, occupied) {
    if (!tableNumber) {
      return;
    }

    if (!occupied) {
      this.ui.activateTab("checkin");
      this.ui.elements.tableNumberInput.value = tableNumber;
      this.focusSearch();
      this.ui.renderMessage(`Table ${tableNumber} selected. Search a room to check in.`, "info");
      return;
    }

    const occupants = findActiveCheckInsByTable(this.state.checkIns, tableNumber);
    const body = occupants.length
      ? `
        <div class="space-y-3">
          ${occupants
            .map((record) => {
              const guests =
                parseInteger(record.actualGuests, NaN) >= 0
                  ? parseInteger(record.actualGuests, 0)
                  : parseInteger(record.adults, 0) + parseInteger(record.children, 0);
              const inTime = record.timestamp ? formatTime(record.timestamp) : (record.timeLabel || "");
              return `
                <div class="rounded-2xl border border-slate-200 bg-slate-50 p-3.5">
                  <div class="flex items-center justify-between gap-2">
                    <div class="text-lg font-black text-slate-900">${escapeHtml(record.roomNumber || record.guestType || "Guest")}</div>
                    <span class="text-xs font-semibold text-slate-400">${inTime ? `In: ${escapeHtml(inTime)}` : ""}</span>
                  </div>
                  <div class="mt-1 text-sm font-semibold text-slate-700">${escapeHtml(record.guestName || "-")}</div>
                  <div class="mt-1 text-xs font-bold text-slate-500">Guests: ${guests}</div>
                  <div class="mt-3 flex justify-end">
                    <button
                      type="button"
                      class="btn-table-checkout-item inline-flex h-10 items-center gap-1.5 rounded-xl bg-red-600 px-3.5 text-xs font-bold text-white shadow-soft transition active:scale-[0.97] hover:bg-red-700"
                      data-table-checkout-id="${escapeHtml(record.id)}"
                    >
                      <i class="fa-solid fa-arrow-right-from-bracket"></i>
                      <span>Check Out & Free Table</span>
                    </button>
                  </div>
                </div>
              `;
            })
            .join("")}
        </div>
      `
      : `<p class="text-base leading-relaxed">No active parties on this table.</p>`;

    this.ui.openModal({
      title: `Table ${tableNumber}`,
      body,
      actions: [
        {
          label: "Close",
          variant: "btn-secondary",
          onClick: () => this.ui.closeModal()
        }
      ]
    });

    this.ui.elements.modalBody?.querySelectorAll(".btn-table-checkout-item").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.tableCheckoutId;
        this.ui.closeModal();
        if (id) {
          this.handleCheckOut(id);
        }
      });
    });
  }

  async ensureValidTable(tableNumber) {
    const brand = getActiveBrand();
    if (isValidTableNumber(brand, tableNumber)) {
      return true;
    }

    const validTables = getTablesForUser(brand);
    const maxHint = validTables.length > 0 ? ` (Registered tables: 1-${validTables.length})` : "";
    const confirmed = await this.ui.promptConfirm({
      title: `Table ${tableNumber} Not In Floor Plan`,
      message: `Table "${tableNumber}" is not in the official ${brand} restaurant table list${maxHint}. Do you want to proceed with this custom/extra table?`,
      confirmLabel: "Yes, Use Table",
      cancelLabel: "Fix Table Number",
      danger: false
    });

    return Boolean(confirmed);
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

    const tableValid = await this.ensureValidTable(tableNumber);
    if (!tableValid) {
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

    const tableAvailable = await this.ensureTableAvailable(tableNumber);
    if (!tableAvailable) {
      this.ui.elements.tableNumberInput.focus();
      return;
    }

    const record = createHotelCheckIn(this.selectedGuest, {
      tableNumber,
      actualGuests
    });
    const successMessage = record.entitlementExceeded
      ? `${this.selectedGuest.roomNumber} checked in successfully. ${record.extraGuests} extra guest(s) added to payment list.`
      : `${this.selectedGuest.roomNumber} checked in successfully.`;
    this.commitCheckIn(record, successMessage, "success");
  }

  async ensureTableAvailable(tableNumber, excludeCheckInId = "") {
    const occupants = findActiveCheckInsByTable(
      this.state.checkIns,
      tableNumber,
      excludeCheckInId
    );
    if (!occupants.length) {
      return true;
    }

    const occupantLabel = occupants
      .map((occupant) => {
        const room = occupant.roomNumber || occupant.guestType || "Guest";
        return occupant.guestName ? `${room} — ${occupant.guestName}` : room;
      })
      .join("; ");

    const choice = await this.ui.promptChoice({
      title: `Table ${tableNumber} Is Occupied`,
      message: `Table ${tableNumber} is occupied by ${occupantLabel}. Sit together at the same table, or check out the current party first?`,
      choices: [
        { id: "cancel", label: "Cancel", variant: "btn-secondary" },
        { id: "share", label: "Sit together", variant: "btn-primary" },
        { id: "checkout", label: "Check Out & Continue", variant: "btn-danger" }
      ]
    });

    if (choice === "share") {
      return true;
    }

    if (choice !== "checkout") {
      return false;
    }

    let nextCheckIns = this.state.checkIns;
    for (const occupant of occupants) {
      nextCheckIns = checkOutCheckIn(nextCheckIns, occupant.id);
      this.realtimeSync?.queueMutation("CHECKOUT", { id: occupant.id, checkedOutAt: new Date().toISOString() });
    }
    this.state.checkIns = nextCheckIns;
    this.state.paymentList = syncPaymentList(this.state.checkIns);
    this.persistState();
    this.refreshUi();
    return true;
  }

  async handleAddGuestsFromCard(checkInId) {
    if (!checkInId) {
      return;
    }

    const existingCheckIn = this.state.checkIns.find((record) => record.id === checkInId);
    if (!existingCheckIn || existingCheckIn.checkedOut) {
      return;
    }

    await this.handleLateArrivals(existingCheckIn, existingCheckIn.tableNumber, {
      clearForm: false
    });
  }

  async handleLateArrivals(existingCheckIn, tableNumber, options = {}) {
    const clearForm = options.clearForm !== false;
    const currentTable = existingCheckIn.tableNumber || "-";
    const currentGuests =
      parseInteger(existingCheckIn.actualGuests, NaN) >= 0
        ? parseInteger(existingCheckIn.actualGuests, 0)
        : parseInteger(existingCheckIn.adults, 0) + parseInteger(existingCheckIn.children, 0);

    const formValues = await this.ui.promptForm({
      title: `Late Arrivals — Room ${existingCheckIn.roomNumber}`,
      message: `Current guests: ${currentGuests}. Current table: ${currentTable}`,
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
      if (clearForm) {
        this.focusSearch();
      }
      return;
    }

    const additionalGuests = parseInteger(formValues.additionalGuests, 0);
    if (additionalGuests < 1) {
      this.ui.renderMessage("Enter at least 1 additional guest.", "warning");
      return;
    }

    if (normalizeTable(tableNumber) !== normalizeTable(existingCheckIn.tableNumber)) {
      const tableValid = await this.ensureValidTable(tableNumber);
      if (!tableValid) {
        return;
      }
      const tableAvailable = await this.ensureTableAvailable(
        tableNumber,
        existingCheckIn.id
      );
      if (!tableAvailable) {
        return;
      }
    }

    const updated = applyLateArrivals(existingCheckIn, {
      additionalGuests,
      tableNumber
    });

    this.state.checkIns = this.state.checkIns.map((record) =>
      record.id === existingCheckIn.id ? updated : record
    );
    this.state.paymentList = syncPaymentList(this.state.checkIns);
    this.persistState();
    putCheckIn(updated, getActiveBrand(), this.state.serviceDate).catch(() => {});
    this.realtimeSync?.queueMutation("CHECKIN", updated);

    if (clearForm) {
      this.ui.elements.tableNumberInput.value = "";
      this.ui.elements.actualGuestsInput.value = "";
      this.ui.elements.searchInput.value = "";
      this.selectedGuest = null;
      this.searchState.results = [];
      this.searchState.activeIndex = -1;
      this.ui.clearSearchResults();
    }

    this.refreshUi();

    if (clearForm) {
      this.focusSearch();
    }

    const extrasNote = updated.entitlementExceeded
      ? ` Payment list updated (${updated.extraGuests} extra guest(s)).`
      : "";
    this.ui.renderMessage(
      `Room ${updated.roomNumber} updated: +${updated.lateArrivalAdded} late arrival(s). Total guests ${updated.actualGuests}. Table ${updated.tableNumber}.${extrasNote}`,
      "success"
    );
  }

  async handleSpecialGuest(type) {
    const formValues =
      type === "walkIn"
        ? await this.ui.promptForm({
            title: "Walk-In Guest",
            submitLabel: "Check In",
            fields: [
              { name: "guestName", label: "Guest Name" },
              { name: "adults", label: "Adults", type: "number", min: 0, value: "1", required: true },
              { name: "children", label: "Children", type: "number", min: 0, value: "0", required: true },
              { name: "tableNumber", label: "Table Number", required: true }
            ]
          })
        : await this.ui.promptForm({
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

    const tableValid = await this.ensureValidTable(formValues.tableNumber);
    if (!tableValid) {
      this.focusSearch();
      return;
    }

    const tableAvailable = await this.ensureTableAvailable(formValues.tableNumber);
    if (!tableAvailable) {
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
    globalSearchIndex.buildIndex(this.state.guests);

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
    const breakfastQuantity =
      breakfastStatus === BREAKFAST_STATUS.INCLUDED
        ? parseInteger(formValues.breakfastQuantity, 0)
        : parseInteger(formValues.breakfastQuantity, 0);

    this.selectedGuest = {
      ...this.selectedGuest,
      breakfastStatus,
      breakfastQuantity,
      mealPlan: formValues.mealPlan || this.selectedGuest.mealPlan,
      statusOverride: true
    };

    const guestIndex = this.state.guests.findIndex(
      (guest) =>
        guest.id === this.selectedGuest.id ||
        normalizeRoom(guest.roomNumber) === normalizeRoom(this.selectedGuest.roomNumber)
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
    this.realtimeSync?.queueMutation("PAYMENT_PAID", { id: paymentId, paidAt: new Date().toISOString() });
    this.refreshUi();
    this.ui.renderMessage(`${payment.displayLocation} marked as paid.`, "success");
  }

  async handleCheckOut(checkInId) {
    if (!checkInId) {
      return;
    }

    const record = this.state.checkIns.find((item) => item.id === checkInId);
    if (!record || record.checkedOut) {
      return;
    }

    const roomLabel = record.roomNumber || record.guestType || "Guest";
    const guestPart = record.guestName ? ` — ${record.guestName}` : "";
    const tableLabel = record.tableNumber || "-";
    const confirmed = await this.ui.promptConfirm({
      title: "Check Out",
      message: `Check out ${roomLabel}${guestPart} and free Table ${tableLabel}?`,
      confirmLabel: "Check Out",
      danger: true
    });

    if (!confirmed) {
      return;
    }

    this.state.checkIns = checkOutCheckIn(this.state.checkIns, checkInId);
    this.state.paymentList = syncPaymentList(this.state.checkIns);
    this.persistState();
    this.realtimeSync?.queueMutation("CHECKOUT", { id: checkInId, checkedOutAt: new Date().toISOString() });
    this.refreshUi();
    this.ui.renderMessage(
      `${roomLabel} checked out. Table ${tableLabel} is free.`,
      "success"
    );
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

    const tableValid = await this.ensureValidTable(nextTable);
    if (!tableValid) {
      return;
    }

    const tableAvailable = await this.ensureTableAvailable(nextTable, checkInId);
    if (!tableAvailable) {
      return;
    }

    this.state.checkIns = updateCheckInTableNumber(this.state.checkIns, checkInId, nextTable);
    this.state.paymentList = syncPaymentList(this.state.checkIns);
    this.persistState();
    this.realtimeSync?.queueMutation("TABLE_CHANGE", { id: checkInId, tableNumber: nextTable });
    this.refreshUi();
    this.ui.renderMessage(
      `Table updated for ${record.roomNumber}: ${record.tableNumber || "-"} → ${nextTable}.`,
      "success"
    );
  }

  commitCheckIn(record, message, tone) {
    this.state.checkIns.unshift(record);
    this.state.paymentList = syncPaymentList(this.state.checkIns);
    this.persistState();
    putCheckIn(record, getActiveBrand(), this.state.serviceDate).catch(() => {});
    this.realtimeSync?.queueMutation("CHECKIN", record);
    this.syncCurrentStateToCloud();
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
      message: "This will download today's Breakfast Report, backup to Cloudflare D1, then clear check-ins, payments, and unload XML files.",
      confirmLabel: "Download & New Day",
      danger: true
    });

    if (!confirmed) {
      return;
    }

    try {
      await exportTodayReport(this.state.checkIns);
      await this.syncCurrentStateToCloud();
    } catch (error) {
      this.ui.renderMessage(`Could not download reports: ${error.message}. New day was cancelled.`, "error");
      return;
    }

    clearStoredState(getActiveBrand());
    clearDailyDb(getActiveBrand(), this.state.serviceDate).catch(() => {});
    this.realtimeSync?.syncRoster([], { mealPlan: "", packageForecast: "" }, { mealPlan: false, packageForecast: false });
    globalSearchIndex.clear();

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
    const tableFilter = document.querySelector("#checkinTableSearchInput");
    if (tableFilter) {
      tableFilter.value = "";
    }
    const guestFilter = document.querySelector("#checkinGuestSearchInput");
    if (guestFilter) {
      guestFilter.value = "";
    }

    this.ui.clearSearchResults();
    this.ui.renderGuest(null);
    if (this.ui.recentRooms) {
      this.ui.recentRooms = [];
      this.ui.renderRecentSearches();
    }

    this.persistState();
    this.refreshUi();
    this.focusSearch();
    this.ui.renderMessage("Reports downloaded. New day started. Please load XML reports (Meal Plan or Package Forecast).", "success");
  }

  async handleExportToday() {
    try {
      this.ui.renderMessage("Preparing Excel report download...", "info");
      await exportTodayReport(this.state.checkIns);
      this.ui.renderMessage("Today's report exported successfully.", "success");
    } catch (error) {
      this.ui.renderMessage(error.message, "error");
    }
  }

  async syncCurrentStateToCloud(showToast = false) {
    const brand = getActiveBrand();
    const serviceDate = this.state.serviceDate || todayKey();
    if (!brand) return { success: false, error: "Not logged in" };

    const result = await saveDailyReportToCloud(brand, serviceDate, this.state.checkIns, this.state.paymentList);
    if (showToast) {
      if (result.success) {
        this.ui.renderMessage(`Cloud backup saved for ${brand} (${serviceDate}). 20-day retention synced.`, "success");
      } else {
        this.ui.renderMessage(`Cloud backup notice: ${result.error || "Offline mode active"}`, "info");
      }
    }
    return result;
  }

  async handleManualCloudSync() {
    this.ui.renderMessage("Syncing current check-ins to Cloudflare D1...", "info");
    await this.syncCurrentStateToCloud(true);
  }

  handleOpenReportsDashboard() {
    this.ui.openReportsDashboard();
    if (this.ui.elements.reportBrandFilter && !this.ui.elements.reportBrandFilter.dataset.touched) {
      if (isSuperAdmin()) {
        this.ui.elements.reportBrandFilter.value = "ALL";
      } else {
        const active = getActiveBrand();
        this.ui.elements.reportBrandFilter.value = active;
        // Restrict brand selection for standard brand admins
        this.ui.elements.reportBrandFilter.disabled = true;
      }
    }
    this.loadReportsDashboardData();
  }

  debounceLoadReports() {
    if (this._loadReportsTimeout) {
      clearTimeout(this._loadReportsTimeout);
    }
    this._loadReportsTimeout = setTimeout(() => {
      this.loadReportsDashboardData();
    }, 300);
  }

  async loadReportsDashboardData() {
    this.ui.renderReportsLoading();

    const brand = this.ui.elements.reportBrandFilter?.value || "";
    const date = this.ui.elements.reportDateFilter?.value || "";
    const query = this.ui.elements.reportSearchInput?.value?.trim() || "";

    const result = await fetchReportsFromCloud({ brand, date, query, full: Boolean(query) });

    if (!result.success) {
      this.ui.renderReportsError(result.error || "Unable to reach Cloudflare D1 database. Check network connection.");
      return;
    }

    this.ui.renderReportsList(result.reports, {
      query,
      onExportReport: (d, b) => this.handleExportPastReport(d, b),
      onInspectReport: (d, b, p, q) => this.handleInspectPastReport(d, b, p, q)
    });
  }

  async handleExportPastReport(serviceDate, brand) {
    this.ui.renderMessage(`Fetching report for ${brand} on ${serviceDate}...`, "info");
    const reportData = await fetchFullReport(serviceDate, brand);
    if (!reportData || !Array.isArray(reportData.checkIns)) {
      this.ui.renderMessage("Could not retrieve report data from cloud.", "error");
      return;
    }

    try {
      const filename = `breakfast-report-${serviceDate}-${brand}.xlsx`;
      await exportTodayReport(reportData.checkIns, filename);
      this.ui.renderMessage(`Downloaded ${filename} successfully.`, "success");
    } catch (error) {
      this.ui.renderMessage(`Export error: ${error.message}`, "error");
    }
  }

  async handleInspectPastReport(serviceDate, brand, panelElement, query = "") {
    panelElement.innerHTML = `<div class="text-xs text-slate-400 font-semibold"><i class="fa-solid fa-spinner fa-spin mr-1"></i> Loading check-ins...</div>`;
    const reportData = await fetchFullReport(serviceDate, brand);
    if (!reportData || !Array.isArray(reportData.checkIns) || reportData.checkIns.length === 0) {
      panelElement.innerHTML = `<div class="text-xs text-slate-400 font-semibold">No check-in records available for this date.</div>`;
      return;
    }

    const allCheckIns = reportData.checkIns;
    const currentQuery = (query || this.ui.elements.reportSearchInput?.value || "").trim();

    const renderTableWithFilter = (activeFilter) => {
      const q = activeFilter.toLowerCase();
      const qClean = q.replace(/^0+/, "");

      const filteredCheckIns = q
        ? allCheckIns.filter((c) => {
            const roomRaw = String(c.roomNumber || c.displayLocation || "").toLowerCase();
            const roomClean = roomRaw.replace(/^0+/, "");
            const name = String(c.guestName || "").toLowerCase();
            const table = String(c.tableNumber || "").toLowerCase();
            const guestType = String(c.guestType || "").toLowerCase();
            const mealPlan = String(c.mealPlan || "").toLowerCase();
            const status = String(c.breakfastStatus || "").toLowerCase();

            return (
              roomRaw.includes(q) ||
              (qClean && roomClean.includes(qClean)) ||
              name.includes(q) ||
              table.includes(q) ||
              guestType.includes(q) ||
              mealPlan.includes(q) ||
              status.includes(q) ||
              (q === "paid" && Boolean(c.paid)) ||
              (q === "unpaid" && !c.paid && (c.breakfastStatus === "payment" || c.guestType === "Apartment" || c.guestType === "Walk-In" || c.entitlementExceeded)) ||
              (q === "active" && !c.checkedOut) ||
              (q === "out" && Boolean(c.checkedOut))
            );
          })
        : allCheckIns;

      if (filteredCheckIns.length === 0) {
        panelElement.innerHTML = `
          <div class="rounded-xl bg-slate-50 p-4 text-center">
            <p class="text-xs font-bold text-slate-500">No check-ins found matching "${escapeHtml(activeFilter)}" in this report.</p>
            <button type="button" class="btn-show-all-records mt-2 inline-flex items-center gap-1 text-xs font-bold text-primary underline">
              Show all (${allCheckIns.length}) records
            </button>
          </div>
        `;
        panelElement.querySelector(".btn-show-all-records")?.addEventListener("click", () => renderTableWithFilter(""));
        return;
      }

      const filterBanner = activeFilter
        ? `
          <div class="mb-2 flex items-center justify-between rounded-xl bg-blue-50 px-3 py-1.5 text-xs font-bold text-primary">
            <span><i class="fa-solid fa-filter mr-1.5"></i> Showing ${filteredCheckIns.length} of ${allCheckIns.length} records matching "${escapeHtml(activeFilter)}"</span>
            <button type="button" class="btn-show-all-records text-[11px] font-bold text-slate-500 underline hover:text-slate-800">Show all (${allCheckIns.length})</button>
          </div>
        `
        : "";

      const rowsHtml = filteredCheckIns
        .slice(0, 100)
        .map((c) => {
          const room = escapeHtml(c.roomNumber || c.displayLocation || "-");
          const name = escapeHtml(c.guestName || "-");
          const table = escapeHtml(c.tableNumber || "-");
          const guests = c.actualGuests || (Number(c.adults) || 0) + (Number(c.children) || 0);

          const inTime = c.timestamp ? formatTime(c.timestamp) : (c.timeLabel || "-");
          const outTime = c.checkedOutAt ? formatTime(c.checkedOutAt) : (c.checkedOut ? "Checked out" : '<span class="text-amber-600 font-bold">Active</span>');

          let statusBadge = "";
          const isIncluded = c.breakfastStatus === "included" && !c.entitlementExceeded;
          if (isIncluded) {
            statusBadge = '<span class="inline-flex rounded-lg px-2 py-0.5 text-[10px] font-bold bg-green-100 text-green-800">Included</span>';
          } else if (c.paid) {
            const paidTime = c.paidAt ? ` (${formatTime(c.paidAt)})` : "";
            statusBadge = `<span class="inline-flex rounded-lg px-2 py-0.5 text-[10px] font-bold bg-emerald-100 text-emerald-800">Paid${escapeHtml(paidTime)}</span>`;
          } else {
            statusBadge = '<span class="inline-flex rounded-lg px-2 py-0.5 text-[10px] font-bold bg-red-100 text-red-800">Unpaid</span>';
          }

          return `
            <tr class="border-b border-slate-100 text-[11px] hover:bg-slate-50/80">
              <td class="py-1.5 px-2 font-black text-slate-900">${room}</td>
              <td class="py-1.5 px-2 text-slate-700 max-w-[120px] truncate">${name}</td>
              <td class="py-1.5 px-2 font-black text-slate-800">${table}</td>
              <td class="py-1.5 px-2 text-center text-slate-600 font-semibold">${guests}</td>
              <td class="py-1.5 px-2 text-slate-500">${inTime}</td>
              <td class="py-1.5 px-2 text-slate-500">${outTime}</td>
              <td class="py-1.5 px-2">${statusBadge}</td>
            </tr>
          `;
        })
        .join("");

      panelElement.innerHTML = `
        ${filterBanner}
        <div class="max-h-72 overflow-y-auto">
          <table class="w-full text-left">
            <thead>
              <tr class="text-[10px] uppercase font-bold text-slate-400 border-b border-slate-200">
                <th class="py-1.5 px-2">Room</th>
                <th class="py-1.5 px-2">Guest</th>
                <th class="py-1.5 px-2">Table</th>
                <th class="py-1.5 px-2 text-center">Guests</th>
                <th class="py-1.5 px-2">In Time</th>
                <th class="py-1.5 px-2">Out Time</th>
                <th class="py-1.5 px-2">Payment / Status</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
          ${filteredCheckIns.length > 100 ? `<div class="text-[10px] text-slate-400 text-center mt-1">Showing first 100 of ${filteredCheckIns.length} matching records</div>` : ""}
        </div>
      `;

      panelElement.querySelector(".btn-show-all-records")?.addEventListener("click", () => renderTableWithFilter(""));
    };

    renderTableWithFilter(currentQuery);
  }

  async handleOpenTableManager() {
    const currentBrand = getActiveBrand();
    if (!canManageBrand(currentBrand)) {
      this.ui.renderMessage("You do not have permission to manage tables for this brand.", "warning");
      return;
    }

    await syncTablesFromCloud(currentBrand);
    const tables = getTablesForUser(currentBrand);

    this.ui.openTableManager(currentBrand, tables, {
      onEditTable: (num) => this.handlePromptEditTable(currentBrand, num),
      onDeleteTable: (num) => this.handlePromptDeleteTable(currentBrand, num)
    });
  }

  async handleAddTableSubmit(event) {
    event.preventDefault();
    const currentBrand = getActiveBrand();
    const input = this.ui.elements.newTableInput;
    const value = input?.value?.trim();
    if (!value) return;

    // Support comma separated or range (e.g. "91,92,93" or single "91")
    const parts = value
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    for (const num of parts) {
      await addTableToCloud(currentBrand, num);
    }

    if (input) input.value = "";
    this.ui.renderMessage(`Table(s) ${value} added to ${currentBrand}.`, "success");

    const updatedTables = getTablesForUser(currentBrand);
    this.ui.renderTableManagerGrid(currentBrand, updatedTables, {
      onEditTable: (num) => this.handlePromptEditTable(currentBrand, num),
      onDeleteTable: (num) => this.handlePromptDeleteTable(currentBrand, num)
    });
    this.refreshUi();
  }

  async handlePromptEditTable(brand, oldTableNumber) {
    const formValues = await this.ui.promptForm({
      title: `Edit Table ${oldTableNumber}`,
      submitLabel: "Save Table",
      fields: [
        {
          name: "newTableNumber",
          label: "New Table Number / Name",
          value: oldTableNumber,
          required: true
        }
      ]
    });

    if (!formValues || !formValues.newTableNumber) return;
    const newNum = formValues.newTableNumber.trim();
    if (newNum === oldTableNumber) return;

    const res = await updateTableInCloud(brand, oldTableNumber, newNum);
    if (res.success) {
      this.ui.renderMessage(`Table ${oldTableNumber} updated to ${newNum}.`, "success");
    } else {
      this.ui.renderMessage(res.message || "Failed to update table", "error");
    }

    const updatedTables = getTablesForUser(brand);
    this.ui.renderTableManagerGrid(brand, updatedTables, {
      onEditTable: (num) => this.handlePromptEditTable(brand, num),
      onDeleteTable: (num) => this.handlePromptDeleteTable(brand, num)
    });
    this.refreshUi();
  }

  async handlePromptDeleteTable(brand, tableNumber) {
    const confirmed = await this.ui.promptConfirm({
      title: "Delete Table",
      message: `Are you sure you want to remove Table ${tableNumber} from ${brand}?`,
      confirmLabel: "Delete Table",
      danger: true
    });

    if (!confirmed) return;

    const res = await deleteTableFromCloud(brand, tableNumber);
    if (res.success) {
      this.ui.renderMessage(`Table ${tableNumber} deleted from ${brand}.`, "success");
    } else {
      this.ui.renderMessage(res.message || "Failed to delete table", "error");
    }

    const updatedTables = getTablesForUser(brand);
    this.ui.renderTableManagerGrid(brand, updatedTables, {
      onEditTable: (num) => this.handlePromptEditTable(brand, num),
      onDeleteTable: (num) => this.handlePromptDeleteTable(brand, num)
    });
    this.refreshUi();
  }

  handleSuperAdminBrandChange(event) {
    const selectedBrand = String(event.target.value || "").toUpperCase();
    if (selectedBrand !== "KCA" && selectedBrand !== "KTB") return;
    setActiveBrand(selectedBrand);
    applyBrandLogo(selectedBrand);

    // Sync all brand switcher select elements
    if (this.ui.elements.superAdminBrandSelect) {
      this.ui.elements.superAdminBrandSelect.value = selectedBrand;
    }
    if (this.ui.elements.mobileToolsBrandSelect) {
      this.ui.elements.mobileToolsBrandSelect.value = selectedBrand;
    }

    // Switch to isolated state for selected brand
    this.state = this.createInitialState();
    this.selectedGuest = null;
    this.searchState.results = [];
    this.searchState.activeIndex = -1;
    globalSearchIndex.clear();
    if (this.state.guests && this.state.guests.length) {
      globalSearchIndex.buildIndex(this.state.guests);
    }

    this.ui.renderMessage(`Switched to ${selectedBrand} Hotel engine.`, "info");
    this.realtimeSync?.triggerSync();
    syncTablesFromCloud(selectedBrand).then(() => {
      this.refreshUi();
    });
  }

  focusSearch() {
    this.ui.elements.searchInput.focus();
  }
}

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
  const superAdminBrandWrap = document.querySelector("#superAdminBrandWrap");
  const superAdminBrandSelect = document.querySelector("#superAdminBrandSelect");
  const mobileToolsBrandRow = document.querySelector("#mobileToolsBrandRow");
  const mobileToolsBrandSelect = document.querySelector("#mobileToolsBrandSelect");
  const currentUser = getCurrentUser();
  const profile = getCurrentUserProfile();
  const activeBrand = getActiveBrand();

  const userRoleText = isSuperAdmin() ? "Super Admin" : "Host";
  const userLabel = `${currentUser} (${userRoleText})`;
  const mobileUserLabel = isSuperAdmin() ? "Super Admin" : currentUser;

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
    mobileUserBadge.textContent = mobileUserLabel;
  }

  // Super Admin Hotel Switcher display (Desktop & Mobile Tools Menu)
  if (isSuperAdmin()) {
    if (superAdminBrandWrap && superAdminBrandSelect) {
      superAdminBrandWrap.classList.remove("hidden");
      superAdminBrandWrap.classList.add("inline-flex");
      superAdminBrandSelect.value = activeBrand;
    }
    if (mobileToolsBrandRow && mobileToolsBrandSelect) {
      mobileToolsBrandRow.classList.remove("hidden");
      mobileToolsBrandRow.classList.add("flex");
      mobileToolsBrandSelect.value = activeBrand;
    }
  } else {
    if (superAdminBrandWrap) {
      superAdminBrandWrap.classList.add("hidden");
      superAdminBrandWrap.classList.remove("inline-flex");
    }
    if (mobileToolsBrandRow) {
      mobileToolsBrandRow.classList.add("hidden");
      mobileToolsBrandRow.classList.remove("flex");
    }
  }

  applyBrandLogo(activeBrand);
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

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const username = document.querySelector("#loginUsername")?.value || "";
    const password = document.querySelector("#loginPassword")?.value || "";

    const res = await login(username, password);
    if (res.success) {
      if (loginError) {
        loginError.hidden = true;
      }
      applyBrandLogo(getActiveBrand());
      launchBreakfastApp();
      return;
    }

    if (loginError) {
      loginError.textContent = res.error || "Invalid username or password.";
      loginError.hidden = false;
    }
    document.querySelector("#loginPassword")?.focus();
  });
}

function bindLogoutButton() {
  document.querySelector("#logoutButton")?.addEventListener("click", () => {
    window.breakfastApp?.realtimeSync?.stop();
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
