import { days, type Course, type Semester } from "../../models";
import { weekDates } from "../../utils/date";
import { courseLayout, occurs, weekLabel } from "../../utils/timetable";
export function Timetable({
  courses,
  semester,
  week,
  today,
  onWeek,
  onToday,
  onSelect,
}: {
  courses: Course[];
  semester: Semester;
  week: number;
  today: string;
  onWeek: (w: number) => void;
  onToday: () => void;
  onSelect: (c: Course) => void;
}) {
  const active = courses.filter((c) => occurs(c, week)),
    dates = weekDates(semester, week),
    layout = courseLayout(active);
  const widths = days.map(
    (_, i) =>
      Math.max(
        1,
        ...active
          .filter((c) => c.day === i + 1)
          .map((c) => layout.get(c.id)!.lanes),
      ) * 130,
  );
  return (
    <section className="schedule-panel">
      <div className="panel-heading">
        <div>
          <h2>每周课表</h2>
          <p>
            点击课程查看详情 · {dates[0]} 至 {dates[6]}
          </p>
        </div>
        <div className="week-controls">
          <button
            className="week-arrow"
            aria-label="上一周"
            disabled={week <= 1}
            onClick={() => onWeek(week - 1)}
          >
            ‹
          </button>
          <label className="week-select">
            教学周
            <select
              aria-label="跳转教学周"
              value={week}
              onChange={(e) => onWeek(Number(e.target.value))}
            >
              {Array.from({ length: semester.totalWeeks }, (_, i) => (
                <option key={i} value={i + 1}>
                  第 {i + 1} 周
                </option>
              ))}
            </select>
          </label>
          <button
            className="week-arrow"
            aria-label="下一周"
            disabled={week >= semester.totalWeeks}
            onClick={() => onWeek(week + 1)}
          >
            ›
          </button>
          <button className="today-button" onClick={onToday}>
            回到本周
          </button>
        </div>
      </div>
      {!active.length && (
        <p className="empty-state">
          第 {week} 周暂无课程，可以切换周次或新增课程。
        </p>
      )}
      <div
        className="schedule-scroll"
        tabIndex={0}
        aria-label="可横向滚动的周课表"
      >
        <div
          className="schedule"
          style={{
            gridTemplateColumns:
              "44px " + widths.map((w) => "minmax(" + w + "px, 1fr)").join(" "),
            gridTemplateRows:
              "57px repeat(" + semester.periodsPerDay + ", 112px)",
            minWidth: 44 + widths.reduce((a, b) => a + b, 0) + 35,
          }}
        >
          <div className="day-header empty-header">节次</div>
          {days.map((d, i) => (
            <div
              className={"day-header " + (dates[i] === today ? "is-today" : "")}
              style={{ gridColumn: i + 2, gridRow: 1 }}
              key={d}
            >
              <strong>
                周{d}
                {dates[i] === today ? " · 今天" : ""}
              </strong>
              <span>{dates[i].slice(5).replace("-", "/")}</span>
            </div>
          ))}
          {Array.from({ length: semester.periodsPerDay }, (_, i) => (
            <div className="period-row" key={i}>
              <div
                className="period-label"
                style={{ gridRow: i + 2, gridColumn: 1 }}
              >
                <strong>{i + 1}</strong>
                <span>节</span>
              </div>
              {days.map((d, j) => (
                <div
                  className="empty-slot"
                  key={d}
                  style={{ gridRow: i + 2, gridColumn: j + 2 }}
                />
              ))}
            </div>
          ))}
          {active.map((c) => {
            const { lane, lanes } = layout.get(c.id)!;
            return (
              <button
                key={c.id}
                className={"course-card " + c.color}
                style={{
                  gridColumn: c.day + 1,
                  gridRow: c.start + 1 + " / span " + (c.end - c.start + 1),
                  width: "calc(" + 100 / lanes + "% - 4px)",
                  marginLeft: (lane * 100) / lanes + "%",
                }}
                onClick={() => onSelect(c)}
              >
                <strong>{c.name}</strong>
                <span>{c.room}</span>
                <span>
                  第 {c.start}–{c.end} 节
                </span>
                <span className="course-tag">{weekLabel(c)}</span>
                {lanes > 1 && <span>并行课程 · 请检查冲突</span>}
              </button>
            );
          })}
        </div>
      </div>
      <div className="schedule-note">
        <span className="note-dot" />
        个人课表管理与课程设计演示，非学校官方课表。
      </div>
    </section>
  );
}
