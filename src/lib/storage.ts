const KEY_PREFIX = 'frp:';

function storageKey(key: string): string {
  return `${KEY_PREFIX}${key}`;
}

export function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(storageKey(key));
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** Keeps the original best-effort semantics for non-learning preferences. */
export function writeJSON<T>(key: string, value: T): void {
  try {
    localStorage.setItem(storageKey(key), JSON.stringify(value));
  } catch {
    // Ignore quota/security errors.
  }
}

/** Writes JSON and lets quota/security errors reach the caller. */
export function writeJSONStrict<T>(key: string, value: T): void {
  localStorage.setItem(storageKey(key), JSON.stringify(value));
}

export function readRaw(key: string): string | null {
  try {
    return localStorage.getItem(storageKey(key));
  } catch {
    return null;
  }
}

/** Writes an already serialized value and lets storage errors reach the caller. */
export function writeRaw(key: string, value: string): void {
  localStorage.setItem(storageKey(key), value);
}

export function removeRaw(key: string): void {
  localStorage.removeItem(storageKey(key));
}

export function appendSession<T>(key: string, value: T): void {
  const stored = readJSON<unknown>(key, []);
  const sessions = Array.isArray(stored) ? stored : [];
  sessions.push(value);
  writeJSON(key, sessions);
}
