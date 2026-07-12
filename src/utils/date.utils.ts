/** Parse YYYY-MM-DD (or Date) as local calendar date — avoids UTC day-shift. */
export function parseLocalDateInput(value: string | Date): Date {
  if (typeof value === 'string') {
    const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) {
      return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    }
  }
  const d = new Date(value);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** YYYY-MM-DD in local calendar. */
export function toCollectionDay(value: string | Date): string {
  const d = parseLocalDateInput(value);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function getTodayLocalISO(): string {
  return toCollectionDay(new Date());
}

export function getDayRange(date: Date | string) {
  const local = parseLocalDateInput(date);
  const dayStart = new Date(local);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(local);
  dayEnd.setHours(23, 59, 59, 999);
  return { dayStart, dayEnd };
}

export function getDateRangeBounds(fromDate?: string | Date, toDate?: string | Date) {
  const range: { gte?: Date; lte?: Date } = {};
  if (fromDate) {
    range.gte = getDayRange(fromDate).dayStart;
  }
  if (toDate) {
    range.lte = getDayRange(toDate).dayEnd;
  }
  return range;
}
