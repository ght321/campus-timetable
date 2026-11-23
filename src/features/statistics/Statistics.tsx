import { days, type Course } from "../../models";
import { statistics } from "./calculate";
export function Statistics({
  courses,
  week,
}: {
  courses: Course[];
  week: number;
}) {
  const s = statistics(courses, week);
  return (
    <section className="stats" aria-label="课表统计">
      {[
        ["本周课程", s.count + " 门", "当前显示第 " + week + " 周"],
        ["上课节数", s.hours + " 节", "按每条课程安排累计，含冲突"],
        ["上课天数", s.days + " 天", "当前周有课程的日期"],
        [
          "最繁忙星期",
          s.busiest.length
            ? s.busiest.map((d) => "周" + days[d - 1]).join("、")
            : "无",
          "按当前周课时统计，保留并列",
        ],
        ["全学期课程", s.total + " 条", "按课程安排条目计数"],
      ].map(([label, value, note]) => (
        <article className="stat-card" key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
          <p>{note}</p>
        </article>
      ))}
    </section>
  );
}
