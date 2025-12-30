import { Session, MediaItem } from '../types';

const DB_NAME = 'SessionCamDB';
const DB_VERSION = 2; 
const STORE_SESSIONS = 'sessions';
const STORE_MEDIA = 'media';

let dbPromise: Promise<IDBDatabase> | null = null;

const openDB = (): Promise<IDBDatabase> => {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      
      if (!db.objectStoreNames.contains(STORE_SESSIONS)) {
        db.createObjectStore(STORE_SESSIONS, { keyPath: 'id' });
      }
      
      if (!db.objectStoreNames.contains(STORE_MEDIA)) {
        const mediaStore = db.createObjectStore(STORE_MEDIA, { keyPath: 'id' });
        mediaStore.createIndex('sessionId', 'sessionId', { unique: false });
      }
    };
  });

  return dbPromise;
};

export const createSession = async (name: string): Promise<Session> => {
  const db = await openDB();
  const now = Date.now();
  const session: Session = {
    id: crypto.randomUUID(),
    name,
    createdAt: now,
    lastModified: now,
    itemCount: 0,
  };
  
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_SESSIONS, 'readwrite');
    tx.objectStore(STORE_SESSIONS).add(session);
    tx.oncomplete = () => resolve(session);
    tx.onerror = () => reject(tx.error);
  });
};

export const getSessions = async (): Promise<Session[]> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_SESSIONS, 'readonly');
    const request = tx.objectStore(STORE_SESSIONS).getAll();
    request.onsuccess = () => {
      const sessions = request.result as Session[];
      // Sort by lastModified desc
      resolve(sessions.sort((a, b) => b.lastModified - a.lastModified));
    };
    request.onerror = () => reject(request.error);
  });
};

export const deleteSession = async (id: string): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_SESSIONS, STORE_MEDIA], 'readwrite');
    
    tx.objectStore(STORE_SESSIONS).delete(id);

    const mediaStore = tx.objectStore(STORE_MEDIA);
    const index = mediaStore.index('sessionId');
    const request = index.getAllKeys(id);
    
    request.onsuccess = () => {
      const keys = request.result;
      keys.forEach(key => mediaStore.delete(key));
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

export const addMediaItem = async (item: MediaItem): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_SESSIONS, STORE_MEDIA], 'readwrite');
    
    // Check for existing items to determine order
    const mediaStore = tx.objectStore(STORE_MEDIA);
    const index = mediaStore.index('sessionId');
    const countReq = index.count(item.sessionId);

    countReq.onsuccess = () => {
        const count = countReq.result;
        item.order = count; // Add to end
        mediaStore.add(item);
    };
    
    // Update session meta
    const sessionStore = tx.objectStore(STORE_SESSIONS);
    const sessionReq = sessionStore.get(item.sessionId);
    
    sessionReq.onsuccess = () => {
      const session = sessionReq.result as Session;
      if (session) {
        session.itemCount += 1;
        session.lastModified = Date.now();
        sessionStore.put(session);
      }
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

export const getMediaForSession = async (sessionId: string): Promise<MediaItem[]> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_MEDIA, 'readonly');
    const index = tx.objectStore(STORE_MEDIA).index('sessionId');
    const request = index.getAll(sessionId);
    
    request.onsuccess = () => {
      const items = request.result as MediaItem[];
      // Sort by order, fallback to createdAt
      resolve(items.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.createdAt - b.createdAt));
    };
    request.onerror = () => reject(request.error);
  });
};

export const getMediaItem = async (id: string): Promise<MediaItem | undefined> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_MEDIA, 'readonly');
        const request = tx.objectStore(STORE_MEDIA).get(id);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
};

export const updateMediaItem = async (item: MediaItem): Promise<void> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction([STORE_MEDIA, STORE_SESSIONS], 'readwrite');
        
        // Update Media
        tx.objectStore(STORE_MEDIA).put(item);
        
        // Update Session Modified Date
        const sessionStore = tx.objectStore(STORE_SESSIONS);
        const sessionReq = sessionStore.get(item.sessionId);
        sessionReq.onsuccess = () => {
            const session = sessionReq.result as Session;
            if (session) {
                session.lastModified = Date.now();
                sessionStore.put(session);
            }
        };

        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
};

export const updateMediaItems = async (items: MediaItem[]): Promise<void> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction([STORE_MEDIA], 'readwrite');
        const store = tx.objectStore(STORE_MEDIA);
        
        items.forEach(item => store.put(item));
        
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
};