/**
 * Next-Gen Multi-Device Realtime Concurrency & Sync Engine
 * Synchronizes host station mutations and live table occupancy across tablets.
 */
import {
  addOutboxMutation,
  getDeviceId,
  getPendingOutboxMutations,
  openDatabase,
  removeOutboxMutations
} from "./offlineDb.js";
import { getAuthToken } from "./auth.js";

export class RealtimeSyncEngine {
  constructor({ getBrand, getServiceDate, onRemoteUpdate, onSyncStatusChange }) {
    this.getBrand = getBrand;
    this.getServiceDate = getServiceDate;
    this.onRemoteUpdate = onRemoteUpdate || (() => {});
    this.onSyncStatusChange = onSyncStatusChange || (() => {});
    this.pollInterval = 3000; // 3s polling for instantaneous multi-device updates
    this.timer = null;
    this.isSyncing = false;
    this.lastSyncTimestamp = null;
    this.deviceId = getDeviceId();
  }

  start() {
    this.stop();
    openDatabase().catch((err) => console.warn("IndexedDB init notice:", err));
    this.triggerSync();

    this.timer = setInterval(() => {
      if (document.visibilityState !== "hidden" && navigator.onLine) {
        this.triggerSync();
      }
    }, this.pollInterval);

    window.addEventListener("online", () => this.triggerSync());
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && navigator.onLine) {
        this.triggerSync();
      }
    });
    window.addEventListener("focus", () => {
      if (navigator.onLine) {
        this.triggerSync();
      }
    });
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async queueMutation(type, data) {
    try {
      await addOutboxMutation(type, data);
      // Immediately push outbox if online
      if (navigator.onLine) {
        this.triggerSync();
      }
    } catch (err) {
      console.warn("Could not queue mutation offline:", err);
    }
  }

  async syncRoster(guests, fileNames = {}, filesLoaded = {}) {
    if (!navigator.onLine || !Array.isArray(guests) || guests.length === 0) return;
    try {
      const brand = this.getBrand();
      const serviceDate = this.getServiceDate();
      if (!brand || !serviceDate) return;

      const token = getAuthToken();
      const headers = { "Content-Type": "application/json" };
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      const payload = {
        brand,
        serviceDate,
        deviceId: this.deviceId,
        roster: {
          guests,
          fileNames,
          filesLoaded
        }
      };

      await fetch("/api/sync", {
        method: "POST",
        headers,
        body: JSON.stringify(payload)
      });
    } catch (err) {
      console.warn("Roster cloud sync notice:", err);
    }
  }

  async triggerSync() {
    if (this.isSyncing || !navigator.onLine) return;
    this.isSyncing = true;
    this.onSyncStatusChange({ syncing: true });

    try {
      const brand = this.getBrand();
      const serviceDate = this.getServiceDate();
      if (!brand || !serviceDate) {
        this.isSyncing = false;
        this.onSyncStatusChange({ syncing: false });
        return;
      }

      // 1. Push pending outbox mutations
      await this.flushOutbox(brand, serviceDate);

      // 2. Pull latest server mutations & table occupancy
      await this.pullRemoteState(brand, serviceDate);

      this.onSyncStatusChange({ syncing: false, success: true, timestamp: new Date() });
    } catch (error) {
      console.warn("Realtime sync tick notice:", error.message || error);
      this.onSyncStatusChange({ syncing: false, error: error.message });
    } finally {
      this.isSyncing = false;
    }
  }

  async flushOutbox(brand, serviceDate) {
    const mutations = await getPendingOutboxMutations();
    if (!mutations || mutations.length === 0) return;

    const token = getAuthToken();
    const headers = { "Content-Type": "application/json" };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const payload = {
      brand,
      serviceDate,
      deviceId: this.deviceId,
      mutations: mutations.map((m) => ({
        type: m.type,
        data: m.data
      }))
    };

    const response = await fetch("/api/sync", {
      method: "POST",
      headers,
      body: JSON.stringify(payload)
    });

    if (response.ok) {
      const ids = mutations.map((m) => m.id);
      await removeOutboxMutations(ids);
    }
  }

  async pullRemoteState(brand, serviceDate) {
    const token = getAuthToken();
    const headers = {};
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const url = `/api/sync?brand=${encodeURIComponent(brand)}&date=${encodeURIComponent(serviceDate)}${
      this.lastSyncTimestamp ? `&since=${encodeURIComponent(this.lastSyncTimestamp)}` : ""
    }`;

    const response = await fetch(url, { headers });
    if (!response.ok) return;

    const result = await response.json();
    if (result.success) {
      if (result.serverTime) {
        this.lastSyncTimestamp = result.serverTime;
      }
      // Notify application of remote checkins, live table occupancy, and guest roster
      this.onRemoteUpdate({
        checkins: result.checkins || [],
        payments: result.payments || [],
        occupiedTables: result.occupiedTables || {},
        activeOccupantsCount: result.activeOccupantsCount || 0,
        roster: result.roster || null
      });
    }
  }
}
