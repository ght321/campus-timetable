import { useEffect, useState } from "react";
import type { Course, Exam, Semester } from "../../models";
import { convertLegacyCourses, type LegacyTimetable } from "./adapter";
import "./RealSyncPanel.css";

type ApiPayload = {
  ok?: boolean;
  phase?: string;
  message?: string;
  captchaDataUrl?: string;
  count?: number;
  lastSyncedAt?: string | null;
  [key: string]: unknown;
};

type HealthPayload = {
  ok?: boolean;
  service?: string;
  port?: number;
};

type ExamApiPayload = {
  exams?: Exam[];
  lastSyncedAt?: string | null;
};

type ExamCache = {
  exams: Exam[];
  lastSyncedAt: string | null;
};

type Props = {
  semester: Semester;
  existingCourseCount: number;
  onImport: (courses: Course[]) => boolean;
};

const API_BASE = "http://127.0.0.1:3001";
const EXAM_CACHE_KEY = "campus-exams:v1";

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(API_BASE + path, {
      cache: "no-store",
      ...init,
      headers: {
        ...(init && init.headers ? init.headers : {}),
      },
    });
  } catch {
    throw new Error("无法连接本机同步服务。请确认另一个 PowerShell 窗口仍在运行 npm run sync。");
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error("同步服务返回了无法解析的数据（HTTP " + response.status + "）。");
  }
  const record = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  if (!response.ok && !record.phase) {
    throw new Error(String(record.message || ("同步服务请求失败（HTTP " + response.status + "）")));
  }
  return payload as T;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "发生未知错误。";
}

function phaseText(phase: string): string {
  if (phase === "connected") return "已登录";
  if (phase === "needs_captcha") return "需要验证码";
  if (phase === "error") return "连接异常";
  if (phase === "starting" || phase === "authenticating") return "正在登录";
  return "未登录";
}

function readLocalExamCache(): ExamCache {
  try {
    const raw = window.localStorage.getItem(EXAM_CACHE_KEY);
    if (!raw) return { exams: [], lastSyncedAt: null };
    const parsed = JSON.parse(raw) as Partial<ExamCache>;
    return {
      exams: Array.isArray(parsed.exams) ? parsed.exams : [],
      lastSyncedAt: parsed.lastSyncedAt || null,
    };
  } catch {
    return { exams: [], lastSyncedAt: null };
  }
}

/**
 * Refresh the school's exam list once, after the timetable has been imported.
 * Manual exams are kept; the previous school list is replaced only when the
 * server returns a non-empty, successfully parsed list.
 */
async function syncSchoolExams(): Promise<number> {
  const result = await api<ApiPayload>("/api/auth/exams", { method: "POST" });
  if (!result.ok) {
    throw new Error(String(result.message || "学校考试安排读取失败；原有考试缓存已保留。"));
  }

  const saved = await api<ExamApiPayload>("/api/exams");
  const schoolExams = Array.isArray(saved.exams)
    ? saved.exams
      .filter((exam) => Boolean(exam && exam.name))
      .map((exam) => ({ ...exam, source: "school" as const }))
    : [];

  if (schoolExams.length === 0) {
    throw new Error("考试查询已完成，但本机服务没有返回可保存的考试记录；原有考试缓存已保留。");
  }

  const previous = readLocalExamCache();
  const manualExams = previous.exams.filter((exam) => exam.source === "manual");
  const nextCache: ExamCache = {
    exams: [...manualExams, ...schoolExams],
    lastSyncedAt: saved.lastSyncedAt || result.lastSyncedAt || new Date().toISOString(),
  };

  try {
    window.localStorage.setItem(EXAM_CACHE_KEY, JSON.stringify(nextCache));
  } catch {
    throw new Error("学校已读取到考试安排，但考试缓存无法写入当前浏览器。请检查本地存储空间；原有考试缓存未主动清除。");
  }

  return schoolExams.length;
}

export function RealSyncPanel({ semester, existingCourseCount, onImport }: Props) {
  const [serverOnline, setServerOnline] = useState(false);
  const [phase, setPhase] = useState("checking");
  const [message, setMessage] = useState("正在检查本机同步服务……");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [captcha, setCaptcha] = useState("");
  const [captchaDataUrl, setCaptchaDataUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastSyncedCount, setLastSyncedCount] = useState<number | null>(null);
  const [lastExamSyncedCount, setLastExamSyncedCount] = useState<number | null>(null);
  const [schoolSemester, setSchoolSemester] = useState("");

  useEffect(() => {
    let active = true;
    async function checkService() {
      try {
        const health = await api<HealthPayload>("/api/health");
        if (!active) return;
        setServerOnline(Boolean(health.ok));
        const status = await api<ApiPayload>("/api/auth/status");
        if (!active) return;
        setPhase(String(status.phase || "idle"));
        setMessage(status.phase === "connected"
          ? "学校认证会话已连接。点击“同步课表和考试”，即可一次更新两类数据。"
          : String(status.message || "同步服务已连接。"));
        setCaptchaDataUrl(String(status.captchaDataUrl || ""));
      } catch (error) {
        if (!active) return;
        setServerOnline(false);
        setPhase("offline");
        setMessage(errorText(error));
      }
    }
    void checkService();
    return () => { active = false; };
  }, []);

  async function refreshStatus(): Promise<ApiPayload> {
    const status = await api<ApiPayload>("/api/auth/status");
    setPhase(String(status.phase || "idle"));
    setMessage(String(status.message || "已刷新认证状态。"));
    setCaptchaDataUrl(String(status.captchaDataUrl || ""));
    return status;
  }

  async function importLatestTimetable(syncExamsAfterImport = false): Promise<boolean> {
    const timetable = await api<LegacyTimetable>("/api/timetable");
    const oldCourses = Array.isArray(timetable.courses) ? timetable.courses : [];
    const courses = convertLegacyCourses(oldCourses, semester);
    const returnedSemester = String(timetable.semester || "").trim();
    if (returnedSemester) setSchoolSemester(returnedSemester);

    const semesterMismatch = returnedSemester && semester.name && returnedSemester !== semester.name;
    const warning = semesterMismatch
      ? "\n学校返回学期为「" + returnedSemester + "」，项目当前学期为「" + semester.name + "」。导入会沿用项目当前学期日期和总周数，请确认学期设置正确。"
      : "";
    const replaceMessage =
      "即将导入 " + courses.length + " 条课程时段，并替换当前全部 " + existingCourseCount + " 条课程安排。" +
      (syncExamsAfterImport ? "\n本次还会自动同步学校考试安排，不需要再进入考试页查询。" : "") +
      "\n\n学期：" + (returnedSemester || semester.name) + warning + "\n\n是否继续？";
    if (!window.confirm(replaceMessage)) {
      setMessage("已取消导入，现有课表和考试缓存均未改变。");
      return false;
    }

    const saved = onImport(courses);
    if (!saved) {
      throw new Error("新课表没有成功写入浏览器本地存储，原课表未被替换。请检查页面上方的本地存储状态后重试。");
    }

    setLastSyncedCount(courses.length);
    if (!syncExamsAfterImport) {
      setMessage("课表导入完成：保存 " + courses.length + " 条课程时段。此操作只导入已缓存课表，没有重新查询学校考试。");
      return true;
    }

    setMessage("课表已更新（" + courses.length + " 条课程时段），正在使用同一登录会话同步考试安排……");
    try {
      const examCount = await syncSchoolExams();
      setLastExamSyncedCount(examCount);
      setMessage(
        "同步完成：课表 " + courses.length + " 条，考试 " + examCount + " 场。考试记录已保存到本机，打开“考试”页面即可查看，无需再次查询。" + warning,
      );
    } catch (error) {
      setMessage(
        "课表已同步 " + courses.length + " 条；但考试同步未完成：" + errorText(error) + "\n再次点击“同步课表和考试”可一并重试，已有考试缓存会保留。" + warning,
      );
    }
    return true;
  }

  async function login() {
    if (!username.trim() || !password) {
      setMessage("请先输入教务系统账号和密码。");
      return;
    }
    setBusy(true);
    setMessage("正在启动学校官方登录流程……");
    try {
      const result = await api<ApiPayload>("/api/auth/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const currentPhase = String(result.phase || (result.ok ? "connected" : "error"));
      setPhase(currentPhase);
      setCaptchaDataUrl(String(result.captchaDataUrl || ""));
      setMessage(String(result.message || "登录流程已返回。"));
      if (currentPhase === "connected") {
        setPassword("");
        await importLatestTimetable(true);
      } else if (currentPhase !== "needs_captcha") {
        await refreshStatus().catch(() => undefined);
      }
    } catch (error) {
      setMessage(errorText(error));
    } finally {
      setBusy(false);
    }
  }

  async function submitCaptcha() {
    if (!captcha.trim()) {
      setMessage("请输入验证码。");
      return;
    }
    setBusy(true);
    setMessage("正在提交验证码并完成登录……");
    try {
      const result = await api<ApiPayload>("/api/auth/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password, captcha: captcha.trim() }),
      });
      const currentPhase = String(result.phase || (result.ok ? "connected" : "error"));
      setPhase(currentPhase);
      setCaptchaDataUrl(String(result.captchaDataUrl || ""));
      setMessage(String(result.message || "验证码处理完成。"));
      if (currentPhase === "connected") {
        setPassword("");
        setCaptcha("");
        await importLatestTimetable(true);
      }
    } catch (error) {
      setMessage(errorText(error));
    } finally {
      setBusy(false);
    }
  }

  async function importSavedTimetable() {
    setBusy(true);
    setMessage("正在导入服务端已获取的课表；确认后将整体替换当前浏览器课表……");
    try {
      await importLatestTimetable(false);
    } catch (error) {
      setMessage(errorText(error));
    } finally {
      setBusy(false);
    }
  }

  async function syncAgain() {
    setBusy(true);
    setMessage("正在使用当前认证会话同步课表和考试安排……");
    try {
      const result = await api<ApiPayload>("/api/auth/scan", { method: "POST" });
      if (!result.ok) throw new Error(String(result.message || "教务系统课表抓取失败。"));
      await importLatestTimetable(true);
    } catch (error) {
      setMessage(errorText(error));
      await refreshStatus().catch(() => undefined);
    } finally {
      setBusy(false);
    }
  }

  async function closeSession() {
    setBusy(true);
    try {
      const result = await api<ApiPayload>("/api/auth/close", { method: "POST" });
      setPhase(String(result.phase || "idle"));
      setMessage(String(result.message || "已关闭本机认证会话。"));
      setPassword("");
      setCaptcha("");
      setCaptchaDataUrl("");
    } catch (error) {
      setMessage(errorText(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="real-sync-panel" aria-labelledby="real-sync-heading">
      <div className="real-sync-heading">
        <div>
          <p className="real-sync-eyebrow">REAL ACADEMIC SYNC</p>
          <h2 id="real-sync-heading">教务系统真实同步</h2>
          <p>登录一次即可同步真实课表和考试安排；考试记录会自动保存在本机。</p>
        </div>
        <div className={"real-sync-status " + (serverOnline ? "is-online" : "is-offline")}>
          <span className="real-sync-dot" />
          {serverOnline ? "本机服务在线" : "本机服务离线"}
        </div>
      </div>

      <div className="real-sync-meta">
        <span>认证状态：{phaseText(phase)}</span>
        <span>当前课程：{existingCourseCount} 条</span>
        {lastSyncedCount !== null && <span>本次课程：{lastSyncedCount} 条</span>}
        {lastExamSyncedCount !== null && <span>本次考试：{lastExamSyncedCount} 场</span>}
        {schoolSemester && <span>学校学期：{schoolSemester}</span>}
      </div>

      {phase !== "connected" && (
        <div className="real-sync-fields">
          <label>
            教务系统账号
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              placeholder="请输入校园账号"
              disabled={busy}
            />
          </label>
          <label>
            教务系统密码
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              placeholder="仅用于本次登录，不会保存到课表"
              disabled={busy}
            />
          </label>
        </div>
      )}

      {phase === "needs_captcha" && (
        <div className="real-sync-captcha">
          {captchaDataUrl && <img src={captchaDataUrl} alt="教务系统验证码" />}
          <label>
            验证码
            <input
              value={captcha}
              onChange={(event) => setCaptcha(event.target.value)}
              autoComplete="one-time-code"
              placeholder="请输入图片中的验证码"
              disabled={busy}
            />
          </label>
          <button type="button" onClick={submitCaptcha} disabled={busy || !serverOnline}>
            提交验证码并同步课表和考试
          </button>
        </div>
      )}

      <div className="real-sync-actions">
        {phase !== "connected" && phase !== "needs_captcha" && (
          <button type="button" className="real-sync-primary" onClick={login} disabled={busy || !serverOnline}>
            {busy ? "请稍候……" : "登录并同步课表和考试"}
          </button>
        )}
        {phase === "connected" && (
          <>
            <button type="button" className="real-sync-primary" onClick={syncAgain} disabled={busy}>
              {busy ? "正在同步课表和考试……" : "同步课表和考试"}
            </button>
            <button type="button" onClick={importSavedTimetable} disabled={busy}>
              仅导入已缓存课表
            </button>
            <button type="button" onClick={closeSession} disabled={busy}>关闭登录会话</button>
          </>
        )}
        <button type="button" onClick={() => void refreshStatus().catch((error) => setMessage(errorText(error)))} disabled={busy || !serverOnline}>
          刷新状态
        </button>
      </div>

      <p className="real-sync-message" role="status" aria-live="polite">{message}</p>
      <p className="real-sync-note">
        同步说明：一次“同步课表和考试”会先更新课表，再使用同一登录会话读取考试并写入本地缓存。打开考试页只展示缓存，不会再次访问学校查询。账号和密码仅用于本次登录，不写入课表文件。
      </p>
    </section>
  );
}
