import {
  DEFAULT_VOICE_SETTINGS,
  ReadingPassage,
  TrainingSessionRecord,
  VoiceSettings,
} from '../types/voice';

const DB_NAME = 'voicetrack_db';
const DB_VERSION = 1;
const STORE_SESSIONS = 'sessions';
const STORE_PASSAGES = 'custom_passages';

const LS_SETTINGS_KEY = 'voicetrack_settings_v4';
const LS_SESSIONS_FALLBACK_KEY = 'voicetrack_sessions_fallback_v1';
const LS_PASSAGES_FALLBACK_KEY = 'voicetrack_passages_fallback_v1';

const memoryStore = new Map<string, string>();

function getStorage(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
  try {
    if (typeof window !== 'undefined' && window.localStorage && typeof window.localStorage.getItem === 'function') {
      return window.localStorage;
    }
    if (typeof localStorage !== 'undefined' && typeof localStorage.getItem === 'function') {
      return localStorage;
    }
  } catch {
    // Fallback to memory store
  }
  return {
    getItem: (key: string) => memoryStore.get(key) ?? null,
    setItem: (key: string, value: string) => {
      memoryStore.set(key, value);
    },
    removeItem: (key: string) => {
      memoryStore.delete(key);
    },
  };
}

export function clearFallbackStorage(): void {
  memoryStore.clear();
  try {
    getStorage().removeItem(LS_SETTINGS_KEY);
    getStorage().removeItem(LS_SESSIONS_FALLBACK_KEY);
    getStorage().removeItem(LS_PASSAGES_FALLBACK_KEY);
  } catch {
    // Ignore
  }
}

export interface VoiceTrackBackup {
  version: number;
  exportedAt: string;
  settings: VoiceSettings;
  sessions: TrainingSessionRecord[];
  customPassages: ReadingPassage[];
}

function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_SESSIONS)) {
          const store = db.createObjectStore(STORE_SESSIONS, { keyPath: 'id' });
          store.createIndex('createdAt', 'createdAt', { unique: false });
        }
        if (!db.objectStoreNames.contains(STORE_PASSAGES)) {
          db.createObjectStore(STORE_PASSAGES, { keyPath: 'id' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export function loadVoiceSettings(): VoiceSettings {
  try {
    const raw = getStorage().getItem(LS_SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_VOICE_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<VoiceSettings>;
    return { ...DEFAULT_VOICE_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_VOICE_SETTINGS };
  }
}

export function saveVoiceSettings(settings: VoiceSettings): void {
  try {
    getStorage().setItem(LS_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage quota errors
  }
}

export async function getAllSessions(): Promise<TrainingSessionRecord[]> {
  const db = await openDatabase();
  if (db) {
    try {
      const records = await new Promise<TrainingSessionRecord[]>((resolve, reject) => {
        const tx = db.transaction(STORE_SESSIONS, 'readonly');
        const store = tx.objectStore(STORE_SESSIONS);
        const req = store.getAll();
        req.onsuccess = () => resolve((req.result as TrainingSessionRecord[]) || []);
        req.onerror = () => reject(req.error);
      });
      return records.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    } catch {
      // Fall through to localStorage fallback
    }
  }
  try {
    const raw = getStorage().getItem(LS_SESSIONS_FALLBACK_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as TrainingSessionRecord[];
    return list.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  } catch {
    return [];
  }
}

export async function saveSessionRecord(record: TrainingSessionRecord): Promise<void> {
  const db = await openDatabase();
  if (db) {
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_SESSIONS, 'readwrite');
        tx.objectStore(STORE_SESSIONS).put(record);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch {
      // Also persist in fallback below
    }
  }
  try {
    const existing = await getAllSessionsFallbackOnly();
    const filtered = existing.filter((s) => s.id !== record.id);
    filtered.unshift(record);
    getStorage().setItem(LS_SESSIONS_FALLBACK_KEY, JSON.stringify(filtered.slice(0, 200)));
  } catch {
    // Ignore fallback errors
  }
}

async function getAllSessionsFallbackOnly(): Promise<TrainingSessionRecord[]> {
  try {
    const raw = getStorage().getItem(LS_SESSIONS_FALLBACK_KEY);
    return raw ? (JSON.parse(raw) as TrainingSessionRecord[]) : [];
  } catch {
    return [];
  }
}

export async function deleteSessionRecord(id: string): Promise<void> {
  const db = await openDatabase();
  if (db) {
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_SESSIONS, 'readwrite');
        tx.objectStore(STORE_SESSIONS).delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch {
      // Continue
    }
  }
  try {
    const existing = await getAllSessionsFallbackOnly();
    getStorage().setItem(
      LS_SESSIONS_FALLBACK_KEY,
      JSON.stringify(existing.filter((s) => s.id !== id))
    );
  } catch {
    // Ignore
  }
}

export async function getCustomPassages(): Promise<ReadingPassage[]> {
  const db = await openDatabase();
  if (db) {
    try {
      return await new Promise<ReadingPassage[]>((resolve, reject) => {
        const tx = db.transaction(STORE_PASSAGES, 'readonly');
        const req = tx.objectStore(STORE_PASSAGES).getAll();
        req.onsuccess = () => resolve((req.result as ReadingPassage[]) || []);
        req.onerror = () => reject(req.error);
      });
    } catch {
      // Fall through
    }
  }
  try {
    const raw = getStorage().getItem(LS_PASSAGES_FALLBACK_KEY);
    return raw ? (JSON.parse(raw) as ReadingPassage[]) : [];
  } catch {
    return [];
  }
}

export async function saveCustomPassage(passage: ReadingPassage): Promise<void> {
  const db = await openDatabase();
  if (db) {
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_PASSAGES, 'readwrite');
        tx.objectStore(STORE_PASSAGES).put(passage);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch {
      // Continue
    }
  }
  try {
    const existing = await getCustomPassages();
    const filtered = existing.filter((p) => p.id !== passage.id);
    filtered.push(passage);
    getStorage().setItem(LS_PASSAGES_FALLBACK_KEY, JSON.stringify(filtered));
  } catch {
    // Ignore
  }
}

export async function deleteCustomPassage(id: string): Promise<void> {
  const db = await openDatabase();
  if (db) {
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_PASSAGES, 'readwrite');
        tx.objectStore(STORE_PASSAGES).delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch {
      // Continue
    }
  }
  try {
    const existing = await getCustomPassages();
    getStorage().setItem(
      LS_PASSAGES_FALLBACK_KEY,
      JSON.stringify(existing.filter((p) => p.id !== id))
    );
  } catch {
    // Ignore
  }
}

export async function createFullBackup(): Promise<VoiceTrackBackup> {
  const settings = loadVoiceSettings();
  const sessions = await getAllSessions();
  const customPassages = await getCustomPassages();
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    settings,
    sessions,
    customPassages,
  };
}

export async function restoreFromBackup(backup: VoiceTrackBackup): Promise<{
  sessionsImported: number;
  passagesImported: number;
}> {
  if (backup.settings) {
    saveVoiceSettings({ ...DEFAULT_VOICE_SETTINGS, ...backup.settings });
  }
  let sessionsImported = 0;
  if (Array.isArray(backup.sessions)) {
    for (const session of backup.sessions) {
      if (session && session.id && session.stats) {
        await saveSessionRecord(session);
        sessionsImported++;
      }
    }
  }
  let passagesImported = 0;
  if (Array.isArray(backup.customPassages)) {
    for (const passage of backup.customPassages) {
      if (passage && passage.id && passage.title) {
        await saveCustomPassage(passage);
        passagesImported++;
      }
    }
  }
  return { sessionsImported, passagesImported };
}
