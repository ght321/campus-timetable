import { useState } from "react";
import { days, type Course } from "../../models";
import { occurs, weekLabel } from "../../utils/timetable";
export function CourseList({
  courses,
  week,
  onSelect,
  onAdd,
}: {
  courses: Course[];
  week: number;
  onSelect: (c: Course) => void;
  onAdd: () => void;
}) {
  const [query, setQuery] = useState(""),
    [onlyWeek, setOnlyWeek] = useState(false);
  const filtered = courses.filter(
    (c) =>
      c.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()) &&
      (!onlyWeek || occurs(c, week)),
  );
  return (
    <section className="schedule-panel course-management">
      <div className="panel-heading">
        <div>
          <h2>课程管理</h2>
          <p>全学期 {courses.length} 条课程安排 · 点击查看、编辑或删除</p>
        </div>
        <button className="primary-button" onClick={onAdd}>
          新增课程
        </button>
      </div>
      <div className="list-controls">
        <label>
          课程名称搜索
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="输入课程名称"
          />
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={onlyWeek}
            onChange={(e) => setOnlyWeek(e.target.checked)}
          />
          仅第 {week} 周
        </label>
      </div>
      {!filtered.length && (
        <p className="empty-state">没有匹配课程，请调整筛选或新增课程。</p>
      )}
      <div className="course-list">
        {filtered.map((c) => (
          <button
            className={"list-course " + c.color}
            key={c.id}
            onClick={() => onSelect(c)}
          >
            <strong>{c.name}</strong>
            <span>
              {c.teacher} · {c.room}
            </span>
            <span>
              星期{days[c.day - 1]} · 第{c.start}–{c.end}节 · {weekLabel(c)}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
