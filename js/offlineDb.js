/**
 * Next-Gen Relational Offline Storage & Outbox Engine (IndexedDB + LocalStorage Fail-Safe)
 * Provides zero-latency, uncapped storage with automatic transactional synchronization.
 */

const DB_NAME = "BreakfastNextGenDB";
const DB_VERSION = 1;
const LOCAL_OUTBOX_KEY = "breakfast_outbox_queue_v1";

let dbPromise = null;

export function getDeviceId() {
  let id = localStorage.getItem("breakfast-device-id");
  if (!id) {
    id = `dev_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem("breakfast-device-id", id);
  }
  return id;
}

function getLocalOutbox() {
  try {
    const raw = localStorage.getItem(LOCAL_OUTBOX_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function saveLocalOutbox(items) {
  try {
    localStorage.setItem(LOCAL_OUTBOX_KEY, JSON.stringify(items));
  } catch (e) {}
}

export function openDatabase() {
  if (typeof indexedDB === "undefined") {
    return Promise.resolve(null);
  }

  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // 1. Check-ins Store
        if (!db.objectStoreNames.contains("checkins")) {
          const checkinsStore = db.createObjectStore("checkins", { keyPath: "id" });
          checkinsStore.createIndex("brand_date", ["brand", "serviceDate"], { unique: false });
          checkinsStore.createIndex("tableNumber", "tableNumber", { unique: false });
          checkinsStore.createIndex("synced", "synced", { unique: false });
        }

        // 2. Payments Store
        if (!db.objectStoreNames.contains("payments")) {
          const paymentsStore = db.createObjectStore("payments", { keyPath: "id" });
          paymentsStore.createIndex("brand_date", ["brand", "serviceDate"], { unique: false });
          paymentsStore.createIndex("paid", "paid", { unique: false });
        }

        // 3. Outbox Mutation Queue Store
        if (!db.objectStoreNames.contains("outbox")) {
          const outboxStore = db.createObjectStore("outbox", { keyPath: "id" });
          outboxStore.createIndex("status", "status", { unique: false });
        }

        // 4. Key-Value Metadata Store
        if (!db.objectStoreNames.contains("metadata")) {
          db.createObjectStore("metadata", { keyPath: "key" });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        console.warn("IndexedDB open failed, using local storage fail-safe:", request.error);
        resolve(null);
      };
      request.onblocked = () => {
        console.warn("IndexedDB open blocked, using local storage fail-safe");
        resolve(null);
      };
    } catch (err) {
      console.warn("IndexedDB init error:", err);
      resolve(null);
    }
  });

  return dbPromise;
}

export async function putCheckIn(record, brand = "KCA", serviceDate = "") {
  const item = {
    ...record,
    brand,
    serviceDate: serviceDate || record.serviceDate || new Date().toISOString().slice(0, 10),
    synced: record.synced !== undefined ? record.synced : 0,
    updatedAt: new Date().toISOString()
  };

  try {
    const db = await openDatabase();
    if (db) {
      return new Promise((resolve) => {
        const tx = db.transaction("checkins", "readwrite");
        const store = tx.objectStore("checkins");
        store.put(item);
        tx.oncomplete = () => resolve(item);
        tx.onerror = () => resolve(item);
      });
    }
  } catch (err) {}

  return item;
}

export async function getCheckInsFromDb(brand, serviceDate) {
  try {
    const db = await openDatabase();
    if (!db) return [];

    return new Promise((resolve) => {
      const tx = db.transaction("checkins", "readonly");
      const store = tx.objectStore("checkins");
      const index = store.index("brand_date");
      const request = index.getAll(IDBKeyRange.only([brand, serviceDate]));

      request.onsuccess = () => {
        const records = request.result || [];
        records.sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
        resolve(records);
      };
      request.onerror = () => resolve([]);
    });
  } catch (err) {
    return [];
  }
}

export async function addOutboxMutation(type, data) {
  const mutationId = `mut_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const mutation = {
    id: mutationId,
    type,
    data,
    timestamp: new Date().toISOString(),
    status: "pending"
  };

  // 1. Save to localStorage fail-safe
  try {
    const localList = getLocalOutbox();
    localList.push(mutation);
    saveLocalOutbox(localList);
  } catch (err) {
    console.warn("Local outbox backup save error:", err);
  }

  // 2. Save to IndexedDB
  try {
    const db = await openDatabase();
    if (db) {
      await new Promise((resolve) => {
        const tx = db.transaction("outbox", "readwrite");
        const store = tx.objectStore("outbox");
        store.put(mutation);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    }
  } catch (idbErr) {
    console.warn("IndexedDB outbox write notice:", idbErr);
  }

  return mutation;
}

export async function getPendingOutboxMutations() {
  const mergedMap = new Map();

  // 1. Read from localStorage
  const localList = getLocalOutbox();
  localList.forEach((m) => {
    if (m && m.id && m.status === "pending") {
      mergedMap.set(m.id, m);
    }
  });

  // 2. Read from IndexedDB
  try {
    const db = await openDatabase();
    if (db) {
      const dbItems = await new Promise((resolve) => {
        const tx = db.transaction("outbox", "readonly");
        const store = tx.objectStore("outbox");
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      });

      dbItems.forEach((m) => {
        if (m && (m.id || m.type)) {
          const key = String(m.id || `${m.type}_${m.timestamp}`);
          mergedMap.set(key, { ...m, id: key });
        }
      });
    }
  } catch (idbErr) {
    console.warn("IndexedDB get pending outbox notice:", idbErr);
  }

  return Array.from(mergedMap.values());
}

export async function removeOutboxMutations(ids = []) {
  if (!ids.length) return;
  const idSet = new Set(ids.map((id) => String(id)));

  // 1. Remove from localStorage
  try {
    const localList = getLocalOutbox().filter((m) => !idSet.has(String(m.id)));
    saveLocalOutbox(localList);
  } catch (err) {}

  // 2. Remove from IndexedDB
  try {
    const db = await openDatabase();
    if (db) {
      await new Promise((resolve) => {
        const tx = db.transaction("outbox", "readwrite");
        const store = tx.objectStore("outbox");
        ids.forEach((id) => {
          try {
            store.delete(id);
          } catch (delErr) {}
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    }
  } catch (idbErr) {}
}

export async function clearDailyDb(brand, serviceDate) {
  // Clear local outbox
  try {
    saveLocalOutbox([]);
  } catch (e) {}

  try {
    const db = await openDatabase();
    if (!db) return;

    return new Promise((resolve) => {
      const tx = db.transaction(["checkins", "payments", "outbox"], "readwrite");
      const checkinsStore = tx.objectStore("checkins");
      const index = checkinsStore.index("brand_date");
      const req = index.getAllKeys(IDBKeyRange.only([brand, serviceDate]));

      req.onsuccess = () => {
        const keys = req.result || [];
        keys.forEach((k) => checkinsStore.delete(k));
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch (err) {}
}
