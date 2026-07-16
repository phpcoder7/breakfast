import {
  escapeHtml,
  formatDate,
  listToText,
  statusMeta
} from "./utils.js";
import { renderSearchResults } from "./search.js";

function renderDetailRow(label, value) {
  return `
    <div class="detail-row">
      <span class="detail-label">${escapeHtml(label)}</span>
      <span class="detail-value">${escapeHtml(value)}</span>
    </div>
  `;
}

function guestPanelMarkup(guest) {
  if (!guest) {
    return `
      <div class="empty-panel">
        <i class="fa-solid fa-mug-saucer"></i>
        <p>Load both XML files and search for a room or guest to begin breakfast check-in.</p>
      </div>
    `;
  }

  const status = statusMeta(guest.breakfastStatus);
  return `
    <div class="guest-card">
      <div class="guest-card-top">
        <div>
          <div class="room-title">${escapeHtml(guest.roomNumber)}</div>
          <div class="guest-name">${escapeHtml(guest.fullName || "-")}</div>
        </div>
        <span class="status-pill ${status.className}">${escapeHtml(status.label)}</span>
      </div>
      <div class="detail-grid">
        ${renderDetailRow("Arrival", formatDate(guest.arrival))}
        ${renderDetailRow("Departure", formatDate(guest.departure))}
        ${renderDetailRow("Adults", String(guest.adults))}
        ${renderDetailRow("Children", String(guest.children))}
        ${renderDetailRow("Confirmation", guest.confirmationNumber || "-")}
        ${renderDetailRow("Meal Plan", guest.mealPlan || "-")}
        ${renderDetailRow("Package Code(s)", listToText(guest.products))}
        ${renderDetailRow("Package Description", listToText(guest.productDescriptions))}
        ${renderDetailRow("Breakfast Included", guest.breakfastIncluded ? "Yes" : "No")}
        ${renderDetailRow("Breakfast Quantity", String(guest.breakfastQuantity))}
        ${renderDetailRow("Reservation Status", guest.reservationStatus || "-")}
        ${renderDetailRow("Rate Code", guest.rateCode || "-")}
      </div>
    </div>
  `;
}

function tableRowsMarkup(rows, columns, emptyMessage) {
  if (!rows.length) {
    return `<tr><td colspan="${columns.length}" class="empty-table">${escapeHtml(emptyMessage)}</td></tr>`;
  }

  return rows
    .map(
      (row) => `
        <tr>
          ${columns.map((column) => `<td>${escapeHtml(row[column.key] ?? "")}</td>`).join("")}
        </tr>
      `
    )
    .join("");
}

export class BreakfastUI {
  constructor() {
    this.elements = {
      mealPlanFile: document.querySelector("#mealPlanFile"),
      packageForecastFile: document.querySelector("#packageForecastFile"),
      mealPlanStatus: document.querySelector("#mealPlanStatus"),
      packageForecastStatus: document.querySelector("#packageForecastStatus"),
      searchInput: document.querySelector("#searchInput"),
      searchResults: document.querySelector("#searchResults"),
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
      modalActions: document.querySelector("#modalActions")
    };
  }

  setFileStatus(type, loaded, fileName = "") {
    const element = type === "mealPlan" ? this.elements.mealPlanStatus : this.elements.packageForecastStatus;
    const label = type === "mealPlan" ? "Meal Plan" : "Package Forecast";

    if (loaded) {
      element.className = "file-status is-loaded";
      element.textContent = `${label}: Loaded`;
      element.title = fileName;
      return;
    }

    element.className = "file-status is-missing";
    element.textContent = `${label}: Missing`;
    element.title = "";
  }

  setFileLoading(type, fileName = "") {
    const element = type === "mealPlan" ? this.elements.mealPlanStatus : this.elements.packageForecastStatus;
    const label = type === "mealPlan" ? "Meal Plan" : "Package Forecast";
    element.className = "file-status is-loading";
    element.textContent = `${label}: Reading...`;
    element.title = fileName;
  }

  renderGuest(guest) {
    this.elements.guestPanel.innerHTML = guestPanelMarkup(guest);
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

  renderCheckIns(records) {
    const columns = [
      { key: "timeLabel", label: "Time" },
      { key: "roomNumber", label: "Room" },
      { key: "guestName", label: "Guest" },
      { key: "tableNumber", label: "Table" },
      { key: "breakfastLabel", label: "Breakfast" },
      { key: "mealPlan", label: "Meal Plan" },
      { key: "products", label: "Package" },
      { key: "guestType", label: "Guest Type" }
    ];

    this.elements.checkinTableBody.innerHTML = tableRowsMarkup(records, columns, "No check-ins recorded yet.");
  }

  renderPayments(records) {
    const columns = [
      { key: "timeLabel", label: "Time" },
      { key: "displayLocation", label: "Room / Apartment" },
      { key: "guestName", label: "Guest Name" },
      { key: "tableNumber", label: "Table" },
      { key: "reason", label: "Reason" },
      { key: "guestType", label: "Guest Type" }
    ];

    this.elements.paymentTableBody.innerHTML = tableRowsMarkup(records, columns, "No payment items queued.");
  }

  renderMessage(message, tone = "info") {
    this.elements.messageArea.className = `message-banner ${tone}`;
    this.elements.messageArea.textContent = message;
    this.elements.messageArea.hidden = !message;
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
        body: `<p>${escapeHtml(message)}</p>`,
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
