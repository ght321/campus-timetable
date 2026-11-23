import type { Semester, TimetableData } from "../models";
import { validateData } from "../utils/validation";
export function parseImport(
  json: string,
  legacySemester: Semester,
): { data: TimetableData; legacy: boolean } {
  if (json.length > 2_000_000) throw new Error("文件过大（最多2MB）");
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    throw new Error("JSON语法错误，请检查文件");
  }
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("课表须为JSON对象");
  const raw = value as Record<string, unknown>;
  if ("schemaVersion" in raw) return { data: validateData(raw), legacy: false };
  if (
    typeof raw.school !== "string" ||
    !Number.isInteger(raw.week) ||
    !Array.isArray(raw.courses)
  )
    throw new Error("缺少schemaVersion，且不是旧版课表格式");
  const courses = raw.courses.map((value, i) => {
    if (!value || typeof value !== "object")
      throw new Error("旧版课程第" + (i + 1) + "条无效");
    const c = value as Record<string, unknown>;
    const match =
      typeof c.weeks === "string" ? /^(\d+)-(\d+)周$/.exec(c.weeks) : null;
    if (
      !match ||
      !(
        typeof c.id === "string" ||
        (typeof c.id === "number" && Number.isInteger(c.id))
      )
    )
      throw new Error("旧版课程ID或周次格式无效");
    return {
      ...c,
      id: String(c.id),
      startWeek: Number(match[1]),
      endWeek: Number(match[2]),
      parity: "all",
    };
  });
  return {
    data: validateData({ schemaVersion: 1, semester: legacySemester, courses }),
    legacy: true,
  };
}
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
