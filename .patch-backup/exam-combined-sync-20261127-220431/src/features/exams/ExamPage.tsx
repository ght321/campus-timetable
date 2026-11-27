import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { Exam } from "../../models";
import { createCourseId } from "../../utils/id";
import "./ExamPage.css";

const API_BASE = "http://127.0.0.1:3001";
const EXAM_CACHE_KEY = "campus-exams:v1";

type ExamCache = { exams: Exam[]; lastSyncedAt: string | null };
type ApiExamPayload = { exams?: Exam[]; lastSyncedAt?: string | null; ok?: boolean; message?: string; diagnostics?: Record<string, unknown> };

function readCache(): ExamCache {
  try {
    const raw = window.localStorage.getItem(EXAM_CACHE_KEY);
    if (!raw) return { exams: [], lastSyncedAt: null };
    const parsed = JSON.parse(raw) as Partial<ExamCache>;
    return { exams: Array.isArray(parsed.exams) ? parsed.exams : [], lastSyncedAt: parsed.lastSyncedAt || null };
  } catch {
    return { exams: [], lastSyncedAt: null };
  }
}

function examDateTime(exam: Exam): number | null {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(exam.date) ? exam.date : "";
  if (!date) return null;
  const clock = exam.time.match(/(\d{1,2}):(\d{2})/);
  const value = new Date(`${date}T${clock ? `${clock[1].padStart(2, "0")}:${clock[2]}` : "00:00"}:00`);
  return Number.isNaN(value.getTime()) ? null : value.getTime();
}

function formatExamDate(value: string): string {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[1]}年${Number(match[2])}月${Number(match[3])}日` : value || "日期待公布";
}

function makeId(): string {
  return `manual-${createCourseId()}`;
}

export function ExamPage() {
  const [cache, setCache] = useState<ExamCache>(readCache);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("考试信息保存在本地，可断网查看。首次查询需要保持本机同步服务运行并登录学校教务系统。 ");
  const [error, setError] = useState("");
  const [diagnostics, setDiagnostics] = useState<Record<string, unknown> | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "upcoming" | "ended">("all");
  const [form, setForm] = useState({ name: "", date: "", time: "", room: "", seatNumber: "" });

  useEffect(() => {
    try { window.localStorage.setItem(EXAM_CACHE_KEY, JSON.stringify(cache)); }
    catch { setError("考试缓存保存失败，请检查浏览器本地存储空间。"); }
  }, [cache]);

  useEffect(() => {
    let alive = true;
    fetch(`${API_BASE}/api/exams`, { cache: "no-store" })
      .then(async (response) => response.ok ? await response.json() as ApiExamPayload : null)
      .then((payload) => {
        if (!alive || !payload || !Array.isArray(payload.exams) || !payload.exams.length) return;
        setCache((previous) => ({
          exams: [...previous.exams.filter((exam) => exam.source === "manual"), ...payload.exams!],
          lastSyncedAt: payload.lastSyncedAt || previous.lastSyncedAt,
        }));
      })
      .catch(() => { /* local cache remains available while the bridge is offline */ });
    return () => { alive = false; };
  }, []);

  async function querySchoolExams() {
    setBusy(true); setError(""); setDiagnostics(null); setMessage("正在使用已登录的学校会话，按移动端相同方式读取考试结果页……");
    try {
      const response = await fetch(`${API_BASE}/api/auth/exams`, { method: "POST", cache: "no-store" });
      const payload = await response.json() as ApiExamPayload;
      setDiagnostics(payload.diagnostics || null);
      if (!response.ok || !payload.ok) {
        setError(payload.message || `考试查询失败（HTTP ${response.status}）`);
        setMessage("本次查询未覆盖已有考试缓存。展开下方诊断信息可以查看结果页和表格结构。");
        return;
      }
      const refreshed = await fetch(`${API_BASE}/api/exams`, { cache: "no-store" });
      if (!refreshed.ok) throw new Error("考试查询完成，但读取本机考试缓存失败。");
      const saved = await refreshed.json() as ApiExamPayload;
      const schoolExams = Array.isArray(saved.exams) ? saved.exams : [];
      if (schoolExams.length) {
        setCache((previous) => ({
          exams: [...previous.exams.filter((exam) => exam.source === "manual"), ...schoolExams],
          lastSyncedAt: saved.lastSyncedAt || new Date().toISOString(),
        }));
        setMessage(`考试查询完成，获取到 ${schoolExams.length} 条学校考试安排。`);
      } else {
        setMessage(payload.message || "查询完成，但学校结果页没有可识别的考试记录；原有缓存已保留。");
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "考试查询失败。请检查本机服务和学校登录状态。");
      setMessage("本次查询未覆盖原有考试缓存。");
    } finally {
      setBusy(false);
    }
  }

  function addManualExam(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = form.name.trim();
    if (!name || !form.date) return;
    const exam: Exam = {
      id: makeId(), name, date: form.date, time: form.time.trim() || "时间待公布",
      room: form.room.trim() || "暂未安排", seatNumber: form.seatNumber.trim() || "暂未安排",
      examNumber: "", courseCode: "", level: "手动添加", invigilator: "", source: "manual",
    };
    setCache((previous) => ({ ...previous, exams: [...previous.exams, exam] }));
    setForm({ name: "", date: "", time: "", room: "", seatNumber: "" });
    setShowForm(false);
  }

  async function deleteExam(id: string) {
    const target = cache.exams.find((exam) => exam.id === id);
    if (!target || !window.confirm("确定删除这条考试记录？")) return;
    setCache((previous) => ({ ...previous, exams: previous.exams.filter((exam) => exam.id !== id) }));
    if (target.source === "school") {
      try {
        const response = await fetch(`${API_BASE}/api/exams/${encodeURIComponent(id)}`, { method: "DELETE", cache: "no-store" });
        if (!response.ok) setMessage("考试已从当前浏览器删除，但本机服务端缓存未能同步删除。请保持同步服务运行后重试。");
      } catch {
        setMessage("考试已从当前浏览器删除；本机服务离线，服务端缓存尚未删除。再次连接服务时可能重新出现。");
      }
    }
  }

  const now = Date.now();
  const visible = useMemo(() => cache.exams
    .filter((exam) => `${exam.name} ${exam.room} ${exam.courseCode} ${exam.examNumber}`.toLowerCase().includes(query.trim().toLowerCase()))
    .filter((exam) => filter === "all" || (filter === "upcoming" ? examDateTime(exam) === null || examDateTime(exam)! >= now : examDateTime(exam) !== null && examDateTime(exam)! < now))
    .sort((a, b) => (examDateTime(a) ?? Number.MAX_SAFE_INTEGER) - (examDateTime(b) ?? Number.MAX_SAFE_INTEGER)), [cache.exams, filter, now, query]);

  return (
    <section className="exam-page">
      <div className="exam-page-heading">
        <div><p className="term-kicker">EXAM ARRANGEMENT</p><h1>我的考试</h1><p>从学校教务系统查询考试安排，成功读取后保存到本机。</p></div>
        <div className="exam-count-pill"><strong>{cache.exams.length}</strong><span>场考试</span></div>
      </div>
      <div className="exam-sync-card">
        <div className="exam-sync-card-copy"><strong>学校考试安排</strong><span>使用课表同步时建立的 Edge 登录会话，不需要重新输入账号密码。</span></div>
        <button type="button" className="exam-query-button" disabled={busy} onClick={() => void querySchoolExams()}>{busy ? "正在查询…" : "↻ 查询 / 更新考试"}</button>
        {message && <p className="exam-query-message" role="status">{message}</p>}
        {error && <p className="exam-query-error" role="alert">{error}</p>}
        {diagnostics && (
          <details className="exam-diagnostics">
            <summary>查看考试查询诊断（不含账号、密码或 Cookie）</summary>
            <div className="exam-diagnostics-pages">
              {diagnostics.queryAction && (
                <small className="exam-diagnostic-action">
                  查询操作：{String((diagnostics.queryAction as Record<string, unknown>).method || "未知")} · {String((diagnostics.queryAction as Record<string, unknown>).tag || "")} · {String((diagnostics.queryAction as Record<string, unknown>).label || "未命名控件")}
                </small>
              )}
              {Array.isArray(diagnostics.pages) ? diagnostics.pages.map((page, pageIndex) => {
                const pageInfo = page as Record<string, unknown>;
                const frames = Array.isArray(pageInfo.frames) ? pageInfo.frames as Array<Record<string, unknown>> : [];
                return (
                  <section key={`${String(pageInfo.page)}-${pageIndex}`}>
                    <strong>{String(pageInfo.page || "未知页面")}</strong>
                    {frames.map((frame, frameIndex) => (
                      <div className="exam-diagnostic-frame" key={`${String(frame.url)}-${frameIndex}`}>
                        <span>{String(frame.title || frame.url || "页面框架")}</span>
                        {Array.isArray(frame.controls) && frame.controls.length > 0 && (
                          <small>控件：{(frame.controls as Array<Record<string, unknown>>).map((control) => `${String(control.tag)}:${String(control.text)}`).join("、")}</small>
                        )}
                        {Array.isArray(frame.forms) && frame.forms.length > 0 && (
                          <small>表单：{(frame.forms as Array<Record<string, unknown>>).map((form) => `${String(form.method)} ${String(form.action)}`).join("；")}</small>
                        )}
                        {Array.isArray(frame.tables) && frame.tables.length > 0 && (
                          <small>表格：{(frame.tables as Array<Record<string, unknown>>).map((table) => `#${String(table.id || "无ID")} ${String(table.rows)}行 [${Array.isArray(table.header) ? (table.header as string[]).join(" / ") : "无表头"}]`).join("；")}</small>
                        )}
                      </div>
                    ))}
                  </section>
                );
              }) : <pre>{JSON.stringify(diagnostics, null, 2)}</pre>}
            </div>
          </details>
        )}
      </div>

      <div className="exam-list-toolbar">
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索考试名称、考场或课程编号" aria-label="搜索考试" />
        <div className="exam-filter-tabs">
          <button className={filter === "all" ? "is-active" : ""} onClick={() => setFilter("all")}>全部</button>
          <button className={filter === "upcoming" ? "is-active" : ""} onClick={() => setFilter("upcoming")}>未开始</button>
          <button className={filter === "ended" ? "is-active" : ""} onClick={() => setFilter("ended")}>已结束</button>
        </div>
      </div>

      <div className="exam-manual-heading"><div><strong>考试日程</strong><span>{visible.length} 条记录</span></div><button type="button" className="secondary-pill" onClick={() => setShowForm((value) => !value)}>{showForm ? "取消添加" : "+ 手动添加"}</button></div>
      {showForm && (
        <form className="exam-manual-form" onSubmit={addManualExam}>
          <label>考试名称<input required value={form.name} onChange={(event) => setForm((value) => ({ ...value, name: event.target.value }))} placeholder="例如：数据结构期末考试" /></label>
          <label>考试日期<input required type="date" value={form.date} onChange={(event) => setForm((value) => ({ ...value, date: event.target.value }))} /></label>
          <label>考试时间<input value={form.time} onChange={(event) => setForm((value) => ({ ...value, time: event.target.value }))} placeholder="例如：09:00–11:00" /></label>
          <label>考场<input value={form.room} onChange={(event) => setForm((value) => ({ ...value, room: event.target.value }))} placeholder="例如：第二教学楼 203" /></label>
          <label>座位号<input value={form.seatNumber} onChange={(event) => setForm((value) => ({ ...value, seatNumber: event.target.value }))} placeholder="选填" /></label>
          <div className="exam-manual-actions"><button className="exam-query-button" type="submit">保存考试</button></div>
        </form>
      )}

      {visible.length === 0 ? (
        <div className="exam-empty-state"><span>▤</span><strong>{cache.exams.length ? "没有匹配的考试记录" : "暂时还没有考试安排"}</strong><p>{cache.exams.length ? "尝试更换搜索关键词或筛选条件。" : "先在“个人信息”页面登录并同步课表，再回到这里查询学校考试安排；也可以手动添加。"}</p></div>
      ) : (
        <div className="exam-cards-list">
          {visible.map((exam) => {
            const timestamp = examDateTime(exam);
            const ended = timestamp !== null && timestamp < now;
            const daysLeft = timestamp === null ? null : Math.ceil((timestamp - now) / 86400000);
            return (
              <article className={`exam-card${ended ? " is-ended" : ""}`} key={exam.id}>
                <div className="exam-date-block"><strong>{formatExamDate(exam.date).replace(/^\d{4}年/, "")}</strong><span>{formatExamDate(exam.date).match(/^\d{4}年/)?.[0] || "日期待定"}</span></div>
                <div className="exam-main"><div className="exam-title-row"><h3>{exam.name}</h3><span className={`exam-state ${ended ? "ended" : "upcoming"}`}>{ended ? "已结束" : daysLeft === 0 ? "今天考试" : daysLeft === null ? "待确认时间" : `还有 ${daysLeft} 天`}</span></div>
                  <div className="exam-meta"><span>◷ {exam.time || "时间待公布"}</span><span>⌖ 考场：{exam.room || "暂未安排"}</span><span>座位号：{exam.seatNumber || "暂未安排"}</span>{exam.courseCode && <span>课程编号：{exam.courseCode}</span>}{exam.examNumber && <span>考试场次：{exam.examNumber}</span>}</div>
                  <div className="exam-card-footer"><small>{exam.source === "manual" ? "手动添加" : "学校考试安排"}</small><button type="button" className="exam-delete-button" onClick={() => deleteExam(exam.id)}>删除</button></div>
                </div>
              </article>
            );
          })}
        </div>
      )}
      <p className="exam-cache-note">{cache.lastSyncedAt ? `最近同步：${new Date(cache.lastSyncedAt).toLocaleString("zh-CN", { hour12: false })}` : "考试信息尚未同步"} · 本地缓存已启用，断网可查看</p>
    </section>
  );
}
