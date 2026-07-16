import {
  escapeHtml,
  normalizeSearchText,
  roomSearchVariants
} from "./utils.js";

function includesRoom(guestRoom, query) {
  const variants = roomSearchVariants(query);
  return variants.some((variant) => guestRoom.includes(variant) || variant.includes(guestRoom));
}

function fullNameValue(guest) {
  return [guest.firstName, guest.lastName].filter(Boolean).join(" ").trim();
}

export function searchGuests(guests, query, limit = 8) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) {
    return [];
  }

  return guests
    .filter((guest) => {
      const room = normalizeSearchText(guest.roomNumber);
      const firstName = normalizeSearchText(guest.firstName);
      const lastName = normalizeSearchText(guest.lastName);
      const fullName = normalizeSearchText(fullNameValue(guest));
      const confirmation = normalizeSearchText(guest.confirmationNumber);

      return (
        includesRoom(room, normalizedQuery) ||
        firstName.includes(normalizedQuery) ||
        lastName.includes(normalizedQuery) ||
        fullName.includes(normalizedQuery) ||
        confirmation.includes(normalizedQuery)
      );
    })
    .slice(0, limit);
}

export function exactRoomMatch(guests, query) {
  const variants = roomSearchVariants(query);
  return guests.find((guest) => variants.includes(guest.roomNumber.replace(/^0+/, "") || "0") || variants.includes(guest.roomNumber));
}

function highlightMatch(text, query) {
  const source = String(text ?? "");
  const normalizedSource = source.toLowerCase();
  const normalizedQuery = query.toLowerCase();
  const start = normalizedSource.indexOf(normalizedQuery);

  if (start === -1 || !query) {
    return escapeHtml(source);
  }

  const end = start + query.length;
  return `${escapeHtml(source.slice(0, start))}<mark>${escapeHtml(source.slice(start, end))}</mark>${escapeHtml(source.slice(end))}`;
}

export function renderSearchResults(results, query) {
  if (!results.length) {
    return `<div class="search-empty">No matching guest found.</div>`;
  }

  return results
    .map(
      (guest, index) => `
        <button class="search-result" type="button" data-result-index="${index}">
          <span class="search-room">${highlightMatch(guest.roomNumber, query)}</span>
          <span class="search-meta">
            <strong>${highlightMatch(guest.fullName, query)}</strong>
            <span>${highlightMatch(guest.confirmationNumber, query)}</span>
          </span>
        </button>
      `
    )
    .join("");
}
