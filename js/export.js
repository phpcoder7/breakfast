import { formatTime, todayKey } from "./utils.js";

let xlsxLoadingPromise = null;

export async function ensureXlsx() {
  if (typeof window !== "undefined" && window.XLSX) {
    return window.XLSX;
  }

  if (xlsxLoadingPromise) {
    return xlsxLoadingPromise;
  }

  xlsxLoadingPromise = new Promise((resolve, reject) => {
    if (typeof document === "undefined") {
      return reject(new Error("DOM environment required for Excel export"));
    }

    const existing = document.querySelector('script[src*="xlsx.full.min.js"]');
    if (existing && window.XLSX) {
      return resolve(window.XLSX);
    }

    const script = document.createElement("script");
    script.src = "./vendor/xlsx.full.min.js";
    script.async = true;
    script.onload = () => {
      if (window.XLSX) {
        resolve(window.XLSX);
      } else {
        reject(new Error("Excel export library loaded but XLSX object is undefined."));
      }
    };
    script.onerror = () => {
      xlsxLoadingPromise = null;
      reject(new Error("Could not load Excel export library (vendor/xlsx.full.min.js)."));
    };
    document.head.appendChild(script);
  });

  return xlsxLoadingPromise;
}

export async function writeWorkbook(rows, fileName, sheetName) {
  const XLSX = await ensureXlsx();
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  XLSX.writeFile(workbook, fileName);
}

export async function exportTodayReport(checkIns, customFilename = "") {
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
  await writeWorkbook(rows, fileName, "Breakfast Report");
}
