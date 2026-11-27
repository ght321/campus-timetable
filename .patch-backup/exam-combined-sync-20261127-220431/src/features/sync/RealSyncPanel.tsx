import { useEffect, useState } from "react";
import type { Course, Semester } from "../../models";
import { convertLegacyCourses, type LegacyTimetable } from "./adapter";
import "./RealSyncPanel.css";

type ApiPayload = {
  ok?: boolean;
  phase?: string;
  message?: string;
  captchaDataUrl?: string;
  count?: number;
  [key: string]: unknown;
};

type HealthPayload = {
  ok?: boolean;
  service?: string;
  port?: number;
};

type Props = {
  semester: Semester;
  existingCourseCount: number;
  onImport: (courses: Course[]) => boolean;
};

const API_BASE = "http://127.0.0.1:3001";

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
          ? "本机同步服务已获取教务系统课表，但尚未导入当前浏览器。请点击“导入已获取课表（整体替换）”完成替换。"
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

  async function importLatestTimetable() {
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
      "\n\n学期：" + (returnedSemester || semester.name) + warning + "\n\n是否继续？";
    if (!window.confirm(replaceMessage)) {
      setMessage("已取消导入，现有课表没有改变。");
      return;
    }

    const saved = onImport(courses);
    if (!saved) {
      throw new Error("新课表没有成功写入浏览器本地存储，原课表未被替换。请检查页面上方的本地存储状态后重试。");
    }
    setLastSyncedCount(courses.length);
    setMessage("同步完成：已整体替换原有 " + existingCourseCount + " 条课程安排，保存新课表 " + courses.length + " 条课程时段。" + warning);
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
        await importLatestTimetable();
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
        await importLatestTimetable();
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
      await importLatestTimetable();
    } catch (error) {
      setMessage(errorText(error));
    } finally {
      setBusy(false);
    }
  }

  async function syncAgain() {
    setBusy(true);
    setMessage("正在使用当前认证会话重新读取课表……");
    try {
      const result = await api<ApiPayload>("/api/auth/scan", { method: "POST" });
      if (!result.ok) throw new Error(String(result.message || "教务系统课表抓取失败。"));
      await importLatestTimetable();
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
          <p>通过本机 Edge 登录学校教务系统，将真实课程导入当前课表。</p>
        </div>
        <div className={"real-sync-status " + (serverOnline ? "is-online" : "is-offline")}>
          <span className="real-sync-dot" />
          {serverOnline ? "本机服务在线" : "本机服务离线"}
        </div>
      </div>

      <div className="real-sync-meta">
        <span>认证状态：{phaseText(phase)}</span>
        <span>当前课程：{existingCourseCount} 条</span>
        {lastSyncedCount !== null && <span>最近导入：{lastSyncedCount} 条</span>}
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
            提交验证码
          </button>
        </div>
      )}

      <div className="real-sync-actions">
        {phase !== "connected" && phase !== "needs_captcha" && (
          <button type="button" className="real-sync-primary" onClick={login} disabled={busy || !serverOnline}>
            {busy ? "请稍候……" : "登录并获取课表"}
          </button>
        )}
        {phase === "connected" && (
          <>
            <button type="button" className="real-sync-primary" onClick={syncAgain} disabled={busy}>
              {busy ? "正在同步……" : "同步最新课表"}
            </button>
            <button type="button" onClick={importSavedTimetable} disabled={busy}>
              导入已获取课表（整体替换）
            </button>
            <button type="button" onClick={closeSession} disabled={busy}>关闭登录会话</button>
          </>
        )}
        <button type="button" onClick={() => void refreshStatus().catch((error) => setMessage(errorText(error)))} disabled={busy || !serverOnline}>
          刷新状态
        </button>
      </div>

      <p className="real-sync-message" role="status">{message}</p>
      <p className="real-sync-note">
        安全提示：账号和密码只发送到本机同步服务；服务端在进程内处理登录，不写入课表文件。请勿在公共或不可信网络环境使用学校认证。
      </p>
    </section>
  );
}
