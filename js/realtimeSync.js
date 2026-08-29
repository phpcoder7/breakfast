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
  constructor({ getBrand, getServiceDate, getRoster, onRemoteUpdate, onSyncStatusChange }) {
    this.getBrand = getBrand;
    this.getServiceDate = getServiceDate;
    this.getRoster = getRoster || null;
    this.onRemoteUpdate = onRemoteUpdate || (() => {});
    this.onSyncStatusChange = onSyncStatusChange || (() => {});
    this.pollInterval = 3000; // 3s polling for instantaneous multi-device updates
    this.timer = null;
    this.isSyncing = false;
    this.lastSyncTimestamp = null;
    this.deviceId = getDeviceId();
    this._lastSyncedRosterKey = "";
    this.lastEtag = "";
    this.lastBrandAndDate = "";
  }

  start() {
    this.stop();
    openDatabase().catch((err) => console.warn("IndexedDB init notice:", err));
    this.triggerSync();

    this.timer = setInterval(() => {
      if (document.visibilityState !== "hidden") {
        this.triggerSync();
      }
    }, this.pollInterval);

    window.addEventListener("online", () => {
      this.triggerSync();
    });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        this.triggerSync();
      }
    });
    window.addEventListener("focus", () => {
      this.triggerSync();
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
      // Attempt immediate push
      this.triggerSync();
    } catch (err) {
      console.warn("Could not queue mutation offline:", err);
    }
  }

  async syncRoster(guests, fileNames = {}, filesLoaded = {}) {
    if (!Array.isArray(guests) || guests.length === 0) return;
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

      const res = await fetch("/api/sync", {
        method: "POST",
        headers,
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        this._lastSyncedRosterKey = `${brand}_${serviceDate}_${guests.length}`;
      }
    } catch (err) {
      console.warn("Roster cloud sync notice:", err);
    }
  }

  async triggerSync() {
    if (this.isSyncing) return;
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

      // 2. Proactively sync roster if local device has roster loaded and hasn't synced for this brand/date
      if (this.getRoster) {
        const localRoster = this.getRoster();
        const rosterKey = `${brand}_${serviceDate}_${localRoster?.guests?.length || 0}`;
        if (
          localRoster &&
          Array.isArray(localRoster.guests) &&
          localRoster.guests.length > 0 &&
          this._lastSyncedRosterKey !== rosterKey
        ) {
          await this.syncRoster(localRoster.guests, localRoster.fileNames, localRoster.filesLoaded);
        }
      }

      // 3. Pull latest server mutations, live table occupancy, and shared guest roster
      await this.pullRemoteState(brand, serviceDate);

      this.onSyncStatusChange({ syncing: false, success: true, timestamp: new Date() });
    } catch (error) {
      this.onSyncStatusChange({ syncing: false, error: error.message || "Offline" });
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
    const currentBrandAndDate = `${brand}_${serviceDate}`;
    if (this.lastBrandAndDate !== currentBrandAndDate) {
      this.lastBrandAndDate = currentBrandAndDate;
      this.lastEtag = "";
    }

    const token = getAuthToken();
    const headers = {};
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    if (this.lastEtag) {
      headers["If-None-Match"] = this.lastEtag;
    }

    const url = `/api/sync?brand=${encodeURIComponent(brand)}&date=${encodeURIComponent(serviceDate)}`;

    const response = await fetch(url, { headers });
    if (response.status === 304) {
      // Fast path: Zero payload parsing & zero DOM diffing needed
      return;
    }

    if (!response.ok) return;

    const newEtag = response.headers.get("ETag");
    if (newEtag) {
      this.lastEtag = newEtag;
    }

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
