import { describe, it, expect } from "vitest";
import { demoData } from "../../src/data/demo";
import {
  dateDay,
  localDate,
  teachingWeek,
  visibleWeek,
  weekDates,
} from "../../src/utils/date";
import { occurs, conflicts, courseLayout } from "../../src/utils/timetable";
import type { Course } from "../../src/models";
const data = demoData(),
  base = data.courses[0];
const course = (patch: Partial<Course> = {}): Course => ({ ...base, ...patch });
describe("calendar and teaching weeks", () => {
  it("uses inclusive ordinary week boundaries", () => {
    expect([0, 1, 16, 17].map((w) => occurs(base, w))).toEqual([
      false,
      true,
      true,
      false,
    ]);
  });
  it("uses absolute teaching-week parity", () => {
    expect(
      [1, 2, 3, 4].map((w) =>
        occurs(course({ startWeek: 2, parity: "odd" }), w),
      ),
    ).toEqual([false, false, true, false]);
    expect(occurs(course({ parity: "even" }), 2)).toBe(true);
  });
  it("rejects fractional weeks", () => expect(occurs(base, 1.5)).toBe(false));
  it("calculates across year boundary", () => {
    const s = { ...data.semester, startDate: "2026-12-28" };
    expect(teachingWeek(s, "2027-01-04")).toBe(2);
    expect(weekDates(s, 1)[6]).toBe("2027-01-03");
  });
  it("anchors a midweek opening date to Monday", () => {
    const s = { ...data.semester, startDate: "2026-09-09" };
    expect(weekDates(s, 1)[0]).toBe("2026-09-07");
    expect(teachingWeek(s, "2026-09-13")).toBe(1);
    expect(teachingWeek(s, "2026-09-14")).toBe(2);
  });
  it("keeps out-of-term actual weeks separate from clamped navigation", () => {
    expect(teachingWeek(data.semester, "2026-09-06")).toBe(0);
    expect(visibleWeek(data.semester, "2026-09-06")).toBe(1);
    expect(visibleWeek(data.semester, "2027-08-01")).toBe(20);
  });
  it("validates leap days and invalid calendar dates", () => {
    expect(Number.isFinite(dateDay("2024-02-29"))).toBe(true);
    expect(Number.isNaN(dateDay("2026-02-29"))).toBe(true);
    expect(Number.isNaN(dateDay("2026-13-01"))).toBe(true);
  });
  it("uses local calendar components for today", () =>
    expect(localDate(new Date(2026, 0, 2, 23, 59))).toBe("2026-01-02"));
});
describe("conflicts and visual placement", () => {
  it("detects inclusive period overlap and exact intersecting weeks", () =>
    expect(
      conflicts(
        course({
          id: "new",
          start: 2,
          end: 3,
          startWeek: 2,
          endWeek: 6,
          parity: "even",
        }),
        [base],
      )[0].weeks,
    ).toEqual([2, 4, 6]));
  it("does not conflict on adjacent periods", () =>
    expect(conflicts(course({ id: "new", start: 3, end: 4 }), [base])).toEqual(
      [],
    ));
  it("does not conflict on different weekdays", () =>
    expect(conflicts(course({ id: "new", day: 2 }), [base])).toEqual([]));
  it("does not conflict on different week ranges", () =>
    expect(
      conflicts(course({ id: "new", startWeek: 17, endWeek: 20 }), [base]),
    ).toEqual([]));
  it("does not conflict between odd and even weeks", () =>
    expect(
      conflicts(course({ id: "new", parity: "odd" }), [
        course({ parity: "even" }),
      ]),
    ).toEqual([]));
  it("excludes the same course during editing", () =>
    expect(conflicts(base, [base])).toEqual([]));
  it("places connected overlaps in separate lanes without hiding courses", () => {
    const layout = courseLayout([
      base,
      course({ id: "b", start: 2, end: 3 }),
      course({ id: "c", start: 4, end: 5 }),
    ]);
    expect(layout.get(base.id)).toEqual({ lane: 0, lanes: 2 });
    expect(layout.get("b")).toEqual({ lane: 1, lanes: 2 });
    expect(layout.get("c")).toEqual({ lane: 0, lanes: 1 });
  });
});
