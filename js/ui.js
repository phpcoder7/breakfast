import {
  escapeHtml,
  formatDate,
  listToText,
  statusMeta
} from "./utils.js";
import { renderSearchResults } from "./search.js";

const RECENT_LIMIT = 6;

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

function infoChip(icon, label, value) {
  return `
    <div class="rounded-2xl bg-slate-50 px-3 py-2.5">
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
      <div class="flex min-h-[280px] flex-col items-center justify-center gap-3 rounded-3xl bg-slate-50 px-6 text-center">
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
  const statusTone =
    guest.breakfastStatus === "included"
      ? "from-green-50 to-white border-green-100"
      : guest.breakfastStatus === "payment"
        ? "from-red-50 to-white border-red-100"
        : "from-yellow-50 to-white border-yellow-100";

  return `
    <div class="card-enter overflow-hidden rounded-3xl border bg-gradient-to-b ${statusTone}">
      <div class="flex items-start justify-between gap-3 p-4 pb-2">
        <div>
          <p class="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Room</p>
          <div class="text-5xl font-black tracking-tight text-slate-900">${escapeHtml(guest.roomNumber)}</div>
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

      <div class="grid grid-cols-2 gap-2 p-4 pt-2">
        ${infoChip("fa-user-group", "Adults", String(guest.adults))}
        ${infoChip("fa-child", "Children", String(guest.children))}
        ${infoChip("fa-utensils", "Meal Plan", guest.mealPlan || "-")}
        ${infoChip("fa-box", "Package", listToText(guest.products))}
        ${infoChip("fa-calendar-check", "Arrival", formatDate(guest.arrival))}
        ${infoChip("fa-calendar-xmark", "Departure", formatDate(guest.departure))}
        ${infoChip("fa-hashtag", "Confirmation", guest.confirmationNumber || "-")}
        ${infoChip("fa-mug-hot", "BF Qty", String(guest.breakfastQuantity))}
        ${infoChip("fa-hotel", "Status", guest.reservationStatus || "-")}
        ${infoChip("fa-tag", "Rate", guest.rateCode || "-")}
      </div>

      <div class="border-t border-black/5 px-4 py-3 text-xs font-medium text-slate-500">
        <i class="fa-solid fa-circle-info mr-1 text-slate-300"></i>
        ${escapeHtml(listToText(guest.productDescriptions))}
      </div>
    </div>
  `;
}

function checkInCardMarkup(record) {
  const badgeClass = statusBadgeClass(record.breakfastStatus, record.guestType);
  const badgeLabel = statusBadgeLabel(record.breakfastStatus, record.guestType);

  return `
    <article class="card-enter rounded-2xl bg-slate-50 p-3 transition hover:bg-white hover:shadow-card">
      <div class="mb-2 flex items-center justify-between gap-2">
        <span class="text-xs font-bold text-slate-400">${escapeHtml(record.timeLabel || "")}</span>
        <span class="inline-flex rounded-full px-2.5 py-1 text-[10px] font-extrabold ${badgeClass}">${escapeHtml(badgeLabel)}</span>
      </div>
      <div class="text-2xl font-black tracking-tight text-slate-900">${escapeHtml(record.roomNumber || "")}</div>
      <div class="mt-1 truncate text-sm font-semibold text-slate-600">${escapeHtml(record.guestName || "")}</div>
      <div class="mt-3 flex items-center justify-between text-xs font-bold text-slate-500">
        <span><i class="fa-solid fa-chair mr-1 text-primary"></i>Table ${escapeHtml(String(record.tableNumber || "-"))}</span>
        <span>${escapeHtml(record.guestType || "")}</span>
      </div>
    </article>
  `;
}

function paymentCardMarkup(record) {
  return `
    <article class="card-enter rounded-2xl border border-red-100 bg-gradient-to-br from-red-50 to-white p-3 shadow-press">
      <div class="mb-2 flex items-center justify-between gap-2">
        <span class="text-xs font-bold text-slate-400">${escapeHtml(record.timeLabel || "")}</span>
        <span class="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-[10px] font-extrabold text-danger">
          <i class="fa-solid fa-receipt"></i>
          Pay
        </span>
      </div>
      <div class="text-2xl font-black tracking-tight text-slate-900">${escapeHtml(record.displayLocation || "")}</div>
      <div class="mt-1 truncate text-sm font-semibold text-slate-600">${escapeHtml(record.guestName || "")}</div>
      <div class="mt-3 flex items-center justify-between text-xs font-bold text-slate-500">
        <span><i class="fa-solid fa-chair mr-1 text-danger"></i>Table ${escapeHtml(String(record.tableNumber || "-"))}</span>
        <span>${escapeHtml(record.guestType || "")}</span>
      </div>
      <div class="mt-2 text-xs font-bold text-danger">${escapeHtml(record.reason || "")}</div>
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
    const label = type === "mealPlan" ? "Meal Plan" : "Package Forecast";

    if (loaded) {
      element.className =
        "file-status is-loaded inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-bold";
      element.textContent = `${label}: Loaded`;
      element.title = fileName;
      return;
    }

    element.className =
      "file-status is-missing inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-bold";
    element.textContent = `${label}: Missing`;
    element.title = "";
  }

  setFileLoading(type, fileName = "") {
    const element = type === "mealPlan" ? this.elements.mealPlanStatus : this.elements.packageForecastStatus;
    const label = type === "mealPlan" ? "Meal Plan" : "Package Forecast";
    element.className =
      "file-status is-loading inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-bold";
    element.textContent = `${label}: Reading...`;
    element.title = fileName;
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

  updateStatistics(checkIns = [], payments = []) {
    if (this.elements.statCheckIns) {
      this.elements.statCheckIns.textContent = String(checkIns.length);
    }
    if (this.elements.statPayments) {
      this.elements.statPayments.textContent = String(payments.length);
    }
    if (this.elements.statIncluded) {
      this.elements.statIncluded.textContent = String(
        checkIns.filter((record) => record.breakfastStatus === "included").length
      );
    }
    if (this.elements.statPaymentRequired) {
      this.elements.statPaymentRequired.textContent = String(
        checkIns.filter((record) => record.breakfastStatus === "payment" || record.guestType === "Apartment" || record.guestType === "Walk-In")
          .length
      );
    }
  }

  renderCheckIns(records) {
    this._lastCheckIns = records;
    this.elements.checkinTableBody.innerHTML = records.length
      ? records.map((record) => checkInCardMarkup(record)).join("")
      : emptyCardsMarkup("No check-ins recorded yet.");
    this.updateStatistics(records, this._lastPayments || []);
  }

  renderPayments(records) {
    this._lastPayments = records;
    this.elements.paymentTableBody.innerHTML = records.length
      ? records.map((record) => paymentCardMarkup(record)).join("")
      : emptyCardsMarkup("No payment items queued.");
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
    this.elements.messageArea.className = `message-banner mb-3 shrink-0 rounded-2xl px-4 py-3 text-sm font-semibold ${tone}`;
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
  }

  activateTab(targetName) {
    this.elements.tabButtons.forEach((button) => {
      button.classList.toggle("is-active", button.dataset.tabTarget === targetName);
    });
    this.elements.tabPanels.forEach((panel) => {
      panel.hidden = panel.dataset.tabPanel !== targetName;
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
          ${fields
            .map(
              (field) => `
                <label class="form-field">
                  <span>${escapeHtml(field.label)}</span>
                  <input
                    type="${escapeHtml(field.type || "text")}"
                    name="${escapeHtml(field.name)}"
                    value="${escapeHtml(field.value || "")}"
                    ${field.min !== undefined ? `min="${escapeHtml(String(field.min))}"` : ""}
                    ${field.required ? "required" : ""}
                  />
                </label>
              `
            )
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

      const firstInput = this.elements.modal.querySelector("input");
      firstInput?.focus();
    });
  }
}
