import type { TimetableData } from "../models";
import { validateData } from "../utils/validation";
export function serialize(data: TimetableData): string {
  return JSON.stringify(validateData(data), null, 2);
}
export function downloadData(data: TimetableData): void {
  const url = URL.createObjectURL(
    new Blob([serialize(data)], { type: "application/json;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = "campus-timetable.json";
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
