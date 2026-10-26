import type { Course } from "../models";
export function occurs(course: Course, week: number): boolean {
  return (
    Number.isInteger(week) &&
    week >= course.startWeek &&
    week <= course.endWeek &&
    (course.parity === "all" || week % 2 === (course.parity === "odd" ? 1 : 0))
  );
}
export function conflicts(
  candidate: Course,
  courses: Course[],
): { course: Course; weeks: number[] }[] {
  return courses
    .filter(
      (c) =>
        c.id !== candidate.id &&
        c.day === candidate.day &&
        c.start <= candidate.end &&
        candidate.start <= c.end,
    )
    .map((course) => ({
      course,
      weeks: Array.from(
        {
          length: Math.max(
            0,
            Math.min(course.endWeek, candidate.endWeek) -
              Math.max(course.startWeek, candidate.startWeek) +
              1,
          ),
        },
        (_, i) => i + Math.max(course.startWeek, candidate.startWeek),
      ).filter((w) => occurs(course, w) && occurs(candidate, w)),
    }))
    .filter((item) => item.weeks.length > 0);
}
export function weekLabel(c: Course): string {
  return (
    c.startWeek +
    "–" +
    c.endWeek +
    "周 · " +
    { all: "全部周", odd: "单周", even: "双周" }[c.parity]
  );
}
// Partition interval groups so every overlapping course remains independently reachable.
export function courseLayout(
  courses: Course[],
): Map<string, { lane: number; lanes: number }> {
  const result = new Map<string, { lane: number; lanes: number }>();
  for (let day = 1; day <= 7; day++) {
    const sorted = courses
      .filter((c) => c.day === day)
      .sort(
        (a, b) =>
          a.start - b.start || a.end - b.end || a.id.localeCompare(b.id),
      );
    let group: Course[] = [],
      maxEnd = 0;
    const flush = () => {
      const ends: number[] = [];
      for (const c of group) {
        let lane = ends.findIndex((end) => end < c.start);
        if (lane < 0) lane = ends.length;
        ends[lane] = c.end;
        result.set(c.id, { lane, lanes: 0 });
      }
      for (const c of group) result.get(c.id)!.lanes = ends.length;
    };
    for (const c of sorted) {
      if (c.start > maxEnd) {
        flush();
        group = [];
      }
      group.push(c);
      maxEnd = Math.max(maxEnd, c.end);
    }
    flush();
  }
  return result;
}
