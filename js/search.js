import {
  escapeHtml,
  normalizeSearchText,
  roomSearchVariants
} from "./utils.js";
import { GuestSearchIndex, globalSearchIndex } from "./searchIndex.js";

export { GuestSearchIndex, globalSearchIndex };

/**
 * Searches guests by room number, name, or confirmation code.
 * Uses cached index if available or on-demand search.
 * @param {any[]} guests
 * @param {string} query
 * @param {number} [limit=8]
 * @returns {any[]}
 */
export function searchGuests(guests, query, limit = 8) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) {
    return [];
  }

  // If the global index is synced with this list, use indexed O(1) lookups
  if (globalSearchIndex.guests === guests && globalSearchIndex.guests.length > 0) {
    return globalSearchIndex.search(query, limit);
  }

  // Otherwise perform fast inline search
  const safeGuests = Array.isArray(guests) ? guests : [];
  const variants = roomSearchVariants(normalizedQuery);

  return safeGuests
    .filter((guest) => {
      if (!guest) return false;
      const room = normalizeSearchText(guest.roomNumber);
      const firstName = normalizeSearchText(guest.firstName);
      const lastName = normalizeSearchText(guest.lastName);
      const fullName = normalizeSearchText(guest.fullName || `${guest.firstName || ""} ${guest.lastName || ""}`);
      const confirmation = normalizeSearchText(guest.confirmationNumber);

      return (
        variants.some((v) => room.includes(v) || v.includes(room)) ||
        firstName.includes(normalizedQuery) ||
        lastName.includes(normalizedQuery) ||
        fullName.includes(normalizedQuery) ||
        confirmation.includes(normalizedQuery)
      );
    })
    .slice(0, limit);
}

/**
 * Finds exact room match.
 * @param {any[]} guests
 * @param {string} query
 * @returns {any | null}
 */
export function exactRoomMatch(guests, query) {
  if (globalSearchIndex.guests === guests && globalSearchIndex.guests.length > 0) {
    return globalSearchIndex.exactRoomMatch(query);
  }

  const variants = roomSearchVariants(query);
  const safeGuests = Array.isArray(guests) ? guests : [];
  return (
    safeGuests.find((guest) => {
      if (!guest) return false;
      const r = String(guest.roomNumber || "").trim();
      const stripped = r.replace(/^0+/, "") || "0";
      return variants.includes(r) || variants.includes(stripped);
    }) || null
  );
}

/**
 * Highlights the query substring within the display text safely.
 * @param {string} text
 * @param {string} query
 * @returns {string}
 */
export function highlightMatch(text, query) {
  const source = String(text ?? "");
  const normalizedSource = source.toLowerCase();
  const normalizedQuery = (query || "").trim().toLowerCase();
  const start = normalizedSource.indexOf(normalizedQuery);

  if (start === -1 || !normalizedQuery) {
    return escapeHtml(source);
  }

  const end = start + normalizedQuery.length;
  return `${escapeHtml(source.slice(0, start))}<mark>${escapeHtml(source.slice(start, end))}</mark>${escapeHtml(source.slice(end))}`;
}

/**
 * Renders HTML for search results.
 * @param {any[]} results
 * @param {string} query
 * @returns {string}
 */
export function renderSearchResults(results, query) {
  if (!results || !results.length) {
    return `<div class="rounded-2xl bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-400">No matching guest found.</div>`;
  }

  return results
    .map((guest, index) => {
      const mealPlan = guest.mealPlan && guest.mealPlan !== "-" ? guest.mealPlan : "";
      const packages = Array.isArray(guest.products)
        ? guest.products.filter(Boolean).join(", ")
        : String(guest.products || "");
      const mealPlanPackage = [mealPlan, packages].filter(Boolean).join(" · ") || "-";

      return `
        <button
          class="search-result flex w-full items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-left transition hover:bg-blue-50 active:scale-[0.99]"
          type="button"
          data-result-index="${index}"
        >
          <span class="min-w-[4.5rem] text-2xl font-extrabold tracking-wide text-slate-900">${highlightMatch(guest.roomNumber, query)}</span>
          <span class="min-w-0 flex-1">
            <strong class="block truncate text-sm font-bold text-slate-800">${highlightMatch(guest.fullName, query)}</strong>
            <span class="block truncate text-xs font-medium text-slate-400">${escapeHtml(mealPlanPackage)}</span>
          </span>
          <i class="fa-solid fa-chevron-right text-slate-300"></i>
        </button>
      `;
    })
    .join("");
}
