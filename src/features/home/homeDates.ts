export const HOME_RANGE_OPTIONS = [3, 7, 30] as const;
export type HomeRangeDays = (typeof HOME_RANGE_OPTIONS)[number];

export const HOME_ORDER_OPTIONS = ['newest', 'oldest'] as const;
export type HomeOrder = (typeof HOME_ORDER_OPTIONS)[number];

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function toLocalDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function getLocalToday(): string {
  return toLocalDateKey(new Date());
}

function parseDateKey(dateKey: string): Date | null {
  if (!DATE_KEY_PATTERN.test(dateKey)) return null;

  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  // Reject impossible calendar dates such as 2026-02-29.
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

export function addLocalDays(dateKey: string, days: number): string {
  const date = parseDateKey(dateKey);
  if (!date) {
    throw new Error(`Invalid date key "${dateKey}"`);
  }

  date.setDate(date.getDate() + days);
  return toLocalDateKey(date);
}

export function selectDaysInRange(
  manifestDays: readonly string[],
  rangeDays: HomeRangeDays,
  todayKey: string,
): string[] {
  const startKey = addLocalDays(todayKey, -(rangeDays - 1));
  const seen = new Set<string>();
  const selected: string[] = [];

  for (const day of manifestDays) {
    if (day < startKey || day > todayKey) continue;
    if (!parseDateKey(day)) continue;
    if (seen.has(day)) continue;

    seen.add(day);
    selected.push(day);
  }

  return selected;
}

export function sortDayKeys(
  days: readonly string[],
  order: HomeOrder,
): string[] {
  return [...days].sort((a, b) =>
    order === 'newest' ? b.localeCompare(a) : a.localeCompare(b),
  );
}
