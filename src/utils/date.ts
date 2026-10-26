import type { Semester } from "../models";
const DAY = 86_400_000;
// UTC timestamps represent calendar days; the current date is taken in the user's local timezone.
export function dateDay(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN;
  const stamp = Date.parse(value + "T00:00:00Z");
  return Number.isFinite(stamp) &&
    new Date(stamp).toISOString().slice(0, 10) === value
    ? stamp / DAY
    : NaN;
}
export function localDate(now: Date): string {
  return (
    now.getFullYear() +
    "-" +
    String(now.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(now.getDate()).padStart(2, "0")
  );
}
export function mondayDay(startDate: string): number {
  const day = dateDay(startDate);
  return day - ((new Date(day * DAY).getUTCDay() + 6) % 7);
}
export function teachingWeek(semester: Semester, today: string): number {
  return Math.floor((dateDay(today) - mondayDay(semester.startDate)) / 7) + 1;
}
export function visibleWeek(semester: Semester, today: string): number {
  return Math.min(
    semester.totalWeeks,
    Math.max(1, teachingWeek(semester, today)),
  );
}
export function weekDates(semester: Semester, week: number): string[] {
  return Array.from({ length: 7 }, (_, day) =>
    new Date((mondayDay(semester.startDate) + (week - 1) * 7 + day) * DAY)
      .toISOString()
      .slice(0, 10),
  );
}
