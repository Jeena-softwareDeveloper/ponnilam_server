export function getDayRange(date: Date) {
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(date);
  dayEnd.setHours(23, 59, 59, 999);
  return { dayStart, dayEnd };
}

export function getDateRangeBounds(fromDate?: string | Date, toDate?: string | Date) {
  const range: { gte?: Date; lte?: Date } = {};
  if (fromDate) {
    const start = new Date(fromDate);
    start.setHours(0, 0, 0, 0);
    range.gte = start;
  }
  if (toDate) {
    const end = new Date(toDate);
    end.setHours(23, 59, 59, 999);
    range.lte = end;
  }
  return range;
}
