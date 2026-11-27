import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { Exam } from "../../models";
import { createCourseId } from "../../utils/id";
import "./ExamPage.css";

const API_BASE = "http://127.0.0.1:3001";
const EXAM_CACHE_KEY = "campus-exams:v1";

type ExamCache = { exams: Exam[]; lastSyncedAt: string | null };

type DateParts = {
  year: string;
  month: string;
  day: string;
  weekday: string;
};

function readCache(): ExamCache {
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

function dateParts(value: string): DateParts | null {
  const match = String(value || "").match(/(20\d{2})[年./-](\d{1,2})[月./-](\d{1,2})日?/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  return {
    year: String(year),
    month: String(month).padStart(2, "0"),
    day: String(day).padStart(2, "0"),
    weekday: weekdays[date.getDay()],
  };
}

function examDateTime(exam: Exam): number | null {
  const parts = dateParts(exam.date);
  if (!parts) return null;
  const clock = String(exam.time || "").match(/(\d{1,2}):(\d{2})/);
  const hour = clock ? Number(clock[1]) : 0;
  const minute = clock ? Number(clock[2]) : 0;
  const value = new Date(Number(parts.year), Number(parts.month) - 1, Number(parts.day), hour, minute);
  return Number.isNaN(value.getTime()) ? null : value.getTime();
}

function formatLastSynced(value: string | null): string {
  if (!value) return "尚未同步";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "尚未同步";
  return date.toLocaleString("zh-CN", { hour12: false });
}

function makeId(): string {
  return `manual-${createCourseId()}`;
}

export function ExamPage() {
  const [cache, setCache] = useState<ExamCache>(readCache);
  const [message, setMessage] = useState("");
  const [storageError, setStorageError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "upcoming" | "ended">("all");
  const [form, setForm] = useState({ name: "", date: "", time: "", room: "", seatNumber: "" });
  const [now] = useState(() => Date.now());

  // The exam page is intentionally cache-only. It does not query the school or
  // the local bridge when opened; the profile sync flow refreshes both datasets.
  useEffect(() => {
    try {
      window.localStorage.setItem(EXAM_CACHE_KEY, JSON.stringify(cache));
      setStorageError("");
    } catch {
      setStorageError("考试信息暂时无法保存到本机，请检查浏览器本地存储空间。");
    }
  }, [cache]);

  function addManualExam(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = form.name.trim();
    if (!name || !form.date) return;
    const exam: Exam = {
      id: makeId(),
      name,
      date: form.date,
      time: form.time.trim() || "时间待公布",
      room: form.room.trim() || "暂未安排",
      seatNumber: form.seatNumber.trim() || "暂未安排",
      examNumber: "",
      courseCode: "",
      level: "手动添加",
      invigilator: "",
      source: "manual",
    };
    setCache((previous) => ({ ...previous, exams: [...previous.exams, exam] }));
    setForm({ name: "", date: "", time: "", room: "", seatNumber: "" });
    setShowForm(false);
    setMessage("已添加考试，并保存到本机。");
  }

  async function deleteExam(id: string) {
    const target = cache.exams.find((exam) => exam.id === id);
    if (!target || !window.confirm(`确定删除「${target.name}」这条考试记录？`)) return;
    setCache((previous) => ({ ...previous, exams: previous.exams.filter((exam) => exam.id !== id) }));
    setMessage("考试记录已从本机列表删除。");

    if (target.source === "school") {
      try {
        const response = await fetch(`${API_BASE}/api/exams/${encodeURIComponent(id)}`, {
          method: "DELETE",
          cache: "no-store",
        });
        if (!response.ok) {
          setMessage("本机考试列表已删除该记录，但同步服务端删除失败；下次同步时学校仍返回的记录可能重新出现。");
        }
      } catch {
        setMessage("本机考试列表已删除该记录；同步服务离线，服务端记录尚未删除，下次同步时可能重新出现。");
      }
    }
  }

  const visible = useMemo(() => cache.exams
    .filter((exam) => `${exam.name} ${exam.room} ${exam.courseCode} ${exam.examNumber} ${exam.invigilator}`
      .toLowerCase().includes(query.trim().toLowerCase()))
    .filter((exam) => {
      const timestamp = examDateTime(exam);
      if (filter === "all") return true;
      if (filter === "upcoming") return timestamp === null || timestamp >= now;
      return timestamp !== null && timestamp < now;
    })
    .sort((a, b) => (examDateTime(a) ?? Number.MAX_SAFE_INTEGER) - (examDateTime(b) ?? Number.MAX_SAFE_INTEGER)),
  [cache.exams, filter, now, query]);

  const upcomingCount = cache.exams.filter((exam) => {
    const timestamp = examDateTime(exam);
    return timestamp === null || timestamp >= now;
  }).length;
  const endedCount = cache.exams.length - upcomingCount;
  const schoolCount = cache.exams.filter((exam) => exam.source !== "manual").length;

  return (
    <section className="exam-page">
      <header className="exam-hero">
        <div className="exam-hero-copy">
          <p className="exam-eyebrow">EXAM ARRANGEMENT</p>
          <h1>我的考试</h1>
          <p>考试安排一目了然，时间、考场和座位信息都在这里。</p>
        </div>
        <div className="exam-hero-count" aria-label={`共 ${cache.exams.length} 场考试`}>
          <span>本学期考试</span>
          <strong>{cache.exams.length}</strong>
          <small>场安排</small>
        </div>
      </header>

      <section className="exam-sync-banner" aria-label="考试同步状态">
        <span className="exam-sync-icon" aria-hidden="true">✓</span>
        <div className="exam-sync-banner-copy">
          <strong>考试信息自动同步</strong>
          <span>在“个人信息”页点击“同步课表和考试”，考试记录会随课表一起更新。打开本页只读取本地缓存，不会再次查询教务系统。</span>
        </div>
        <div className="exam-sync-time">
          <small>最近同步</small>
          <strong>{formatLastSynced(cache.lastSyncedAt)}</strong>
        </div>
      </section>

      <div className="exam-overview-grid">
        <div className="exam-overview-card total">
          <span className="overview-icon" aria-hidden="true">▤</span>
          <div><small>全部考试</small><strong>{cache.exams.length}<em>场</em></strong></div>
        </div>
        <div className="exam-overview-card upcoming">
          <span className="overview-icon" aria-hidden="true">◷</span>
          <div><small>待参加</small><strong>{upcomingCount}<em>场</em></strong></div>
        </div>
        <div className="exam-overview-card ended">
          <span className="overview-icon" aria-hidden="true">✓</span>
          <div><small>已结束</small><strong>{endedCount}<em>场</em></strong></div>
        </div>
      </div>

      <div className="exam-list-toolbar">
        <label className="exam-search-box">
          <span aria-hidden="true">⌕</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索考试名称、考场或课程编号"
            aria-label="搜索考试"
          />
        </label>
        <div className="exam-toolbar-actions">
          <div className="exam-filter-tabs" aria-label="考试筛选">
            <button type="button" className={filter === "all" ? "is-active" : ""} onClick={() => setFilter("all")}>全部</button>
            <button type="button" className={filter === "upcoming" ? "is-active" : ""} onClick={() => setFilter("upcoming")}>未开始</button>
            <button type="button" className={filter === "ended" ? "is-active" : ""} onClick={() => setFilter("ended")}>已结束</button>
          </div>
          <button type="button" className="exam-add-button" onClick={() => setShowForm((value) => !value)}>
            {showForm ? "取消添加" : "+ 手动添加"}
          </button>
        </div>
      </div>

      {message && <p className="exam-page-message" role="status">{message}</p>}
      {storageError && <p className="exam-page-error" role="alert">{storageError}</p>}

      {showForm && (
        <form className="exam-manual-form" onSubmit={addManualExam}>
          <div className="exam-form-heading"><strong>添加个人考试</strong><span>填写考试基本信息后保存到本机</span></div>
          <label>考试名称<input required value={form.name} onChange={(event) => setForm((value) => ({ ...value, name: event.target.value }))} placeholder="例如：数据结构期末考试" /></label>
          <label>考试日期<input required type="date" value={form.date} onChange={(event) => setForm((value) => ({ ...value, date: event.target.value }))} /></label>
          <label>考试时间<input value={form.time} onChange={(event) => setForm((value) => ({ ...value, time: event.target.value }))} placeholder="例如：09:00–11:00" /></label>
          <label>考场<input value={form.room} onChange={(event) => setForm((value) => ({ ...value, room: event.target.value }))} placeholder="例如：第二教学楼 203" /></label>
          <label>座位号<input value={form.seatNumber} onChange={(event) => setForm((value) => ({ ...value, seatNumber: event.target.value }))} placeholder="选填" /></label>
          <div className="exam-manual-actions"><button type="submit" className="exam-add-button">保存考试</button></div>
        </form>
      )}

      <div className="exam-section-heading">
        <div><strong>考试日程</strong><span>{visible.length} 条记录</span></div>
        <small>{schoolCount} 条来自教务系统 · {cache.exams.length - schoolCount} 条个人添加</small>
      </div>

      {visible.length === 0 ? (
        <div className="exam-empty-state">
          <span className="exam-empty-icon" aria-hidden="true">▤</span>
          <strong>{cache.exams.length ? "没有匹配的考试记录" : "暂时还没有考试安排"}</strong>
          <p>{cache.exams.length
            ? "尝试更换搜索关键词或筛选条件。"
            : "前往“个人信息”页面，点击“同步课表和考试”。学校考试安排会自动保存到这里，无需单独查询；也可以手动添加个人考试。"}</p>
        </div>
      ) : (
        <div className="exam-cards-list">
          {visible.map((exam) => {
            const timestamp = examDateTime(exam);
            const ended = timestamp !== null && timestamp < now;
            const daysLeft = timestamp === null ? null : Math.ceil((timestamp - now) / 86400000);
            const parts = dateParts(exam.date);
            const statusText = ended
              ? "已结束"
              : daysLeft === 0
                ? "今天考试"
                : daysLeft === null
                  ? "时间待确认"
                  : `还有 ${daysLeft} 天`;
            return (
              <article className={`exam-card${ended ? " is-ended" : ""}`} key={exam.id}>
                <div className="exam-card-date">
                  <span>{parts ? `${parts.month} 月` : "考试日期"}</span>
                  <strong>{parts ? parts.day : "待定"}</strong>
                  <small>{parts ? `${parts.year} · ${parts.weekday}` : "以教务通知为准"}</small>
                </div>
                <div className="exam-card-content">
                  <div className="exam-title-row">
                    <div><h2>{exam.name}</h2><span className="exam-source-label">{exam.source === "manual" ? "个人添加" : "教务系统"}</span></div>
                    <span className={`exam-state ${ended ? "ended" : "upcoming"}`}>{statusText}</span>
                  </div>
                  <div className="exam-info-grid">
                    <div className="exam-info-item">
                      <span className="exam-info-icon" aria-hidden="true">◷</span>
                      <div><small>考试时间</small><strong>{exam.time || "时间待公布"}</strong></div>
                    </div>
                    <div className="exam-info-item">
                      <span className="exam-info-icon" aria-hidden="true">⌖</span>
                      <div><small>考试地点</small><strong>{exam.room || "暂未安排"}</strong></div>
                    </div>
                    <div className="exam-info-item">
                      <span className="exam-info-icon" aria-hidden="true">▣</span>
                      <div><small>座位号</small><strong>{exam.seatNumber || "暂未安排"}</strong></div>
                    </div>
                    {exam.courseCode && (
                      <div className="exam-info-item">
                        <span className="exam-info-icon" aria-hidden="true">#</span>
                        <div><small>课程编号</small><strong>{exam.courseCode}</strong></div>
                      </div>
                    )}
                    {exam.examNumber && (
                      <div className="exam-info-item">
                        <span className="exam-info-icon" aria-hidden="true">№</span>
                        <div><small>考试场次</small><strong>{exam.examNumber}</strong></div>
                      </div>
                    )}
                    {exam.invigilator && (
                      <div className="exam-info-item">
                        <span className="exam-info-icon" aria-hidden="true">♙</span>
                        <div><small>监考教师</small><strong>{exam.invigilator}</strong></div>
                      </div>
                    )}
                    {exam.level && (
                      <div className="exam-info-item">
                        <span className="exam-info-icon" aria-hidden="true">◇</span>
                        <div><small>考试类型</small><strong>{exam.level}</strong></div>
                      </div>
                    )}
                  </div>
                  <div className="exam-card-footer">
                    <span>{exam.source === "manual" ? "已保存到本机" : "学校官方考试安排"}</span>
                    <button type="button" className="exam-delete-button" onClick={() => void deleteExam(exam.id)}>删除</button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <p className="exam-cache-note">考试数据保存在当前设备中，断网也可查看。最近同步：{formatLastSynced(cache.lastSyncedAt)}</p>
    </section>
  );
}
