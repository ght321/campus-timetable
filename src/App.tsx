
import { useState } from "react";
import "./App.css";

type Course = {
    id: number;
    name: string;
    teacher: string;
    room: string;
    day: number;
    start: number;
    end: number;
    weeks: string;
    color: string;
};

const days = ["一", "二", "三", "四", "五", "六", "日"];

const initialCourses: Course[] = [
    { id: 1, name: "高等数学", teacher: "张老师", room: "教 2-101", day: 1, start: 1, end: 2, weeks: "1-16周", color: "blue" },
    { id: 2, name: "大学英语", teacher: "李老师", room: "外语楼 203", day: 1, start: 3, end: 4, weeks: "1-16周", color: "green" },
    { id: 3, name: "数据结构", teacher: "王老师", room: "教 3-205", day: 2, start: 1, end: 2, weeks: "1-16周", color: "purple" },
    { id: 4, name: "线性代数", teacher: "陈老师", room: "教 1-302", day: 2, start: 5, end: 6, weeks: "1-16周", color: "orange" },
    { id: 5, name: "大学物理", teacher: "赵老师", room: "理学院 102", day: 3, start: 3, end: 4, weeks: "2-15周", color: "blue" },
    { id: 6, name: "程序设计", teacher: "刘老师", room: "计算机楼 301", day: 4, start: 5, end: 6, weeks: "1-16周", color: "purple" },
    { id: 7, name: "体育", teacher: "周老师", room: "校体育场", day: 5, start: 1, end: 2, weeks: "1-16周", color: "green" },
    { id: 8, name: "形势与政策", teacher: "孙老师", room: "学术报告厅", day: 5, start: 7, end: 8, weeks: "1-8周", color: "orange" },
];

function App() {
    const [week, setWeek] = useState(7);
    const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);

    const monday = new Date();
    const weekday = monday.getDay();
    monday.setDate(monday.getDate() - (weekday === 0 ? 6 : weekday - 1) + (week - 7) * 7);

    const dates = days.map((_, index) => {
        const date = new Date(monday);
        date.setDate(monday.getDate() + index);
        return `${date.getMonth() + 1}/${date.getDate()}`;
    });

    const courses = initialCourses.filter((course) => {
        const [start, end] = course.weeks.replace("周", "").split("-").map(Number);
        return week >= start && week <= end;
    });

    function exportTimetable() {
        const blob = new Blob(
            [JSON.stringify({
                school: "南京理工大学",
                week,
                courses: initialCourses,
            }, null, 2)],
            { type: "application/json;charset=utf-8" },
        );

        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "campus-timetable.json";
        link.click();
        URL.revokeObjectURL(url);
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
                <div className="header-right">
                    <span className="school-name">南京理工大学 · 演示数据</span>
                    <button className="primary-button" onClick={exportTimetable}>
                        导出课表
                    </button>
                </div>
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
                            <strong>2026 秋季学期</strong>
                            <span>当前第 {week} 教学周</span>
                        </div>
                    </div>
                </section>

                <section className="stats">
                    <article className="stat-card">
                        <span>本周课程</span>
                        <strong>{courses.length}<small> 门</small></strong>
                        <p>当前教学周的课程安排</p>
                    </article>
                    <article className="stat-card">
                        <span>上课节数</span>
                        <strong>{courses.reduce((sum, c) => sum + c.end - c.start + 1, 0)}<small> 节</small></strong>
                        <p>按课程起止节次统计</p>
                    </article>
                    <article className="stat-card">
                        <span>上课天数</span>
                        <strong>{new Set(courses.map((c) => c.day)).size}<small> 天</small></strong>
                        <p>本周有课程的日期</p>
                    </article>
                </section>

                <section className="schedule-panel">
                    <div className="panel-heading">
                        <div>
                            <h2>每周课表</h2>
                            <p>点击课程卡片，查看教师、教室和上课周次。</p>
                        </div>
                        <div className="week-controls">
                            <button
                                className="week-arrow"
                                disabled={week <= 1}
                                onClick={() => setWeek((value) => Math.max(1, value - 1))}
                                aria-label="上一周"
                            >‹</button>
                            <strong>第 {week} 周</strong>
                            <button
                                className="week-arrow"
                                disabled={week >= 20}
                                onClick={() => setWeek((value) => Math.min(20, value + 1))}
                                aria-label="下一周"
                            >›</button>
                            <button className="today-button" onClick={() => setWeek(7)}>回到本周</button>
                        </div>
                    </div>

                    <div className="schedule-scroll">
                        <div className="schedule">
                            <div className="day-header empty-header">节次</div>
                            {days.map((day, index) => (
                                <div className="day-header" key={day}>
                                    <strong>周{day}</strong>
                                    <span>{dates[index]}</span>
                                </div>
                            ))}

                            {Array.from({ length: 10 }, (_, index) => {
                                const period = index + 1;
                                return (
                                    <div className="period-row" key={period}>
                                        <div className="period-label">
                                            <strong>{period}</strong>
                                            <span>{["08:00", "08:50", "09:50", "10:40", "14:00", "14:50", "15:50", "16:40", "19:00", "19:50"][index]}</span>
                                        </div>
                                        {days.map((day) => <div className="empty-slot" key={day} />)}
                                    </div>
                                );
                            })}

                            {courses.map((course) => (
                                <button
                                    key={course.id}
                                    className={`course-card ${course.color}`}
                                    style={{
                                        gridColumn: course.day + 1,
                                        gridRow: `${course.start + 1} / span ${course.end - course.start + 1}`,
                                    }}
                                    onClick={() => setSelectedCourse(course)}
                                >
                                    <span className="course-tag">{course.weeks}</span>
                                    <strong>{course.name}</strong>
                                    <span>{course.room}</span>
                                    <span>第 {course.start}-{course.end} 节</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="schedule-note">
                        <span className="note-dot" />
                        当前是演示课表，并非南京理工大学官方课表。
                    </div>
                </section>

                <footer className="footer">
                    <strong>CampusTimetable</strong>
                    <span>让课表管理更简单</span>
                </footer>
            </main>

            {selectedCourse && (
                <div className="modal-backdrop" onClick={() => setSelectedCourse(null)}>
                    <section className="modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
                        <div className={`modal-strip ${selectedCourse.color}`} />
                        <div className="modal-body">
                            <div className="modal-top">
                                <span>课程详情</span>
                                <button className="close-button" onClick={() => setSelectedCourse(null)} aria-label="关闭">×</button>
                            </div>
                            <h2>{selectedCourse.name}</h2>
                            <div className="detail-row"><span>任课教师</span><strong>{selectedCourse.teacher}</strong></div>
                            <div className="detail-row"><span>上课地点</span><strong>{selectedCourse.room}</strong></div>
                            <div className="detail-row"><span>上课时间</span><strong>星期{days[selectedCourse.day - 1]}，第 {selectedCourse.start}-{selectedCourse.end} 节</strong></div>
                            <div className="detail-row"><span>上课周次</span><strong>{selectedCourse.weeks}</strong></div>
                            <button className="primary-button modal-confirm" onClick={() => setSelectedCourse(null)}>关闭详情</button>
                        </div>
                    </section>
                </div>
            )}
        </div>
    );
}

export default App;
