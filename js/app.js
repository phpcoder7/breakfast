import { createApartmentCheckIn, createHotelCheckIn, createWalkInCheckIn, checkEntitlement, detectDuplicate, getExtraGuests } from "./checkin.js";
import { exportAccountingReport, exportTodayReport } from "./export.js";
import { mergeGuestData } from "./mergeData.js";
import { syncPaymentList } from "./payment.js";
import { exactRoomMatch, searchGuests } from "./search.js";
import { BreakfastUI } from "./ui.js";
import { getCurrentUser, isLoggedIn, login, logout } from "./auth.js";
import {
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
    elements.newDayButton.addEventListener("click", () => this.handleNewDay());
    elements.exportTodayButton.addEventListener("click", () => this.handleExportToday());
    elements.exportAccountingButton.addEventListener("click", () => this.handleExportAccounting());
    document.querySelector("#modalCloseButton").addEventListener("click", () => {
      this.ui.closeModal();
      this.focusSearch();
    });

    elements.tabButtons.forEach((button) => {
      button.addEventListener("click", () => this.ui.activateTab(button.dataset.tabTarget));
    });

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
    this.ui.setCheckInEnabled(this.state.filesLoaded.mealPlan && this.state.filesLoaded.packageForecast);
    this.ui.setExportState(Boolean(this.state.checkIns.length), Boolean(this.state.paymentList.length));
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

    if (detectDuplicate(this.state.checkIns, this.selectedGuest)) {
      const confirmed = await this.ui.promptConfirm({
        title: "Duplicate Check-In",
        message: "Room already checked in today. Do you want to override and continue?",
        confirmLabel: "Override"
      });
      if (!confirmed) {
        this.focusSearch();
        return;
      }
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
    const successMessage = record.entitlementExceeded
      ? `${this.selectedGuest.roomNumber} checked in successfully. ${record.extraGuests} extra guest(s) added to payment list.`
      : `${this.selectedGuest.roomNumber} checked in successfully.`;
    this.commitCheckIn(record, successMessage, "success");
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

    const record = type === "walkIn" ? createWalkInCheckIn(formValues) : createApartmentCheckIn(formValues);
    this.commitCheckIn(record, `${record.guestType} guest checked in successfully.`, "success");
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
      message: "Delete today's check-ins, payment list, and unload both XML files? You will need to load new Meal Plan and Package Forecast files.",
      confirmLabel: "New Day",
      danger: true
    });

    if (!confirmed) {
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
    this.ui.renderMessage("New day started. Please load both XML reports.", "success");
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

function showLoginScreen() {
  const loginScreen = document.querySelector("#loginScreen");
  const appShell = document.querySelector("#appShell");
  const loginError = document.querySelector("#loginError");
  const loginPassword = document.querySelector("#loginPassword");

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

  document.querySelector("#loginUsername")?.focus();
}

function showAppScreen() {
  const loginScreen = document.querySelector("#loginScreen");
  const appShell = document.querySelector("#appShell");
  const userBadge = document.querySelector("#currentUserBadge");

  if (loginScreen) {
    loginScreen.hidden = true;
  }
  if (appShell) {
    appShell.hidden = false;
  }
  if (userBadge) {
    userBadge.textContent = `User: ${getCurrentUser()}`;
  }
}

function bindLoginForm() {
  const loginForm = document.querySelector("#loginForm");
  const loginError = document.querySelector("#loginError");

  if (!loginForm) {
    throw new Error("Missing login form");
  }

  loginForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const username = document.querySelector("#loginUsername")?.value || "";
    const password = document.querySelector("#loginPassword")?.value || "";

    if (login(username, password)) {
      if (loginError) {
        loginError.hidden = true;
      }
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
