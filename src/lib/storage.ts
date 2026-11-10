const KEY_PREFIX = 'frp:';

export function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`${KEY_PREFIX}${key}`);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeJSON<T>(key: string, value: T): void {
  try {
    localStorage.setItem(`${KEY_PREFIX}${key}`, JSON.stringify(value));
  } catch {
    // Ignore quota/security errors.
  }
}

export function appendSession<T>(key: string, value: T): void {
  const stored = readJSON<unknown>(key, []);
  const sessions = Array.isArray(stored) ? stored : [];
  sessions.push(value);
  writeJSON(key, sessions);
}
