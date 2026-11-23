import { useState } from "react";
import { colors, days, type Course, type Semester } from "../../models";
import { validateCourse } from "../../utils/validation";
import { conflicts } from "../../utils/timetable";
import { Modal } from "../Common/Modal";
export function CourseForm({
  initial,
  courses,
  semester,
  onClose,
  onSave,
}: {
  initial: Course;
  courses: Course[];
  semester: Semester;
  onClose: () => void;
  onSave: (course: Course, allow: boolean) => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const clashes = conflicts(draft, courses);
  function field<K extends keyof Course>(key: K, value: Course[K]) {
    setDraft({ ...draft, [key]: value });
    setConfirmed(false);
    setError("");
  }
  return (
    <Modal
      title={courses.some((c) => c.id === initial.id) ? "编辑课程" : "新增课程"}
      onClose={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          try {
            const course = validateCourse(draft, semester);
            if (clashes.length && !confirmed)
              throw new Error("请明确确认冲突后再保存");
            onSave(course, confirmed);
          } catch (err) {
            setError(err instanceof Error ? err.message : "保存失败");
          }
        }}
      >
        <div className="form-grid">
          {(["name", "teacher", "room"] as const).map((key, i) => (
            <label key={key}>
              {["课程名称", "任课教师", "教学地点"][i]}
              <input
                required
                maxLength={100}
                value={draft[key]}
                onChange={(e) => field(key, e.target.value)}
              />
            </label>
          ))}
          <label>
            星期
            <select
              aria-label="星期"
              value={draft.day}
              onChange={(e) => field("day", Number(e.target.value))}
            >
              {days.map((d, i) => (
                <option key={d} value={i + 1}>
                  星期{d}
                </option>
              ))}
            </select>
          </label>
          {(["start", "end", "startWeek", "endWeek"] as const).map((key, i) => (
            <label key={key}>
              {["开始节次", "结束节次", "起始周次", "结束周次"][i]}
              <input
                type="number"
                required
                min={1}
                max={i < 2 ? semester.periodsPerDay : semester.totalWeeks}
                value={draft[key] || ""}
                onChange={(e) => field(key, Number(e.target.value))}
              />
            </label>
          ))}
          <label>
            周次规则
            <select
              aria-label="周次规则"
              value={draft.parity}
              onChange={(e) =>
                field("parity", e.target.value as Course["parity"])
              }
            >
              <option value="all">全部周</option>
              <option value="odd">单周</option>
              <option value="even">双周</option>
            </select>
          </label>
          <label>
            课程颜色
            <select
              aria-label="课程颜色"
              value={draft.color}
              onChange={(e) =>
                field("color", e.target.value as Course["color"])
              }
            >
              {colors.map((c, i) => (
                <option key={c} value={c}>
                  {["蓝色", "绿色", "紫色", "橙色"][i]}
                </option>
              ))}
            </select>
          </label>
        </div>
        {clashes.length > 0 && (
          <div className="warning">
            <strong>发现时间冲突</strong>
            <ul>
              {clashes.map(({ course, weeks }) => (
                <li key={course.id}>
                  {course.name}：第 {weeks.join("、")} 周
                </li>
              ))}
            </ul>
            <label className="check">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              我已了解冲突，仍要保存
            </label>
          </div>
        )}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <div className="actions">
          <button type="button" onClick={onClose}>
            取消
          </button>
          <button className="primary-button" type="submit">
            保存课程
          </button>
        </div>
      </form>
    </Modal>
  );
}
