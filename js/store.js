import {
  clearStoredState,
  readStoredState,
  todayKey,
  writeStoredState
} from "./utils.js";
import { globalSearchIndex } from "./searchIndex.js";

/**
 * @typedef {Object} AppState
 * @property {any[]} guests
 * @property {any[]} checkIns
 * @property {any[]} paymentList
 * @property {{ mealPlan: boolean, packageForecast: boolean }} filesLoaded
 * @property {{ mealPlan: string, packageForecast: string }} fileNames
 * @property {{ mealPlan: any[], packageForecast: any[] }} rawData
 * @property {string} serviceDate
 */

/**
 * Centralized, observable, and transactional state store.
 */
export class AppStore {
  constructor() {
    /** @type {AppState} */
    this.state = this._loadInitialState();
    /** @type {Set<(state: AppState) => void>} */
    this.listeners = new Set();
    this._persistTimeout = null;

    // Sync search index with initial guests
    globalSearchIndex.buildIndex(this.state.guests);
  }

  /**
   * @private
   * @returns {AppState}
   */
  _loadInitialState() {
    const stored = readStoredState();
    if (stored) {
      return {
        ...stored,
        fileNames: stored.fileNames || { mealPlan: "", packageForecast: "" },
        filesLoaded: stored.filesLoaded || { mealPlan: false, packageForecast: false },
        rawData: stored.rawData || { mealPlan: [], packageForecast: [] }
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

  /**
   * Subscribes a listener to state updates.
   * @param {(state: AppState) => void} listener
   * @returns {() => void} Unsubscribe function
   */
  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Notifies all listeners and persists state debounced.
   */
  notify() {
    this.persist();
    for (const listener of this.listeners) {
      try {
        listener(this.state);
      } catch (err) {
        console.error("Store listener error:", err);
      }
    }
  }

  /**
   * Debounced persistence to localStorage.
   */
  persist() {
    if (this._persistTimeout) {
      clearTimeout(this._persistTimeout);
    }
    this._persistTimeout = setTimeout(() => {
      writeStoredState(this.state);
    }, 50);
  }

  /**
   * Sets guests and updates the search index.
   * @param {any[]} guests
   */
  setGuests(guests) {
    this.state.guests = Array.isArray(guests) ? guests : [];
    globalSearchIndex.buildIndex(this.state.guests);
    this.notify();
  }

  /**
   * Updates file report data and synced guests.
   * @param {"mealPlan" | "packageForecast"} type
   * @param {string} fileName
   * @param {any[]} rawData
   * @param {any[]} mergedGuests
   */
  setLoadedReport(type, fileName, rawData, mergedGuests) {
    this.state.filesLoaded[type] = true;
    this.state.fileNames[type] = fileName;
    this.state.rawData[type] = Array.isArray(rawData) ? rawData : [];
    this.state.guests = Array.isArray(mergedGuests) ? mergedGuests : [];
    globalSearchIndex.buildIndex(this.state.guests);
    this.notify();
  }

  /**
   * Adds a check-in record.
   * @param {any} record
   */
  addCheckIn(record) {
    this.state.checkIns.push(record);
    this.notify();
  }

  /**
   * Updates existing check-in.
   * @param {any} updatedRecord
   */
  updateCheckIn(updatedRecord) {
    const index = this.state.checkIns.findIndex((item) => item.id === updatedRecord.id);
    if (index >= 0) {
      this.state.checkIns[index] = updatedRecord;
      this.notify();
    }
  }

  /**
   * Sets the payment list.
   * @param {any[]} payments
   */
  setPayments(payments) {
    this.state.paymentList = Array.isArray(payments) ? payments : [];
    this.notify();
  }

  /**
   * Resets today's operational data on New Day.
   */
  resetNewDay() {
    clearStoredState();
    this.state.checkIns = [];
    this.state.paymentList = [];
    this.state.guests = [];
    this.state.rawData = { mealPlan: [], packageForecast: [] };
    this.state.filesLoaded = { mealPlan: false, packageForecast: false };
    this.state.fileNames = { mealPlan: "", packageForecast: "" };
    this.state.serviceDate = todayKey();

    globalSearchIndex.clear();
    this.persist();
    this.notify();
  }
}
