import type { TimetableData, Course } from "../models";
export function demoData(): TimetableData {
  return {
    schemaVersion: 1,
    semester: {
      name: "2026 秋季学期",
      startDate: "2026-09-07",
      totalWeeks: 20,
      periodsPerDay: 10,
    },
    courses: [
      ["高等数学", "张老师", "教 2-101", 1, 1, 2, 1, 16, "blue"],
      ["大学英语", "李老师", "外语楼 203", 1, 3, 4, 1, 16, "green"],
      ["数据结构", "王老师", "教 3-205", 2, 1, 2, 1, 16, "purple"],
      ["线性代数", "陈老师", "教 1-302", 2, 5, 6, 1, 16, "orange"],
      ["大学物理", "赵老师", "理学院 102", 3, 3, 4, 2, 15, "blue"],
      ["程序设计", "刘老师", "计算机楼 301", 4, 5, 6, 1, 16, "purple"],
      ["体育", "周老师", "校体育场", 5, 1, 2, 1, 16, "green"],
      ["形势与政策", "孙老师", "学术报告厅", 5, 7, 8, 1, 8, "orange"],
    ].map((r, i) => ({
      id: "demo-" + (i + 1),
      name: String(r[0]),
      teacher: String(r[1]),
      room: String(r[2]),
      day: Number(r[3]),
      start: Number(r[4]),
      end: Number(r[5]),
      startWeek: Number(r[6]),
      endWeek: Number(r[7]),
      parity: "all",
      color: r[8] as Course["color"],
    })),
  };
}
