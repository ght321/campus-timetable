import type { Course, TimetableData, Semester } from "../../models";
import { validateCourse, validateData } from "../../utils/validation";
import { conflicts } from "../../utils/timetable";
export function saveCourse(
  data: TimetableData,
  input: Course,
  mode: "add" | "edit",
  allowConflict = false,
): TimetableData {
  const course = validateCourse(input, data.semester),
    exists = data.courses.some((c) => c.id === course.id);
  if (mode === "add" && exists) throw new Error("课程ID已存在");
  if (mode === "edit" && !exists) throw new Error("待编辑课程不存在");
  if (!allowConflict && conflicts(course, data.courses).length)
    throw new Error("请先确认课程冲突");
  return validateData({
    ...data,
    courses:
      mode === "add"
        ? [...data.courses, course]
        : data.courses.map((c) => (c.id === course.id ? course : c)),
  });
}
export function deleteCourse(data: TimetableData, id: string): TimetableData {
  if (!data.courses.some((c) => c.id === id)) throw new Error("课程不存在");
  return { ...data, courses: data.courses.filter((c) => c.id !== id) };
}
export function changeSemester(
  data: TimetableData,
  semester: Semester,
): TimetableData {
  return validateData({ ...data, semester });
}
