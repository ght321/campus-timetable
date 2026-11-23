import { days, type Course } from "../../models";
import { conflicts, weekLabel } from "../../utils/timetable";
import { Modal } from "../Common/Modal";
export function CourseDetail({
  course,
  courses,
  onClose,
  onEdit,
  onDelete,
}: {
  course: Course;
  courses: Course[];
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const clashes = conflicts(course, courses);
  return (
    <Modal title="课程详情" onClose={onClose}>
      <div className={"detail-title " + course.color}>
        <h3>{course.name}</h3>
      </div>
      {Object.entries({
        任课教师: course.teacher,
        教学地点: course.room,
        上课时间:
          "星期" +
          days[course.day - 1] +
          "，第 " +
          course.start +
          "–" +
          course.end +
          " 节",
        上课周次: weekLabel(course),
      }).map(([label, value]) => (
        <div className="detail-row" key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
      {clashes.length > 0 && (
        <div className="warning">
          存在冲突：
          {clashes
            .map((c) => c.course.name + "（第" + c.weeks.join("、") + "周）")
            .join("；")}
        </div>
      )}
      <div className="actions">
        <button className="danger" onClick={onDelete}>
          删除课程
        </button>
        <button className="primary-button" onClick={onEdit}>
          编辑课程
        </button>
      </div>
    </Modal>
  );
}
