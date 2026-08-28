/**
 * Cloud Sync Service for Cloudflare D1
 * Seamlessly backs up daily reports to Cloudflare D1 with automatic 20-day retention.
 */

const API_BASE = "/api/reports";

/**
 * Saves a daily report snapshot to Cloudflare D1.
 * Non-blocking and offline resilient.
 *
 * @param {string} brand - KCA or KTB
 * @param {string} serviceDate - YYYY-MM-DD
 * @param {Array} checkIns - List of check-in records
 * @param {Array} paymentList - List of payment records
 * @returns {Promise<{ success: boolean, message?: string, error?: string }>}
 */
export async function saveDailyReportToCloud(brand, serviceDate, checkIns = [], paymentList = []) {
  if (!brand || !serviceDate) {
    return { success: false, error: "Brand and Service Date are required for cloud backup." };
  }

  try {
    const payload = {
      brand: String(brand).trim().toUpperCase(),
      serviceDate: String(serviceDate).trim(),
      checkIns,
      paymentList
    };

    const response = await fetch(API_BASE, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errText = await response.text();
      let errorMsg = `Server returned ${response.status}`;
      try {
        const parsed = JSON.parse(errText);
        if (parsed.error) errorMsg = parsed.error;
      } catch {
        // fallback
      }
      return { success: false, error: errorMsg };
    }

    const data = await response.json();
    return { success: true, message: data.message || "Cloud backup complete." };
  } catch (error) {
    // Network failure or running locally without backend
    console.warn("Cloud sync warning (offline or local):", error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Fetches historical reports from Cloudflare D1 (up to 20 days).
 *
 * @param {object} params
 * @param {string} [params.brand]
 * @param {string} [params.date]
 * @param {string} [params.query]
 * @param {boolean} [params.full]
 * @returns {Promise<{ success: boolean, reports: Array, error?: string }>}
 */
export async function fetchReportsFromCloud({ brand = "", date = "", query = "", full = false } = {}) {
  try {
    const url = new URL(API_BASE, window.location.origin);
    if (brand && brand !== "ALL") url.searchParams.set("brand", brand);
    if (date) url.searchParams.set("date", date);
    if (query) url.searchParams.set("query", query);
    if (full) url.searchParams.set("full", "true");

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json"
      }
    });

    if (!response.ok) {
      const errText = await response.text();
      let errorMsg = `Server returned ${response.status}`;
      try {
        const parsed = JSON.parse(errText);
        if (parsed.error) errorMsg = parsed.error;
      } catch {
        // fallback
      }
      return { success: false, reports: [], error: errorMsg };
    }

    const data = await response.json();
    return { success: true, count: data.count || 0, reports: data.reports || [] };
  } catch (error) {
    console.warn("Failed to fetch reports from cloud:", error.message);
    return { success: false, reports: [], error: error.message };
  }
}

/**
 * Fetches a single full report for 1-click Excel re-export.
 *
 * @param {string} serviceDate
 * @param {string} brand
 * @returns {Promise<{ checkIns: Array, paymentList: Array } | null>}
 */
export async function fetchFullReport(serviceDate, brand) {
  const result = await fetchReportsFromCloud({ date: serviceDate, brand, full: true });
  if (result.success && result.reports && result.reports.length > 0) {
    const match = result.reports[0];
    if (match.reportData) {
      return match.reportData;
    }
  }
  return null;
}
