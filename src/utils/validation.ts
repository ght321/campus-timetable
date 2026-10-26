import {
  colors,
  type Course,
  type Semester,
  type TimetableData,
} from "../models";
import { dateDay } from "./date";
import { occurs } from "./timetable";
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("数据必须为对象");
  return value as Record<string, unknown>;
}
function text(value: unknown, label: string, max = 100): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max)
    throw new Error(label + "须为1–" + max + "个字符");
  return value.trim();
}
function integer(
  value: unknown,
  label: string,
  min: number,
  max: number,
): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < min ||
    value > max
  )
    throw new Error(label + "须为" + min + "–" + max + "的整数");
  return value;
}
export function validateSemester(value: unknown): Semester {
  const s = object(value),
    startDate = text(s.startDate, "开学日期", 10);
  if (
    !Number.isFinite(dateDay(startDate)) ||
    startDate < "1900-01-01" ||
    startDate > "2100-12-31"
  )
    throw new Error("开学日期须为1900–2100年的有效日期");
  return {
    name: text(s.name, "学期名称"),
    startDate,
    totalWeeks: integer(s.totalWeeks, "教学周数", 1, 53),
    periodsPerDay: integer(s.periodsPerDay, "每日节次", 1, 24),
  };
}
export function validateCourse(value: unknown, semester: Semester): Course {
  const c = object(value);
  const start = integer(c.start, "开始节次", 1, semester.periodsPerDay);
  const end = integer(c.end, "结束节次", start, semester.periodsPerDay);
  const startWeek = integer(c.startWeek, "起始周次", 1, semester.totalWeeks);
  const endWeek = integer(
    c.endWeek,
    "结束周次",
    startWeek,
    semester.totalWeeks,
  );
  if (!["all", "odd", "even"].includes(c.parity as string))
    throw new Error("单双周规则无效");
  if (!colors.includes(c.color as Course["color"]))
    throw new Error("课程颜色无效");
  const course: Course = {
    id: text(c.id, "课程ID"),
    name: text(c.name, "课程名称"),
    teacher: text(c.teacher, "任课教师"),
    room: text(c.room, "教学地点"),
    day: integer(c.day, "星期", 1, 7),
    start,
    end,
    startWeek,
    endWeek,
    parity: c.parity as Course["parity"],
    color: c.color as Course["color"],
  };
  if (
    !Array.from(
      { length: endWeek - startWeek + 1 },
      (_, i) => startWeek + i,
    ).some((w) => occurs(course, w))
  )
    throw new Error("单双周规则导致课程没有实际教学周");
  return course;
}
export function validateData(value: unknown): TimetableData {
  const data = object(value);
  if (data.schemaVersion !== 1)
    throw new Error("不支持的schemaVersion（仅支持1）");
  const semester = validateSemester(data.semester);
  if (!Array.isArray(data.courses) || data.courses.length > 500)
    throw new Error("课程列表必须为数组，最多500条");
  const courses = data.courses.map((c, i) => {
    try {
      return validateCourse(c, semester);
    } catch (error) {
      throw new Error(
        "课程第" +
          (i + 1) +
          "条：" +
          (error instanceof Error ? error.message : "无效"),
      );
    }
  });
  if (new Set(courses.map((c) => c.id)).size !== courses.length)
    throw new Error("课程ID重复");
  return { schemaVersion: 1, semester, courses };
}
