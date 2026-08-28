import { formatTime, todayKey } from "./utils.js";

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

export function exportTodayReport(checkIns, customFilename = "") {
  const rows = checkIns.map((record) => ({
    Time: record.timeLabel || (record.timestamp ? new Date(record.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : ""),
    "Room Number": record.roomNumber || record.displayLocation || "-",
    "Guest Name": record.guestName || "-",
    Adults: record.adults ?? 0,
    Children: record.children ?? 0,
    Table: record.tableNumber || "-",
    "Meal Plan": record.mealPlan || "-",
    Package: record.products || "-",
    "Breakfast Included": record.breakfastStatus === "included" ? "Yes" : "No",
    "Guest Type": record.guestType || "Hotel",
    "FO Override": record.statusOverride ? "Yes" : "No",
    "Checked Out": record.checkedOut ? "Yes" : "No",
    "Check Out Time": record.checkedOutAt ? formatTime(record.checkedOutAt) : ""
  }));

  const fileName = customFilename || `breakfast-report-${todayKey()}.xlsx`;
  writeWorkbook(rows, fileName, "Breakfast Report");
}

export function exportAccountingReport(paymentList, customFilename = "") {
  const rows = paymentList.map((record) => ({
    Time: record.timestamp
      ? new Date(record.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
      : "",
    "Room / Apartment": record.displayLocation || "-",
    Guest: record.guestName || "-",
    Table: record.tableNumber || "-",
    "Guest Type": record.guestType || "Hotel",
    Reason: record.reason || "-",
    "Extra Guests": record.extraGuests || "",
    "Guests Charged": record.chargeableGuests ?? "",
    "Unit Price (AED)": record.unitPriceAed ?? "",
    "Amount (AED)": record.amountAed ?? "",
    Paid: record.paid ? "Yes" : "No",
    "Paid At": record.paidAt
      ? new Date(record.paidAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
      : ""
  }));

  const fileName = customFilename || `breakfast-accounting-${todayKey()}.xlsx`;
  writeWorkbook(rows, fileName, "Accounting");
}
