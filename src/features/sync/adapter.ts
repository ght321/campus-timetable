import type { Course, Semester } from "../../models";

export type LegacyCourse = {
  id?: string | number;
  name?: string;
  teacher?: string;
  room?: string;
  day?: number;
  start?: number;
  end?: number;
  weeks?: string;
  color?: string;
};

export type LegacyTimetable = {
  semester?: string;
  courses?: LegacyCourse[];
};

type WeekRange = { startWeek: number; endWeek: number };

function parseWeekRanges(value: string, totalWeeks: number, courseName: string): {
  ranges: WeekRange[];
  parity: Course["parity"];
} {
  const source = String(value || "").trim();
  const hasOdd = /单周/.test(source);
  const hasEven = /双周/.test(source);
  if (hasOdd && hasEven) {
    throw new Error("课程「" + courseName + "」的单双周信息无法唯一识别：" + source);
  }
  const parity: Course["parity"] = hasOdd ? "odd" : hasEven ? "even" : "all";
  const normalized = source
    .replace(/[－—–~～至到]/g, "-")
    .replace(/[，、；;]/g, ",");
  const tokens = Array.from(normalized.matchAll(/(\d{1,2})\s*(?:-\s*(\d{1,2}))?/g));
  if (!tokens.length) {
    throw new Error("课程「" + courseName + "」的周次无法识别，请检查教务系统周次：" + (source || "空值"));
  }
  const ranges = tokens.map((match) => ({
    startWeek: Number(match[1]),
    endWeek: Number(match[2] || match[1]),
  })).sort((a, b) => a.startWeek - b.startWeek || a.endWeek - b.endWeek);

  for (const range of ranges) {
    if (range.startWeek < 1 || range.endWeek < range.startWeek || range.endWeek > totalWeeks) {
      throw new Error(
        "课程「" + courseName + "」周次超出当前学期范围（1-" + totalWeeks + "）：" + source,
      );
    }
  }

  // Merge overlapping or adjacent intervals. Discontinuous intervals remain
  // separate Course records so that gaps in teaching weeks are never invented.
  const merged: WeekRange[] = [];
  for (const range of ranges) {
    const previous = merged[merged.length - 1];
    if (previous && range.startWeek <= previous.endWeek + 1) {
      previous.endWeek = Math.max(previous.endWeek, range.endWeek);
    } else {
      merged.push({ ...range });
    }
  }
  return { ranges: merged, parity };
}

function safeId(index: number, segmentIndex: number): string {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
  return "njust-" + index + "-" + segmentIndex + "-" + random;
}

export function convertLegacyCourses(
  legacyCourses: LegacyCourse[],
  semester: Semester,
): Course[] {
  if (!Array.isArray(legacyCourses) || legacyCourses.length === 0) {
    throw new Error("教务系统没有返回可导入的课程时段。");
  }

  const colors: Course["color"][] = ["blue", "green", "purple", "orange"];
  const converted: Course[] = [];

  legacyCourses.forEach((legacy, index) => {
    const name = String(legacy.name || "").trim();
    if (!name) throw new Error("第 " + (index + 1) + " 条课程缺少课程名称。");
    const day = Number(legacy.day);
    const start = Number(legacy.start);
    const end = Number(legacy.end);
    if (!Number.isInteger(day) || day < 1 || day > 7) {
      throw new Error("课程「" + name + "」的星期字段无效：" + String(legacy.day));
    }
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start || end > 24) {
      throw new Error(
        "课程「" + name + "」的节次超出系统支持范围（每天 1-24 节）：" + start + "-" + end,
      );
    }

    const parsed = parseWeekRanges(String(legacy.weeks || ""), semester.totalWeeks, name);
    const teacher = String(legacy.teacher || "待确认").trim().slice(0, 100) || "待确认";
    const room = String(legacy.room || "待确认").trim().slice(0, 100) || "待确认";
    const color = colors.includes(legacy.color as Course["color"])
      ? legacy.color as Course["color"]
      : colors[index % colors.length];

    parsed.ranges.forEach((range, segmentIndex) => {
      converted.push({
        id: safeId(index + 1, segmentIndex + 1),
        name: name.slice(0, 100),
        teacher,
        room,
        day,
        start,
        end,
        startWeek: range.startWeek,
        endWeek: range.endWeek,
        parity: parsed.parity,
        color,
      });
    });
  });

  if (converted.length > 500) throw new Error("转换后的课程时段超过 500 条，请检查教务系统数据。");
  return converted;
}
