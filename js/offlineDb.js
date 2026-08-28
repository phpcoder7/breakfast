/**
 * Next-Gen Relational Offline Storage & Outbox Engine (IndexedDB)
 * Provides zero-latency, uncapped storage with automatic transactional synchronization.
 */

const DB_NAME = "BreakfastNextGenDB";
const DB_VERSION = 1;

let dbPromise = null;

export function getDeviceId() {
  let id = localStorage.getItem("breakfast-device-id");
  if (!id) {
    id = `dev_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem("breakfast-device-id", id);
  }
  return id;
}

export function openDatabase() {
  if (typeof indexedDB === "undefined") {
    return Promise.resolve(null);
  }

  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
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
        const outboxStore = db.createObjectStore("outbox", { keyPath: "id", autoIncrement: true });
        outboxStore.createIndex("status", "status", { unique: false });
      }

      // 4. Key-Value Metadata Store
      if (!db.objectStoreNames.contains("metadata")) {
        db.createObjectStore("metadata", { keyPath: "key" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return dbPromise;
}

export async function putCheckIn(record, brand = "KCA", serviceDate = "") {
  const db = await openDatabase();
  if (!db) return record;

  const item = {
    ...record,
    brand,
    serviceDate: serviceDate || record.serviceDate || new Date().toISOString().slice(0, 10),
    synced: record.synced !== undefined ? record.synced : 0,
    updatedAt: new Date().toISOString()
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction("checkins", "readwrite");
    const store = tx.objectStore("checkins");
    store.put(item);
    tx.oncomplete = () => resolve(item);
    tx.onerror = () => reject(tx.error);
  });
}

export async function getCheckInsFromDb(brand, serviceDate) {
  const db = await openDatabase();
  if (!db) return [];

  return new Promise((resolve, reject) => {
    const tx = db.transaction("checkins", "readonly");
    const store = tx.objectStore("checkins");
    const index = store.index("brand_date");
    const request = index.getAll(IDBKeyRange.only([brand, serviceDate]));

    request.onsuccess = () => {
      const records = request.result || [];
      records.sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
      resolve(records);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function addOutboxMutation(type, data) {
  const db = await openDatabase();
  if (!db) return null;

  const mutation = {
    type,
    data,
    timestamp: new Date().toISOString(),
    status: "pending"
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction("outbox", "readwrite");
    const store = tx.objectStore("outbox");
    const req = store.add(mutation);
    tx.oncomplete = () => resolve({ ...mutation, id: req.result });
    tx.onerror = () => reject(tx.error);
  });
}

export async function getPendingOutboxMutations() {
  const db = await openDatabase();
  if (!db) return [];

  return new Promise((resolve, reject) => {
    const tx = db.transaction("outbox", "readonly");
    const store = tx.objectStore("outbox");
    const req = store.getAll();

    req.onsuccess = () => {
      const items = (req.result || []).filter((m) => m.status === "pending");
      resolve(items);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function removeOutboxMutations(ids = []) {
  if (!ids.length) return;
  const db = await openDatabase();
  if (!db) return;

  return new Promise((resolve, reject) => {
    const tx = db.transaction("outbox", "readwrite");
    const store = tx.objectStore("outbox");
    ids.forEach((id) => store.delete(id));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearDailyDb(brand, serviceDate) {
  const db = await openDatabase();
  if (!db) return;

  return new Promise((resolve, reject) => {
    const tx = db.transaction(["checkins", "payments", "outbox"], "readwrite");
    const checkinsStore = tx.objectStore("checkins");
    const index = checkinsStore.index("brand_date");
    const req = index.getAllKeys(IDBKeyRange.only([brand, serviceDate]));

    req.onsuccess = () => {
      const keys = req.result || [];
      keys.forEach((k) => checkinsStore.delete(k));
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
