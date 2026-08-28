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
  const rows = checkIns.map((record) => {
    const isIncluded = record.breakfastStatus === "included" && !record.entitlementExceeded;
    let paymentStatus = "Included";
    if (!isIncluded) {
      if (record.paid) {
        paymentStatus = `Paid${record.paidAt ? ` (${formatTime(record.paidAt)})` : ""}`;
      } else {
        paymentStatus = "Unpaid";
      }
    }

    const checkInTime = record.timeLabel || (record.timestamp ? formatTime(record.timestamp) : "");
    const checkOutTime = record.checkedOutAt ? formatTime(record.checkedOutAt) : (record.checkedOut ? "Checked out" : "Active");

    return {
      "Check-in Time": checkInTime,
      "Check-out Time": checkOutTime,
      "Room Number": record.roomNumber || record.displayLocation || "-",
      "Guest Name": record.guestName || "-",
      "Table Number": record.tableNumber || "-",
      Adults: record.adults ?? 0,
      Children: record.children ?? 0,
      "Actual Guests": record.actualGuests ?? (Number(record.adults || 0) + Number(record.children || 0)),
      "Guest Type": record.guestType || "Hotel",
      "Meal Plan": record.mealPlan || "-",
      Package: record.products || "-",
      "Breakfast Status": record.breakfastStatus === "included" ? "Included" : "Payment Required",
      "Payment Status": paymentStatus,
      "Extra Guests": record.extraGuests || 0,
      "FO Override": record.statusOverride ? "Yes" : "No"
    };
  });

  const fileName = customFilename || `breakfast-report-${todayKey()}.xlsx`;
  writeWorkbook(rows, fileName, "Breakfast Report");
}
