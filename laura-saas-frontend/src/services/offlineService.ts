export interface SyncQueueItem {
  id: string;
  method: string;
  endpoint: string;
  data: any;
  timestamp: number;
  retries: number;
}

export function initIndexedDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('laura-offline', 1);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains('syncQueue')) {
        const store = db.createObjectStore('syncQueue', { keyPath: 'id' });
        store.createIndex('status', 'status', { unique: false });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }

      if (!db.objectStoreNames.contains('bookings')) {
        const store = db.createObjectStore('bookings', { keyPath: 'id' });
        store.createIndex('clientId', 'clientId', { unique: false });
        store.createIndex('date', 'date', { unique: false });
      }

      if (!db.objectStoreNames.contains('agendamentos')) {
        const store = db.createObjectStore('agendamentos', { keyPath: 'id' });
        store.createIndex('clientId', 'clientId', { unique: false });
        store.createIndex('date', 'date', { unique: false });
      }

      if (!db.objectStoreNames.contains('clientes')) {
        db.createObjectStore('clientes', { keyPath: 'id' });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

export async function queueBooking(
  bookingData: any,
  endpoint = '/api/agendamentos'
): Promise<void> {
  const db = await initIndexedDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('syncQueue', 'readwrite');
    const store = tx.objectStore('syncQueue');
    const id = crypto.randomUUID();
    const item: SyncQueueItem = {
      id,
      method: 'POST',
      endpoint,
      data: bookingData,
      timestamp: Date.now(),
      retries: 0,
    };
    const request = store.add(item);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function getAllQueueItems(db: IDBDatabase): Promise<SyncQueueItem[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('syncQueue', 'readonly');
    const store = tx.objectStore('syncQueue');
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result as SyncQueueItem[]);
    request.onerror = () => reject(request.error);
  });
}

async function removeQueueItem(db: IDBDatabase, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('syncQueue', 'readwrite');
    const store = tx.objectStore('syncQueue');
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function incrementRetries(db: IDBDatabase, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('syncQueue', 'readwrite');
    const store = tx.objectStore('syncQueue');
    const getRequest = store.get(id);
    getRequest.onsuccess = () => {
      const item = getRequest.result as SyncQueueItem;
      if (item) {
        item.retries = (item.retries || 0) + 1;
        const putRequest = store.put(item);
        putRequest.onsuccess = () => resolve();
        putRequest.onerror = () => reject(putRequest.error);
      } else {
        resolve();
      }
    };
    getRequest.onerror = () => reject(getRequest.error);
  });
}

export async function syncQueue(apiBaseUrl: string): Promise<{ synced: number; failed: number }> {
  const db = await initIndexedDB();
  const items = await getAllQueueItems(db);
  let synced = 0;
  let failed = 0;

  for (const item of items) {
    try {
      const response = await fetch(`${apiBaseUrl}${item.endpoint}`, {
        method: item.method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(item.data),
      });
      if (response.ok) {
        await removeQueueItem(db, item.id);
        synced++;
      } else {
        await incrementRetries(db, item.id);
        failed++;
      }
    } catch {
      await incrementRetries(db, item.id);
      failed++;
    }
  }

  return { synced, failed };
}

export async function getOfflineData(storeName: 'bookings' | 'agendamentos' | 'clientes'): Promise<any[]> {
  const db = await initIndexedDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function cacheApiData(storeName: 'agendamentos' | 'clientes', data: any[]): Promise<void> {
  const db = await initIndexedDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const clearRequest = store.clear();
    clearRequest.onsuccess = () => {
      for (const item of data) {
        store.add(item);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    };
    clearRequest.onerror = () => reject(clearRequest.error);
  });
}

export async function getQueueStatus(): Promise<{ total: number; pending: number; failed: number }> {
  const db = await initIndexedDB();
  const items = await getAllQueueItems(db);
  const total = items.length;
  const pending = items.filter((i) => i.retries < 3).length;
  const failed = items.filter((i) => i.retries >= 3).length;
  return { total, pending, failed };
}

export async function clearQueue(): Promise<void> {
  const db = await initIndexedDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('syncQueue', 'readwrite');
    const store = tx.objectStore('syncQueue');
    const request = store.clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export function setupAutoSync(apiBaseUrl: string): void {
  window.addEventListener('online', () => {
    syncQueue(apiBaseUrl);
  });

  window.addEventListener('offline', () => {
    console.log('Offline mode detected');
  });
}