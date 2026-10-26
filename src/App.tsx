import { useState } from "react";
import "./App.css";
import type { Course } from "./models";
import { demoData } from "./data/demo";
import { useTimetable } from "./hooks/useTimetable";
import { useToday } from "./hooks/useToday";
import { teachingWeek, visibleWeek } from "./utils/date";
import { createCourseId } from "./utils/id";
import {
  saveCourse,
  deleteCourse,
  changeSemester,
} from "./features/courses/service";
import { Statistics } from "./features/statistics/Statistics";
import { SemesterForm } from "./features/semester/SemesterForm";
import { Timetable } from "./components/Timetable/Timetable";
import { CourseList } from "./components/Course/CourseList";
import { CourseDetail } from "./components/Course/CourseDetail";
import { CourseForm } from "./components/Course/CourseForm";
import { DataTools } from "./components/Layout/DataTools";
function App() {
  const { data, commit, storageMessage } = useTimetable();
  const today = useToday();
  const [requestedWeek, setWeek] = useState(() =>
    visibleWeek(data.semester, today),
  );
  const week = Math.min(requestedWeek, data.semester.totalWeeks);
  const [selected, setSelected] = useState<Course | null>(null),
    [editing, setEditing] = useState<Course | null>(null),
    [settings, setSettings] = useState(false);
  const current = teachingWeek(data.semester, today);
  const currentLabel =
    current < 1
      ? "学期尚未开始"
      : current > data.semester.totalWeeks
        ? "学期已结束"
        : "真实当前第 " + current + " 教学周";
  function add() {
    setEditing({
      id: createCourseId(),
      name: "",
      teacher: "",
      room: "",
      day: 1,
      start: 1,
      end: Math.min(2, data.semester.periodsPerDay),
      startWeek: 1,
      endWeek: data.semester.totalWeeks,
      parity: "all",
      color: "blue",
    });
  }
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="brand-logo">C</div>
          <div>
            <strong>CampusTimetable</strong>
            <span>校园课表管理平台</span>
          </div>
        </div>
        <DataTools
          data={data}
          onSettings={() => setSettings(true)}
          onReset={() => {
            if (
              window.confirm("恢复演示数据将替换全部课程及学期设置，是否继续？")
            ) {
              const demo = demoData();
              commit(demo, true);
              setWeek(visibleWeek(demo.semester, today));
            }
          }}
          onImport={(next) => {
            commit(next, true);
            setWeek(visibleWeek(next.semester, today));
          }}
        />
      </header>
      <main className="container">
        <section className="welcome">
          <div>
            <p className="eyebrow">YOUR CAMPUS, YOUR SCHEDULE</p>
            <h1>把每一周，安排得井井有条。</h1>
            <p className="subheading">清晰掌握课程安排，让学习节奏尽在掌握。</p>
          </div>
          <div className="semester-card">
            <span className="semester-icon">▦</span>
            <div>
              <strong>{data.semester.name}</strong>
              <span>
                {today} · {currentLabel}
              </span>
            </div>
          </div>
        </section>
        <p className="storage-status" role="status">
          {storageMessage || "数据保存在当前浏览器；建议定期导出JSON备份。"}
        </p>
        {(current < 1 || current > data.semester.totalWeeks) && (
          <p className="hint">
            今天不在教学周范围内。“回到本周”显示最近的学期边界周。
          </p>
        )}
        <Statistics courses={data.courses} week={week} />
        <Timetable
          courses={data.courses}
          semester={data.semester}
          today={today}
          week={week}
          onWeek={setWeek}
          onToday={() => setWeek(visibleWeek(data.semester, today))}
          onSelect={setSelected}
        />
        <CourseList
          courses={data.courses}
          week={week}
          onSelect={setSelected}
          onAdd={add}
        />
        <footer className="footer">
          <strong>CampusTimetable</strong>
          <span>让课表管理更简单 · 本地个人课表</span>
        </footer>
      </main>
      {selected && (
        <CourseDetail
          course={selected}
          courses={data.courses}
          onClose={() => setSelected(null)}
          onEdit={() => {
            setEditing(selected);
            setSelected(null);
          }}
          onDelete={() => {
            if (window.confirm("确定删除课程“" + selected.name + "”？")) {
              commit(deleteCourse(data, selected.id));
              setSelected(null);
            }
          }}
        />
      )}
      {editing && (
        <CourseForm
          initial={editing}
          courses={data.courses}
          semester={data.semester}
          onClose={() => setEditing(null)}
          onSave={(course, allow) => {
            commit(
              saveCourse(
                data,
                course,
                data.courses.some((c) => c.id === course.id) ? "edit" : "add",
                allow,
              ),
            );
            setEditing(null);
          }}
        />
      )}
      {settings && (
        <SemesterForm
          initial={data.semester}
          onClose={() => setSettings(false)}
          onSave={(semester) => {
            commit(changeSemester(data, semester));
            setWeek(visibleWeek(semester, today));
            setSettings(false);
          }}
        />
      )}
    </div>
  );
}
export default App;
