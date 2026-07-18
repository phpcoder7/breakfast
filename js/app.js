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
import { exportAccountingReport, exportTodayReport } from "./export.js";
import { mergeGuestData } from "./mergeData.js";
import { markPaymentPaid, syncPaymentList } from "./payment.js";
import { exactRoomMatch, searchGuests } from "./search.js";
import { BreakfastUI } from "./ui.js";
import { getBrandLogo, getCurrentUser, isLoggedIn, login, logout } from "./auth.js";
import {
  BREAKFAST_STATUS,
  normalizeRoom,
  parseInteger,
  readStoredState,
  statusMeta,
  todayKey,
  writeStoredState
} from "./utils.js";
import { parseMealPlanXml, parsePackageForecastXml } from "./xmlParser.js";

class BreakfastApp {
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
      timeLabel: record.timestamp
        ? new Date(record.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
        : ""
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
    this.ui.renderGuest(guest);
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
    this.ui.renderGuest(guest);
    this.ui.setMobileView("search");
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

    const tableAvailable = await this.ensureTableAvailable(nextTable, checkInId);
    if (!tableAvailable) {
      return;
    }

    this.state.checkIns = updateCheckInTableNumber(this.state.checkIns, checkInId, nextTable);
    this.state.paymentList = syncPaymentList(this.state.checkIns);
    this.persistState();
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
