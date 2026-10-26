import { type FormEvent, useEffect, useMemo, useState } from "react";
import "./App.css";
import "./sync.css";

type Course = {
  id: string | number;
  name: string;
  teacher: string;
  room: string;
  day: number;
  start: number;
  end: number;
  weeks: string;
  color: string;
};

type TimetableData = {
  school: string;
  semester: string;
  source: string;
  sourceUrl: string;
  lastSyncedAt: string | null;
  courses: Course[];
};

const API = "http://127.0.0.1:3001";
const days = ["一", "二", "三", "四", "五", "六", "日"];

/** Official NJUST teaching-time table, published in the university's 2025 teaching-plan PDF. */
const sectionTimes = [
  { section: 1, start: "08:00", end: "08:45" },
  { section: 2, start: "08:50", end: "09:35" },
  { section: 3, start: "09:40", end: "10:25" },
  { section: 4, start: "10:40", end: "11:25" },
  { section: 5, start: "11:30", end: "12:15" },
  { section: 6, start: "14:00", end: "14:45" },
  { section: 7, start: "14:50", end: "15:35" },
  { section: 8, start: "15:50", end: "16:35" },
  { section: 9, start: "16:40", end: "17:25" },
  { section: 10, start: "17:30", end: "18:15" },
  { section: 11, start: "19:00", end: "19:45" },
  { section: 12, start: "19:50", end: "20:35" },
  { section: 13, start: "20:40", end: "21:25" },
] as const;
// 第 14 节在当前南理工课表数据中表示网课安排，不对应统一的线下钟点。
const ONLINE_SECTION = 14;
const SCHEDULE_SECTION_COUNT = ONLINE_SECTION;
const SECTION_ROW_HEIGHT = 64;

function formatSectionTime(section: number): string {
  if (section === ONLINE_SECTION) return "网课";
  const timing = sectionTimes[section - 1];
  return timing ? `${timing.start}–${timing.end}` : "时间待核对";
}

function formatCourseTime(course: Pick<Course, "start" | "end">): string {
  if (course.start === ONLINE_SECTION && course.end === ONLINE_SECTION) return "网课（无统一固定钟点）";
  if (course.start === ONLINE_SECTION) return "网课（无统一固定钟点）";
  const first = sectionTimes[course.start - 1];
  const last = sectionTimes[course.end - 1];
  if (course.end === ONLINE_SECTION && first) return `${first.start} 起 · 含网课安排（结束钟点以教务通知为准）`;
  if (!first && !last) return `特殊节次（第 ${course.start}-${course.end} 节），具体时间待核对`;
  if (!first) return `第 ${course.start}-${course.end} 节，具体时间待核对`;
  if (!last) return `${first.start} 起；结束时间待核对（第 ${course.end} 节不在标准作息表内）`;
  return `${first.start}–${last.end}`;
}

// The visual timetable uses continuous, equal-height lesson rows.
// Real clock times are shown on the left; breaks never create extra grid rows.
const scheduleGridTemplateRows = ["54px", ...Array.from({ length: SCHEDULE_SECTION_COUNT }, () => `${SECTION_ROW_HEIGHT}px`)].join(" ");

const TERM_START_STORAGE_KEY = "campus-timetable-term-start-dates";
// 南京理工大学 2026-2027-1 的默认估算基准。请以本校正式校历/教学安排为准，可在页面中直接修改。
const DEFAULT_TERM_START_DATES: Record<string, string> = {
  "2026-2027-1": "2026-09-07",
};

function loadTermStartDates(): Record<string, string> {
  try {
    const saved = window.localStorage.getItem(TERM_START_STORAGE_KEY);
    return { ...DEFAULT_TERM_START_DATES, ...(saved ? JSON.parse(saved) as Record<string, string> : {}) };
  } catch {
    return { ...DEFAULT_TERM_START_DATES };
  }
}

function calculateTeachingWeek(firstMonday: string, currentDate = new Date()): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(firstMonday)) return null;
  const [year, month, day] = firstMonday.split("-").map(Number);
  const startMs = Date.UTC(year, month - 1, day);
  const todayMs = Date.UTC(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate());
  if (!Number.isFinite(startMs) || todayMs < startMs) return null;
  const elapsedDays = Math.floor((todayMs - startMs) / 86_400_000);
  return Math.min(30, Math.floor(elapsedDays / 7) + 1);
}

function formatLocalDate(date = new Date()): string {
  return date.toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "long" });
}

const emptyData: TimetableData = {
  school: "南京理工大学",
  semester: "",
  source: "",
  sourceUrl: "",
  lastSyncedAt: null,
  courses: [],
};

function courseOccursInWeek(course: Course, week: number) {
  const text = (course.weeks || "").replace(/[–—~～至到]/g, "-").replace(/周/g, "");
  if (/单周/.test(text)) return week % 2 === 1;
  if (/双周/.test(text)) return week % 2 === 0;
  // Handles one or more ranges, for example "4-5,8-12周".
  const tokens = text.match(/\d{1,2}(?:\s*-\s*\d{1,2})?/g) || [];
  const ranges = tokens.map((token) => {
    const parts = token.split("-").map((part) => Number(part.trim()));
    return parts.length === 2 ? [parts[0], parts[1]] : [parts[0], parts[0]];
  }).filter(([start, end]) => start >= 1 && end >= start && end <= 60);
  if (ranges.length) return ranges.some(([start, end]) => week >= start && week <= end);
  // When week information is ambiguous, do not hide the course silently.
  return true;
}

type LaidOutCourse = Course & { laneIndex: number; laneCount: number; compact: boolean };

/**
 * Position simultaneous courses side-by-side instead of letting later cards
 * completely cover earlier cards. A cluster includes courses that overlap
 * directly or through a longer course (for example an all-day practicum).
 */
function assignCourseLanes(input: Course[]): LaidOutCourse[] {
  const result: LaidOutCourse[] = [];
  for (let day = 1; day <= 7; day++) {
    const sorted = input
      .filter((course) => course.day === day)
      .slice()
      .sort((a, b) => a.start - b.start || b.end - a.end || String(a.id).localeCompare(String(b.id)));

    let cluster: Course[] = [];
    let clusterEnd = 0;
    const flushCluster = () => {
      if (!cluster.length) return;
      const laneEnds: number[] = [];
      const assignments: Array<{ course: Course; laneIndex: number }> = [];
      for (const course of cluster) {
        let laneIndex = laneEnds.findIndex((end) => end < course.start);
        if (laneIndex < 0) {
          laneIndex = laneEnds.length;
          laneEnds.push(course.end);
        } else {
          laneEnds[laneIndex] = course.end;
        }
        assignments.push({ course, laneIndex });
      }
      const laneCount = Math.max(1, laneEnds.length);
      for (const { course, laneIndex } of assignments) {
        result.push({
          ...course,
          laneIndex,
          laneCount,
          compact: course.end - course.start + 1 <= 1,
        });
      }
      cluster = [];
      clusterEnd = 0;
    };

    for (const course of sorted) {
      // Section numbers are inclusive: ending at period 2 and starting at 3
      // does not overlap, while both occupying period 2 does.
      if (cluster.length && course.start > clusterEnd) flushCluster();
      cluster.push(course);
      clusterEnd = Math.max(clusterEnd, course.end);
    }
    flushCluster();
  }
  return result.sort((a, b) => a.day - b.day || a.start - b.start || a.laneIndex - b.laneIndex);
}

function App() {
  const [week, setWeek] = useState(1);
  const [now, setNow] = useState(() => new Date());
  const [followCurrentWeek, setFollowCurrentWeek] = useState(true);
  const [termStartDates, setTermStartDates] = useState<Record<string, string>>(loadTermStartDates);
  const [allCourses, setAllCourses] = useState<Course[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [data, setData] = useState<TimetableData>(emptyData);
  const [connectionError, setConnectionError] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [authPhase, setAuthPhase] = useState("idle");
  const [authMessage, setAuthMessage] = useState("请输入校园账号和密码，开始官方登录流程。");
  const [authBusy, setAuthBusy] = useState(false);
  const [captcha, setCaptcha] = useState("");
  const [captchaDataUrl, setCaptchaDataUrl] = useState("");
  const [authDiagnostics, setAuthDiagnostics] = useState<Record<string, unknown> | null>(null);
  const [authTrace, setAuthTrace] = useState<Array<Record<string, unknown>>>([]);
  // 已从用户提供的教务 HTML 确认其选中学期为 2026-2027-1；首次同步前以此作可见默认值。
  const displayedSemester = data.semester || "2026-2027-1";
  const termStartDate = termStartDates[displayedSemester] || "";
  const currentWeek = calculateTeachingWeek(termStartDate, now);

  useEffect(() => {
    const clock = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(clock);
  }, []);

  useEffect(() => {
    setFollowCurrentWeek(true);
  }, [data.semester]);

  useEffect(() => {
    try { window.localStorage.setItem(TERM_START_STORAGE_KEY, JSON.stringify(termStartDates)); } catch { /* storage can be unavailable in private mode */ }
  }, [termStartDates]);

  useEffect(() => {
    if (followCurrentWeek && currentWeek !== null) setWeek(currentWeek);
  }, [currentWeek, followCurrentWeek]);

  function setViewedWeek(nextWeek: number) {
    setFollowCurrentWeek(false);
    setWeek(Math.max(1, Math.min(30, nextWeek)));
  }

  function returnToCurrentWeek() {
    if (currentWeek !== null) {
      setWeek(currentWeek);
      setFollowCurrentWeek(true);
    }
  }

  function updateDiagnostics(payload: Record<string, unknown>) {
    setAuthDiagnostics(payload.diagnostics && typeof payload.diagnostics === "object" ? payload.diagnostics as Record<string, unknown> : null);
    setAuthTrace(Array.isArray(payload.trace) ? payload.trace as Array<Record<string, unknown>> : []);
  }

  async function diagnoseSchoolFlow() {
    setAuthBusy(true);
    setAuthMessage("正在按“教务处 → 网上办事大厅 → 本科教务主页 → 个人课表”顺序检查；不会提交账号密码……");
    try {
      const response = await fetch(`${API}/api/auth/diagnose`, { method: "POST", cache: "no-store" });
      const payload = await response.json() as Record<string, unknown>;
      updateDiagnostics(payload);
      setAuthMessage(String(payload.message || (response.ok ? "入口检查完成，请展开下方脱敏诊断结果。" : `入口检查失败（HTTP ${response.status}）`)));
      if (!response.ok) setAuthPhase("error");
    } catch (error) {
      setAuthMessage(error instanceof Error ? error.message : "检查学校入口失败。");
    } finally {
      setAuthBusy(false);
    }
  }

  useEffect(() => {
    let active = true;
    const loadTimetable = async () => {
      try {
        const response = await fetch(`${API}/api/timetable`, { cache: "no-store" });
        if (!response.ok) throw new Error(`本机同步服务返回 HTTP ${response.status}`);
        const payload = (await response.json()) as TimetableData;
        if (!active) return;
        const normalizedCourses = (Array.isArray(payload.courses) ? payload.courses : []).map((course, index) => ({
          ...course,
          id: course.id ?? `course-${index + 1}`,
          name: String(course.name || "未识别课程"),
          teacher: String(course.teacher || "未识别"),
          room: String(course.room || "未识别"),
          weeks: String(course.weeks || "周次未识别"),
          color: course.color || ["blue", "green", "purple", "orange", "pink"][index % 5],
        }));
        setData({ ...emptyData, ...payload, courses: normalizedCourses });
        setAllCourses(normalizedCourses);
        setConnectionError("");
      } catch (error) {
        if (active) setConnectionError(error instanceof Error ? error.message : "连接本机服务失败");
      }
    };

    void loadTimetable();
    const timer = window.setInterval(() => void loadTimetable(), 30_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let active = true;
    const checkAuth = async () => {
      try {
        const response = await fetch(`${API}/api/auth/status`, { cache: "no-store" });
        const payload = await response.json() as Record<string, unknown>;
        if (!active) return;
        updateDiagnostics(payload);
        setAuthPhase(String(payload.phase || "idle"));
        if (payload.message) setAuthMessage(String(payload.message));
        setCaptchaDataUrl(String(payload.captchaDataUrl || ""));
        if (payload.phase === "connected") {
          const dataResponse = await fetch(`${API}/api/timetable`, { cache: "no-store" });
          if (dataResponse.ok && active) {
            const latest = await dataResponse.json() as TimetableData;
            const normalized = (Array.isArray(latest.courses) ? latest.courses : []).map((course, index) => ({
              ...course, id: course.id ?? `course-${index + 1}`, name: String(course.name || "未识别课程"),
              teacher: String(course.teacher || "未识别"), room: String(course.room || "未识别"),
              weeks: String(course.weeks || "周次未识别"), color: course.color || ["blue", "green", "purple", "orange", "pink"][index % 5],
            }));
            setData({ ...emptyData, ...latest, courses: normalized });
            setAllCourses(normalized);
          }
        }
      } catch {
        // The existing connection notice gives the actionable local-service error.
      }
    };
    void checkAuth();
    const timer = window.setInterval(() => void checkAuth(), 3000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  async function startSchoolLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!username.trim() || !password) {
      setAuthMessage("请填写学号和密码。");
      return;
    }
    setAuthBusy(true);
    setAuthMessage("正在启动本机后台 Edge，执行学校官方认证页面……");
    try {
      const response = await fetch(`${API}/api/auth/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
        cache: "no-store",
      });
      const payload = await response.json() as Record<string, unknown>;
      updateDiagnostics(payload);
      setAuthPhase(String(payload.phase || (payload.needsCaptcha ? "needs_captcha" : "authenticating")));
      setAuthMessage(String(payload.message || "认证请求已处理。"));
      setCaptchaDataUrl(String(payload.captchaDataUrl || ""));
      if (payload.needsCaptcha) {
        setCaptcha("");
        return;
      }
      if (!response.ok || payload.ok === false) throw new Error(String(payload.message || `请求失败（HTTP ${response.status}）`));
      setPassword("");
      setCaptcha("");
      if (payload.phase === "connected") {
        const refresh = await fetch(`${API}/api/timetable`, { cache: "no-store" });
        if (refresh.ok) {
          const latest = await refresh.json() as TimetableData;
          const normalized = (Array.isArray(latest.courses) ? latest.courses : []).map((course, index) => ({
            ...course, id: course.id ?? `course-${index + 1}`, name: String(course.name || "未识别课程"),
            teacher: String(course.teacher || "未识别"), room: String(course.room || "未安排"),
            weeks: String(course.weeks || "周次需核对"), color: course.color || ["blue", "green", "purple", "orange", "pink"][index % 5],
          }));
          setData({ ...emptyData, ...latest, courses: normalized });
          setAllCourses(normalized);
        }
      }
    } catch (error) {
      setAuthPhase("error");
      setAuthMessage(error instanceof Error ? error.message : "启动学校登录流程失败。");
    } finally {
      setAuthBusy(false);
    }
  }

  async function submitCaptcha(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!username.trim() || !password || !captcha.trim()) {
      setAuthMessage("请填写学号、密码和验证码。");
      return;
    }
    setAuthBusy(true);
    setAuthMessage("正在提交验证码并获取课表……");
    try {
      const response = await fetch(`${API}/api/auth/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password, captcha: captcha.trim() }),
        cache: "no-store",
      });
      const payload = await response.json() as Record<string, unknown>;
      updateDiagnostics(payload);
      setAuthPhase(String(payload.phase || (payload.ok ? "connected" : "error")));
      setAuthMessage(String(payload.message || (response.ok ? "认证请求完成。" : `请求失败（HTTP ${response.status}）`)));
      setCaptchaDataUrl(String(payload.captchaDataUrl || ""));
      if (!response.ok || payload.ok === false) {
        if (payload.phase === "needs_captcha") return;
        throw new Error(String(payload.message || `请求失败（HTTP ${response.status}）`));
      }
      setPassword("");
      setCaptcha("");
      const refresh = await fetch(`${API}/api/timetable`, { cache: "no-store" });
      if (refresh.ok) {
        const latest = await refresh.json() as TimetableData;
        const normalized = (Array.isArray(latest.courses) ? latest.courses : []).map((course, index) => ({
          ...course, id: course.id ?? `course-${index + 1}`, name: String(course.name || "未识别课程"),
          teacher: String(course.teacher || "未识别"), room: String(course.room || "未安排"),
          weeks: String(course.weeks || "周次需核对"), color: course.color || ["blue", "green", "purple", "orange", "pink"][index % 5],
        }));
        setData({ ...emptyData, ...latest, courses: normalized });
        setAllCourses(normalized);
      }
    } catch (error) {
      setAuthPhase("error");
      setAuthMessage(error instanceof Error ? error.message : "认证失败，请核对输入后重试。");
    } finally {
      setAuthBusy(false);
    }
  }

  async function scanCurrentSchoolPage() {
    setAuthBusy(true);
    setAuthMessage("正在使用本机保存的学校 HTTPS 会话刷新课表……");
    try {
      const response = await fetch(`${API}/api/auth/scan`, { method: "POST", cache: "no-store" });
      const payload = await response.json() as Record<string, unknown>;
      updateDiagnostics(payload);
      setAuthPhase(payload.ok ? "connected" : String(payload.phase || "schedule_not_parsed"));
      setAuthMessage(String(payload.message || (payload.ok ? `已读取 ${payload.count} 条课程时段。` : "当前会话尚未读取到课表。")));
      if (payload.ok) {
        const refresh = await fetch(`${API}/api/timetable`, { cache: "no-store" });
        if (refresh.ok) {
          const latest = await refresh.json() as TimetableData;
          const normalized = (Array.isArray(latest.courses) ? latest.courses : []).map((course, index) => ({
            ...course, id: course.id ?? `course-${index + 1}`, name: String(course.name || "未识别课程"),
            teacher: String(course.teacher || "未识别"), room: String(course.room || "未识别"),
            weeks: String(course.weeks || "周次未识别"), color: course.color || ["blue", "green", "purple", "orange", "pink"][index % 5],
          }));
          setData({ ...emptyData, ...latest, courses: normalized });
          setAllCourses(normalized);
        }
      }
    } catch (error) {
      setAuthMessage(error instanceof Error ? error.message : "识别课表失败。");
    } finally {
      setAuthBusy(false);
    }
  }

  async function closeSchoolSession() {
    setAuthBusy(true);
    try {
      const response = await fetch(`${API}/api/auth/close`, { method: "POST", cache: "no-store" });
      const payload = await response.json();
      setAuthPhase(String(payload.phase || "idle"));
      setAuthMessage(String(payload.message || "已清除本机认证会话。"));
      setPassword("");
      setCaptcha("");
      setCaptchaDataUrl("");
    } catch (error) {
      setAuthMessage(error instanceof Error ? error.message : "清除本机认证会话失败。");
    } finally {
      setAuthBusy(false);
    }
  }

  const courses = useMemo(
    () => allCourses.filter((course) => courseOccursInWeek(course, week)),
    [allCourses, week],
  );
  const timelineCourses = useMemo(
    () => courses.filter((course) => course.start >= 1 && course.end <= SCHEDULE_SECTION_COUNT && course.day >= 1 && course.day <= 7),
    [courses],
  );
  const specialTimeCourses = useMemo(
    () => courses.filter((course) => course.start < 1 || course.end > SCHEDULE_SECTION_COUNT || course.day < 1 || course.day > 7),
    [courses],
  );
  const laidOutCourses = useMemo(() => assignCourseLanes(timelineCourses), [timelineCourses]);
  const totalPeriods = courses.reduce((sum, course) => sum + course.end - course.start + 1, 0);
  const studyDays = new Set(courses.map((course) => course.day)).size;

  function exportTimetable() {
    const blob = new Blob(
      [JSON.stringify({ ...data, exportedAt: new Date().toISOString() }, null, 2)],
      { type: "application/json;charset=utf-8" },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "campus-timetable.json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  const updatedText = data.lastSyncedAt
    ? new Date(data.lastSyncedAt).toLocaleString("zh-CN", { hour12: false })
    : "尚未同步";

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
          <span className="school-name">南京理工大学 · 官方课表同步</span>
          <button className="primary-button" onClick={exportTimetable} disabled={!allCourses.length}>
            导出课表
          </button>
        </div>
      </header>

      <main className="container">
        <section className="welcome">
          <div>
            <p className="eyebrow">YOUR CAMPUS, YOUR SCHEDULE</p>
            <h1>把每一周，安排得井井有条。</h1>
            <p className="subheading">由本机后台 Edge 执行学校官方认证页面，不弹出独立窗口；认证成功后读取个人课表，课程数据保存在本机。</p>
          </div>
          <div className="semester-card">
            <span className="semester-icon">▦</span>
            <div className="semester-card-details">
              <span className="semester-label">{data.semester ? "当前学期（教务数据）" : "当前学期（待同步确认）"}</span>
              <strong>{displayedSemester}</strong>
              <span className="semester-current-week">{currentWeek !== null ? `当前第 ${currentWeek} 教学周` : "请设置教学周起始日期"}</span>
              <span className="semester-view-week">课表正在查看第 {week} 周{currentWeek === week ? "（本周）" : ""}</span>
              <label className="term-start-setting">
                <span>第 1 教学周周一</span>
                <input
                  type="date"
                  value={termStartDate}
                  onChange={(event) => {
                    setTermStartDates((previous) => ({ ...previous, [displayedSemester]: event.target.value }));
                  }}
                  aria-label="第1教学周周一日期"
                />
              </label>
              <small className="term-start-hint">当前周数按此日期计算；同步前学期为你此前提供页面中的默认值，起始日期可按学校校历修改。</small>
              <span className="current-date-label">今天：{formatLocalDate(now)}</span>
            </div>
          </div>
        </section>

        <section className="stats">
          <article className="stat-card">
            <span>本周课程时段</span>
            <strong>{courses.length}<small> 条</small></strong>
            <p>数据来自最近一次成功同步</p>
          </article>
          <article className="stat-card">
            <span>本周上课节数</span>
            <strong>{totalPeriods}<small> 节</small></strong>
            <p>按已识别的起止节次统计</p>
          </article>
          <article className="stat-card">
            <span>本周上课天数</span>
            <strong>{studyDays}<small> 天</small></strong>
            <p>有课程时段的星期数量</p>
          </article>
        </section>

        <section className="login-panel">
          <div className="login-copy">
            <div className="login-icon">↗</div>
            <div>
              <p className="eyebrow">OFFICIAL ACADEMIC LOGIN</p>
              <h2>连接学校教务系统</h2>
              <p>已根据网上办事服务大厅返回的应用配置，使用“教务系统（师生端）”的 indexsso.jsp 启动统一身份认证。后台 Edge 会执行学校认证页自己的 JavaScript，包括动态字段和密码处理；不会弹出可见浏览器窗口。若学校要求验证码，会在这里提示。</p>
            </div>
          </div>
          <form className="login-form" onSubmit={authPhase === "needs_captcha" ? submitCaptcha : startSchoolLogin}>
            <label htmlFor="campus-username">学号</label>
            <input id="campus-username" name="username" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="请输入校园学号" disabled={authBusy} />
            <label htmlFor="campus-password">密码</label>
            <input id="campus-password" name="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="请输入校园密码" disabled={authBusy} />
            {authPhase === "needs_captcha" && (
              <div className="captcha-group">
                <label htmlFor="campus-captcha">学校验证码</label>
                <div className="captcha-row">
                  {captchaDataUrl ? <img className="captcha-image" src={captchaDataUrl} alt="学校登录验证码" /> : <span className="captcha-unavailable">验证码图片暂不可用</span>}
                  <input id="campus-captcha" name="captcha" autoComplete="off" value={captcha} onChange={(event) => setCaptcha(event.target.value)} placeholder="输入图中验证码" disabled={authBusy} />
                </div>
              </div>
            )}
            <button className="primary-button login-submit" type="submit" disabled={authBusy || Boolean(connectionError)}>{authBusy ? "请稍候…" : authPhase === "needs_captcha" ? "完成登录并获取课表" : "登录并获取课表"}</button>
          </form>
          <div className={`auth-status ${authPhase === "connected" ? "auth-success" : authPhase === "error" ? "auth-error" : ""}`}>
            <span className="status-pip" />
            <div><strong>{authPhase === "connected" ? "课表已读取" : authPhase === "error" ? "登录流程出现问题" : authPhase === "waiting_schedule" ? "等待进入个人课表" : authPhase === "schedule_not_parsed" ? "需要适配课表页面" : authPhase === "waiting_user_login" ? "等待官方认证" : authPhase === "needs_captcha" ? "需要验证码" : authPhase === "authenticating" || authPhase === "connecting" ? "正在认证" : authPhase === "session_expired" ? "登录已过期" : "连接状态"}</strong><p>{authMessage}</p></div>
          </div>
          <div className="login-actions">
            <button className="secondary-button" onClick={scanCurrentSchoolPage} disabled={authBusy || Boolean(connectionError)}>立即刷新课表</button>
            <button className="secondary-button" onClick={diagnoseSchoolFlow} disabled={authBusy || Boolean(connectionError)}>逐步检查登录链路</button>
            <button className="text-button" onClick={closeSchoolSession} disabled={authBusy}>清除本机会话</button>
          </div>
          {(authDiagnostics || authTrace.length > 0) && (
            <details className="auth-diagnostics" open>
              <summary>脱敏诊断结果（不含密码、Cookie、Token 和查询参数）</summary>
              <pre>{JSON.stringify({ diagnostics: authDiagnostics, redirectTrace: authTrace }, null, 2)}</pre>
            </details>
          )}
          <p className="security-note"><span>隐私与安全</span> 密码只提交到学校 HTTPS 统一身份认证表单，不保存到磁盘或日志。注意：学校服务卡片当前配置的 PC 入口是 HTTP，CAS 可能将一次性 ticket 通过 HTTP 回传到教务系统；这属于学校提供的旧式 SSO 链路的安全限制，请勿在不可信网络环境使用。程序不会通过 HTTP 发送账号密码，也不会绕过验证码、扫码或短信验证。</p>
        </section>

        {connectionError && (
          <section className="sync-notice">
            <strong>本机同步服务未连接</strong>
            <p>请确认 IDEA 的另一个终端正在运行 <code>node server/index.mjs</code>，并保持该终端开启。详细信息：{connectionError}</p>
          </section>
        )}

        <section className="schedule-panel">
          <div className="panel-heading">
            <div>
              <h2>每周课表</h2>
              <p>课程信息来自最近一次通过学校认证获取的课表页面；识别结果保存到本机。</p>
            </div>
            <div className="week-controls">
              <button className="week-arrow" disabled={week <= 1} onClick={() => setViewedWeek(week - 1)} aria-label="上一周">‹</button>
              <strong>第 {week} 周{currentWeek === week ? " · 本周" : ""}</strong>
              <button className="week-arrow" disabled={week >= 30} onClick={() => setViewedWeek(week + 1)} aria-label="下一周">›</button>
              <button className="today-button" onClick={returnToCurrentWeek} disabled={currentWeek === null}>{currentWeek === null ? "设置本周" : "回到本周"}</button>
            </div>
          </div>

          <div className="schedule-scroll">
            <div className="schedule" style={{ gridTemplateRows: scheduleGridTemplateRows }}>
              <div className="day-header empty-header" style={{ gridColumn: 1, gridRow: 1 }}>节次</div>
              {days.map((day, dayIndex) => (
                <div className="day-header" key={day} style={{ gridColumn: dayIndex + 2, gridRow: 1 }}>
                  <strong>周{day}</strong>
                  <span>第 {week} 周</span>
                </div>
              ))}

              {Array.from({ length: SCHEDULE_SECTION_COUNT }, (_, index) => {
                const period = index + 1;
                // Header occupies row 1; each lesson period uses exactly one following row.
                const gridRow = period + 1;
                return (
                  <div className="period-row" key={period}>
                    <div className={`period-label${period === ONLINE_SECTION ? " online-period-label" : ""}${period === 1 ? " first-period-label" : ""}`} style={{ gridColumn: 1, gridRow: `${gridRow} / span 1` }}>
                      <strong>{period}</strong>
                      <span>{formatSectionTime(period)}</span>
                    </div>
                    {days.map((day, dayIndex) => (
                      <div
                        className={`empty-slot${period === ONLINE_SECTION ? " online-period-slot" : ""}${period === 1 ? " first-period-slot" : ""}`}
                        key={day}
                        style={{ gridColumn: dayIndex + 2, gridRow: `${gridRow} / span 1` }}
                      />
                    ))}
                  </div>
                );
              })}

              {laidOutCourses.map((course) => (
                <button
                  key={course.id}
                  className={`course-card ${course.color}${course.compact ? " is-compact" : ""}${course.laneCount > 1 ? " is-overlapping" : ""}`}
                  style={{
                    gridColumn: course.day + 1,
                    gridRow: `${course.start + 1} / ${course.end + 2}`,
                    width: `calc(${100 / course.laneCount}% - 4px)`,
                    marginLeft: `${(100 * course.laneIndex) / course.laneCount}%`,
                    justifySelf: "start",
                  }}
                  onClick={() => setSelectedCourse(course)}
                  title={`${course.name} · ${course.weeks} · 星期${days[course.day - 1]} ${formatCourseTime(course)}（第 ${course.start}-${course.end} 节）${course.laneCount > 1 ? "（同一时段存在其他课程，已并排显示）" : ""}`}
                >
                  {!course.compact && <span className="course-tag">{course.weeks}</span>}
                  <strong>{course.name}</strong>
                  <span className="course-time">{course.start === ONLINE_SECTION && course.end === ONLINE_SECTION ? "网课" : formatCourseTime(course)}</span>
                  <span className="course-room">{course.room}</span>
                  {!course.compact && <span className="course-period">第 {course.start}-{course.end} 节</span>}
                </button>
              ))}
            </div>
          </div>

          {specialTimeCourses.length > 0 && (
            <section className="special-time-section" aria-label="需要核对时间的特殊节次">
              <div className="special-time-heading">
                <strong>其他特殊节次（需要核对）</strong>
                <span>{specialTimeCourses.length} 个课程时段</span>
              </div>
              <p>第 14 节已作为网课安排显示在课表最下方，不按线下钟点计算。以下仅列出超出第 1–14 节或星期字段异常的课程，具体安排请以教务系统通知为准。</p>
              <div className="special-time-list">
                {specialTimeCourses.map((course) => (
                  <button key={course.id} className={`special-time-card ${course.color}`} onClick={() => setSelectedCourse(course)}>
                    <strong>{course.name}</strong>
                    <span>星期{days[course.day - 1]} · 第 {course.start}-{course.end} 节</span>
                    <span>{formatCourseTime(course)}</span>
                    <small>{course.weeks} · {course.room}</small>
                  </button>
                ))}
              </div>
            </section>
          )}

          <div className="schedule-note">
            <span className="note-dot" />
            <span>最近同步：{updatedText}。页面每 30 秒检查一次本机数据；官方系统有变化时，请重新读取并同步。</span>
          </div>
        </section>

        <footer className="footer">
          <strong>CampusTimetable</strong>
          <span>课表仅保存在本机 · 登录密码不落盘</span>
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
              <div className="detail-row"><span>精确上课时间</span><strong>星期{days[selectedCourse.day - 1]}，{formatCourseTime(selectedCourse)}</strong></div>
              <div className="detail-row"><span>节次</span><strong>第 {selectedCourse.start}-{selectedCourse.end} 节</strong></div>
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
