import { useState } from "react";
import { RealSyncPanel } from "./features/sync/RealSyncPanel";
import { ExamPage } from "./features/exams/ExamPage";
import "./App.css";
import { type Course } from "./models";
import { useTimetable } from "./hooks/useTimetable";
import { useToday } from "./hooks/useToday";
import { teachingWeek, visibleWeek } from "./utils/date";
import { createCourseId } from "./utils/id";
import { saveCourse, deleteCourse } from "./features/courses/service";
import { occurs } from "./utils/timetable";
import { Timetable } from "./components/Timetable/Timetable";
import { CourseList } from "./components/Course/CourseList";
import { CourseDetail } from "./components/Course/CourseDetail";
import { CourseForm } from "./components/Course/CourseForm";
import { downloadData } from "./services/importExport";

type Tab = "profile" | "timetable" | "exams";

function App() {
  const { data, commit, storageMessage } = useTimetable();
  const today = useToday();
  const [requestedWeek, setWeek] = useState(() => visibleWeek(data.semester, today));
  const week = Math.min(requestedWeek, data.semester.totalWeeks);
  const [selected, setSelected] = useState<Course | null>(null);
  const [editing, setEditing] = useState<Course | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("timetable");
  const active = data.courses.filter((course) => occurs(course, week));
  const current = teachingWeek(data.semester, today);
  const currentLabel = current < 1
    ? "学期尚未开始"
    : current > data.semester.totalWeeks
      ? "学期已结束"
      : `真实当前第 ${current} 教学周`;

  function add() {
    setEditing({
      id: createCourseId(), name: "", teacher: "", room: "", day: 1,
      start: 1, end: Math.min(2, data.semester.periodsPerDay),
      startWeek: 1, endWeek: data.semester.totalWeeks, parity: "all", color: "blue",
    });
  }

  function changeSemesterFirstDay(value: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return;
    const nextSemester = { ...data.semester, startDate: value };
    const saved = commit({ ...data, semester: nextSemester });
    if (saved) setWeek(visibleWeek(nextSemester, today));
  }

  return (
    <div className="app app-shell">
      <header className="app-topbar">
        <div className="app-brand">
          <span className="app-brand-mark">C</span>
          <div><strong>CampusTimetable</strong><span>南京理工大学 · 校园助手</span></div>
        </div>
        <button className="topbar-export" onClick={() => downloadData(data)} title="导出课表">导出课表</button>
      </header>

      <main className="app-main">
        {activeTab === "timetable" && (
          <>
            <section className="app-term-card">
              <div className="term-main">
                <p className="term-kicker">当前学期</p>
                <h1>{data.semester.name}</h1>
                <p className="term-user-line"><span aria-hidden="true">◉</span> 本机缓存课表</p>
              </div>
              <div className="term-week-box">
                <span className="term-grid-icon" aria-hidden="true">▦</span>
                <label className="term-week-select">
                  <span>教学周</span>
                  <select aria-label="跳转教学周" value={week} onChange={(event) => setWeek(Number(event.target.value))}>
                    {Array.from({ length: data.semester.totalWeeks }, (_, index) => (
                      <option key={index + 1} value={index + 1}>第 {index + 1} 周</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="term-cache-warning"><span>!</span> 当前展示的是本地缓存课表 · {today} · {currentLabel}</div>
            </section>

            <Timetable
              courses={data.courses}
              semester={data.semester}
              today={today}
              week={week}
              onWeek={setWeek}
              onToday={() => setWeek(visibleWeek(data.semester, today))}
              onSelect={setSelected}
            />

            <div className="timetable-tools-row">
              <div><strong>本周课程</strong><span>{active.length} 条课程安排</span></div>
              <span>全学期课程管理</span>
            </div>
            <CourseList courses={data.courses} week={week} onSelect={setSelected} onAdd={add} />
            <p className="storage-status app-storage-status" role="status">
              {storageMessage || "数据保存在当前浏览器；建议定期导出 JSON 备份。"}
            </p>
          </>
        )}

        {activeTab === "exams" && <ExamPage />}

        {activeTab === "profile" && (
          <>
            <section className="page-intro-card">
              <p className="term-kicker">MY CAMPUS</p>
              <h1>个人信息</h1>
              <p>校园身份、课表同步与显示设置。</p>
            </section>
            <section className="profile-card">
              <div className="profile-avatar">C</div>
              <div><strong>本机课表空间</strong><span>数据仅保存在当前浏览器中</span></div>
            </section>
            <section className="profile-info-card">
              <div><span>学校</span><strong>南京理工大学</strong></div>
              <div><span>当前学期</span><strong>{data.semester.name}</strong></div>
              <div><span>课程安排</span><strong>{data.courses.length} 条</strong></div>
              <div><span>每日节次</span><strong>{data.semester.periodsPerDay} 节</strong></div>
              <button className="primary-button profile-export" onClick={() => downloadData(data)}>导出课表备份</button>
            </section>

            <section className="profile-settings-card">
              <div className="profile-settings-heading">
                <strong>学期设置</strong>
                <span>设置本学期第一天，自动计算当前教学周</span>
              </div>
              <label className="profile-setting-row">
                <span><strong>设置学期第一天</strong><small>第一教学周的起始日期</small></span>
                <input
                  aria-label="设置学期第一天"
                  type="date"
                  value={data.semester.startDate}
                  onChange={(event) => changeSemesterFirstDay(event.target.value)}
                />
              </label>
              <p className="profile-setting-note">
                当前学期第一天：{data.semester.startDate}；今天 {today} 对应第 {current} 教学周。
                例如设置为 2026-08-24，2026-11-27 自动显示第 14 周。
              </p>
            </section>

            <section className="profile-sync-section">
              <div className="profile-settings-heading">
                <strong>学校登录与同步</strong>
                <span>使用学校官方认证会话获取最新课表</span>
              </div>
              <RealSyncPanel
                semester={data.semester}
                existingCourseCount={data.courses.length}
                onImport={(courses) => {
                  const importedMaxPeriod = courses.reduce(
                    (max, course) => Math.max(max, course.end),
                    data.semester.periodsPerDay,
                  );
                  const nextSemester = { ...data.semester, periodsPerDay: Math.min(24, importedMaxPeriod) };
                  const saved = commit({ ...data, semester: nextSemester, courses }, true);
                  if (!saved) return false;
                  setWeek(visibleWeek(nextSemester, today));
                  setSelected(null);
                  setEditing(null);
                  // 同步结果留在个人页展示，用户可自行切换到课程或考试页面。
                  return true;
                }}
              />
            </section>
            <p className="profile-note">学校登录账号和密码不会保存在课表文件中。请勿在公共设备上保留已登录的教务会话。</p>
          </>
        )}
      </main>

      <nav className="app-bottom-nav" aria-label="主导航">
        <button className={activeTab === "profile" ? "is-active" : ""} onClick={() => setActiveTab("profile")}>
          <span className="nav-icon nav-profile" aria-hidden="true">♙</span><span>个人信息</span>
        </button>
        <button className={activeTab === "timetable" ? "is-active" : ""} onClick={() => setActiveTab("timetable")}>
          <span className="nav-icon nav-calendar" aria-hidden="true">▥</span><span>课程</span>
        </button>
        <button className={activeTab === "exams" ? "is-active" : ""} onClick={() => setActiveTab("exams")}>
          <span className="nav-icon nav-exams" aria-hidden="true">▤</span><span>考试</span>
        </button>
      </nav>

      {selected && (
        <CourseDetail
          course={selected}
          courses={data.courses}
          onClose={() => setSelected(null)}
          onEdit={() => { setEditing(selected); setSelected(null); }}
          onDelete={() => {
            if (window.confirm(`确定删除课程“${selected.name}”？`)) {
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
            commit(saveCourse(data, course, data.courses.some((item) => item.id === course.id) ? "edit" : "add", allow));
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}
export default App;

