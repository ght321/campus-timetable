import type { Course } from "../../models";
import { occurs } from "../../utils/timetable";
export function statistics(courses: Course[], week: number) {
  const active = courses.filter((c) => occurs(c, week));
  const periods = Array.from({ length: 7 }, (_, i) =>
    active
      .filter((c) => c.day === i + 1)
      .reduce((sum, c) => sum + c.end - c.start + 1, 0),
  );
  const max = Math.max(...periods);
  return {
    count: active.length,
    hours: periods.reduce((a, b) => a + b, 0),
    days: periods.filter(Boolean).length,
    busiest: max ? periods.flatMap((v, i) => (v === max ? [i + 1] : [])) : [],
    total: courses.length,
  };
}
