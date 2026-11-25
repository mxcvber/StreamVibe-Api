export function toCalendarDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
