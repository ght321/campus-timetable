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
import {
  validateCourse,
  validateData,
  validateSemester,
} from "../../src/utils/validation";
import {
  saveCourse,
  deleteCourse,
  changeSemester,
} from "../../src/features/courses/service";
import {
  loadData,
  saveData,
  STORAGE_KEY,
  type StoragePort,
} from "../../src/services/storage";
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
describe("validation and CRUD", () => {
  it("adds, edits, deletes without mutating inputs", () => {
    const next = saveCourse(data, course({ id: "new", day: 7 }), "add");
    expect(next.courses).toHaveLength(9);
    const edited = saveCourse(
      next,
      course({ id: "new", day: 7, name: "修改课程" }),
      "edit",
    );
    expect(edited.courses.find((c) => c.id === "new")?.name).toBe("修改课程");
    expect(deleteCourse(edited, "new").courses).toHaveLength(8);
    expect(data.courses).toHaveLength(8);
  });
  it("requires explicit conflict permission", () => {
    expect(() => saveCourse(data, course({ id: "new" }), "add")).toThrow(
      "确认",
    );
    expect(
      saveCourse(data, course({ id: "new" }), "add", true).courses,
    ).toHaveLength(9);
  });
  it("rejects duplicate IDs and missing edits or deletes", () => {
    expect(() => saveCourse(data, base, "add")).toThrow("ID");
    expect(() => saveCourse(data, course({ id: "missing" }), "edit")).toThrow(
      "不存在",
    );
    expect(() => deleteCourse(data, "missing")).toThrow("不存在");
  });
  it.each([
    { name: " " },
    { day: 0 },
    { day: 8 },
    { start: 0 },
    { start: 3, end: 2 },
    { end: 11 },
    { startWeek: 0 },
    { endWeek: 21 },
    { startWeek: 4, endWeek: 3 },
    { color: "red" },
    { parity: "weekly" },
    { start: 1.5 },
    { teacher: "" },
    { room: "" },
  ])("rejects malformed course %j", (patch) =>
    expect(() =>
      validateCourse({ ...base, ...patch }, data.semester),
    ).toThrow(),
  );
  it("rejects parity with no actual occurrences", () =>
    expect(() =>
      validateCourse(
        course({ startWeek: 2, endWeek: 2, parity: "odd" }),
        data.semester,
      ),
    ).toThrow("没有实际"));
  it("prevents shrinking semester past existing courses", () => {
    expect(() =>
      changeSemester(data, { ...data.semester, totalWeeks: 8 }),
    ).toThrow("课程第");
    expect(() =>
      changeSemester(data, { ...data.semester, periodsPerDay: 6 }),
    ).toThrow();
  });
  it("allows semester name, date and extension changes", () =>
    expect(
      changeSemester(data, { ...data.semester, name: "新学期", totalWeeks: 24 })
        .semester.totalWeeks,
    ).toBe(24));
  it("rejects invalid semester boundaries", () => {
    expect(() =>
      validateSemester({ ...data.semester, startDate: "2026-02-30" }),
    ).toThrow();
    expect(() =>
      validateSemester({ ...data.semester, totalWeeks: 0 }),
    ).toThrow();
    expect(() =>
      validateSemester({ ...data.semester, periodsPerDay: 25 }),
    ).toThrow();
  });
  it("rejects oversized lists and duplicate IDs", () => {
    expect(() => validateData({ ...data, courses: [base, base] })).toThrow(
      "ID重复",
    );
    expect(() =>
      validateData({ ...data, courses: Array(501).fill(base) }),
    ).toThrow("500");
  });
});
describe("storage recovery", () => {
  const storage = (raw: string | null): StoragePort => ({
    getItem: () => raw,
    setItem: (_key, value) => {
      raw = value;
    },
  });
  it("initializes examples only when key is absent", () =>
    expect(loadData(storage(null))).toEqual({
      data,
      warning: "",
      writable: true,
    }));
  it("preserves a valid empty timetable", () =>
    expect(
      loadData(storage(JSON.stringify({ ...data, courses: [] }))).data.courses,
    ).toEqual([]));
  it.each([
    "broken",
    "null",
    '{"schemaVersion":99}',
    JSON.stringify({ ...data, courses: [{ ...base, day: 9 }] }),
  ])("recovers malformed storage without overwriting it", (raw) => {
    let written = false;
    const result = loadData({
      getItem: () => raw,
      setItem: () => {
        written = true;
      },
    });
    expect(result.data).toEqual(data);
    expect(result.writable).toBe(false);
    expect(result.warning).not.toBe("");
    expect(written).toBe(false);
  });
  it("handles denied storage reads", () =>
    expect(
      loadData({
        getItem: () => {
          throw new Error("denied");
        },
        setItem: () => {},
      }).writable,
    ).toBe(false));
  it("writes and restores valid changes", () => {
    const s = storage(null);
    saveData(s, { ...data, courses: [] });
    expect(loadData(s).data.courses).toEqual([]);
    expect(STORAGE_KEY).toBe("campus-timetable:v1");
  });
  it("reports quota failure", () =>
    expect(() =>
      saveData(
        {
          getItem: () => null,
          setItem: () => {
            throw new Error("quota");
          },
        },
        data,
      ),
    ).toThrow("本地保存失败"));
});
