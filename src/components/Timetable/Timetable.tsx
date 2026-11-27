import { days, type Course, type Semester } from "../../models";
import { weekDates } from "../../utils/date";
import { courseLayout, occurs, weekLabel } from "../../utils/timetable";

const sectionStartTimes = [
  "08:00", "08:50", "09:40", "10:40", "11:30", "14:00", "14:50",
  "15:50", "16:40", "17:30", "19:00", "19:50", "20:40", "网课",
];

export function Timetable({
  courses, semester, week, today, onWeek, onToday, onSelect,
}: {
  courses: Course[];
  semester: Semester;
  week: number;
  today: string;
  onWeek: (w: number) => void;
  onToday: () => void;
  onSelect: (c: Course) => void;
}) {
  const active = courses.filter((course) => occurs(course, week));
  const mondayDates = weekDates(semester, week);
  const orderedDays = [1, 2, 3, 4, 5, 6, 7];
  const orderedDates = mondayDates;
  const layout = courseLayout(active);

  return (
    <section className="schedule-panel app-schedule-panel">
      <div className="panel-heading schedule-heading-app">
        <div><h2>每周课表</h2><p>点击课程查看详情 · {orderedDates[0]} 至 {orderedDates[6]}</p></div>
        <div className="week-controls">
          <button className="week-arrow" aria-label="上一周" disabled={week <= 1} onClick={() => onWeek(week - 1)}>‹</button>
          <strong>第 {week} 周</strong>
          <button className="week-arrow" aria-label="下一周" disabled={week >= semester.totalWeeks} onClick={() => onWeek(week + 1)}>›</button>
          <button className="today-button" onClick={onToday}>回到本周</button>
        </div>
      </div>
      {!active.length && <p className="empty-state">第 {week} 周暂无课程，可以切换周次或新增课程。</p>}
      <div className="schedule-scroll" tabIndex={0} aria-label="可横向滚动的周课表">
        <div className="schedule app-schedule" style={{
          gridTemplateColumns: "44px repeat(7, minmax(0, 1fr))",
          gridTemplateRows: `54px repeat(${semester.periodsPerDay}, 64px)`,
          minWidth: 0,
        }}>
          <div className="day-header empty-header">节次</div>
          {orderedDays.map((dayNumber, index) => (
            <div className={`day-header ${orderedDates[index] === today ? "is-today" : ""}`} style={{ gridColumn: index + 2, gridRow: 1 }} key={dayNumber}>
              <strong>{days[dayNumber - 1]}</strong><span>{orderedDates[index].slice(5).replace("-", "/")}</span>
            </div>
          ))}
          {Array.from({ length: semester.periodsPerDay }, (_, index) => (
            <div className="period-row" key={index}>
              <div className="period-label" style={{ gridRow: index + 2, gridColumn: 1 }}>
                <strong>{index + 1}</strong><span>{sectionStartTimes[index] || "待定"}</span>
              </div>
              {orderedDays.map((dayNumber, dayIndex) => (
                <div className={`empty-slot ${orderedDates[dayIndex] === today ? "is-today" : ""}`} key={dayNumber} style={{ gridRow: index + 2, gridColumn: dayIndex + 2 }} />
              ))}
            </div>
          ))}
          {active.map((course) => {
            const { lane, lanes } = layout.get(course.id)!;
            const dayColumn = orderedDays.indexOf(course.day) + 2;
            return (
              <button key={course.id} className={`course-card app-course-card ${course.color}`} style={{
                gridColumn: dayColumn,
                gridRow: `${course.start + 1} / span ${course.end - course.start + 1}`,
                width: `calc(${100 / lanes}% - 5px)`,
                marginLeft: `${(lane * 100) / lanes}%`,
              }} onClick={() => onSelect(course)}>
                <strong>{course.name}</strong>
                <span>{course.room}</span>
                <span className="course-period-range">{course.start}–{course.end}节</span>
                <span className="course-tag">{weekLabel(course)}</span>
                {lanes > 1 && <span>课程冲突</span>}
              </button>
            );
          })}
        </div>
      </div>
      <div className="schedule-note app-schedule-note"><span className="note-dot" />当天列已高亮 · 可在个人信息中设置学期第一天</div>
    </section>
  );
}
