export const colors = ["blue", "green", "purple", "orange"] as const;
export type Course = {
  id: string;
  name: string;
  teacher: string;
  room: string;
  day: number;
  start: number;
  end: number;
  startWeek: number;
  endWeek: number;
  parity: "all" | "odd" | "even";
  color: (typeof colors)[number];
};
export type Semester = {
  name: string;
  startDate: string;
  totalWeeks: number;
  periodsPerDay: number;
};
export type TimetableData = {
  schemaVersion: 1;
  semester: Semester;
  courses: Course[];
};
export const days = ["一", "二", "三", "四", "五", "六", "日"];
