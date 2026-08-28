import {
  escapeHtml,
  normalizeRoom,
  normalizeSearchText,
  roomSearchVariants
} from "./utils.js";

/**
 * High-performance in-memory search index for guest records.
 * Optimized for O(1) exact lookups and sub-millisecond searches on tablets.
 */
export class GuestSearchIndex {
  constructor() {
    /** @type {any[]} */
    this.guests = [];
    /** @type {Map<string, any>} */
    this.exactRoomMap = new Map();
    /** @type {Map<string, any>} */
    this.confirmationMap = new Map();
    /** @type {Map<string, any[]>} */
    this.tokenIndex = new Map();
  }

  /**
   * Rebuilds the search index with the provided guest array.
   * @param {any[]} guests
   */
  buildIndex(guests) {
    this.clear();
    if (!Array.isArray(guests)) {
      return;
    }

    this.guests = guests;
    const len = guests.length;

    for (let i = 0; i < len; i++) {
      const guest = guests[i];
      if (!guest) continue;

      // 1. Index room variants
      const room = normalizeRoom(guest.roomNumber);
      if (room) {
        const roomLower = room.toLowerCase();
        this.exactRoomMap.set(roomLower, guest);
        this._addToken(roomLower, guest);

        const stripped = (room.replace(/^0+/, "") || "0").toLowerCase();
        if (stripped !== roomLower) {
          this.exactRoomMap.set(stripped, guest);
          this._addToken(stripped, guest);
        }
      }

      // 2. Index confirmation numbers
      const conf = normalizeSearchText(guest.confirmationNumber);
      if (conf) {
        this.confirmationMap.set(conf, guest);
        this._addToken(conf, guest);
      }

      // 3. Index name tokens (fast word split)
      const firstName = guest.firstName;
      if (firstName) {
        const fn = normalizeSearchText(firstName);
        this._addToken(fn, guest);
      }
      const lastName = guest.lastName;
      if (lastName) {
        const ln = normalizeSearchText(lastName);
        this._addToken(ln, guest);
      }
      const fullName = guest.fullName;
      if (fullName) {
        const words = normalizeSearchText(fullName).split(" ");
        for (let w = 0; w < words.length; w++) {
          const word = words[w];
          if (word.length > 1) {
            this._addToken(word, guest);
          }
        }
      }
    }
  }

  /**
   * @private
   * @param {string} token
   * @param {any} guest
   */
  _addToken(token, guest) {
    if (!token) return;
    let list = this.tokenIndex.get(token);
    if (!list) {
      list = [];
      this.tokenIndex.set(token, list);
    }
    list.push(guest);
  }

  /**
   * O(1) exact room match.
   * @param {string} query
   * @returns {any | null}
   */
  exactRoomMatch(query) {
    const variants = roomSearchVariants(query);
    for (let i = 0; i < variants.length; i++) {
      const match = this.exactRoomMap.get(variants[i].toLowerCase());
      if (match) {
        return match;
      }
    }
    return null;
  }

  /**
   * Fast multi-field search with scoring and ranking.
   * @param {string} query
   * @param {number} [limit=8]
   * @returns {any[]}
   */
  search(query, limit = 8) {
    const needle = normalizeSearchText(query);
    if (!needle) {
      return [];
    }

    /** @type {Map<any, number>} */
    const scoredResults = new Map();

    // 1. Exact room match gets top priority score
    const exactRoom = this.exactRoomMatch(needle);
    if (exactRoom) {
      scoredResults.set(exactRoom, 100);
    }

    // 2. Exact confirmation match
    const exactConf = this.confirmationMap.get(needle);
    if (exactConf) {
      scoredResults.set(exactConf, (scoredResults.get(exactConf) || 0) + 90);
    }

    // 3. Exact word / token index match
    const indexedMatches = this.tokenIndex.get(needle);
    if (indexedMatches) {
      for (let i = 0; i < indexedMatches.length; i++) {
        const guest = indexedMatches[i];
        const currentScore = scoredResults.get(guest) || 0;
        scoredResults.set(guest, currentScore + 60);
      }
    }

    // 4. Token prefix match
    if (scoredResults.size < limit) {
      for (const [token, list] of this.tokenIndex.entries()) {
        if (token.startsWith(needle) || (token.length > 2 && needle.startsWith(token))) {
          for (let i = 0; i < list.length; i++) {
            const guest = list[i];
            const currentScore = scoredResults.get(guest) || 0;
            scoredResults.set(guest, currentScore + 40);
          }
          if (scoredResults.size >= limit * 2) {
            break;
          }
        }
      }
    }

    // 5. Fallback scan if needed
    if (scoredResults.size < limit) {
      for (let i = 0; i < this.guests.length; i++) {
        const guest = this.guests[i];
        if (!guest || scoredResults.has(guest)) continue;

        const room = normalizeSearchText(guest.roomNumber);
        const name = normalizeSearchText(guest.fullName || `${guest.firstName || ""} ${guest.lastName || ""}`);

        if (room.includes(needle)) {
          scoredResults.set(guest, 30);
        } else if (name.includes(needle)) {
          scoredResults.set(guest, 20);
        }

        if (scoredResults.size >= limit * 2) {
          break;
        }
      }
    }

    return Array.from(scoredResults.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([guest]) => guest);
  }

  clear() {
    this.guests = [];
    this.exactRoomMap.clear();
    this.confirmationMap.clear();
    this.tokenIndex.clear();
  }
}

// Global default search index singleton
export const globalSearchIndex = new GuestSearchIndex();
