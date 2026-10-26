import { useRef, useState } from "react";
import type { TimetableData } from "../../models";
import { downloadData, parseImport } from "../../services/importExport";
import { conflicts } from "../../utils/timetable";
import { Modal } from "../Common/Modal";
export function DataTools({
  data,
  onImport,
  onReset,
  onSettings,
}: {
  data: TimetableData;
  onImport: (d: TimetableData) => void;
  onReset: () => void;
  onSettings: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<ReturnType<typeof parseImport> | null>(
      null,
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <>
      <div className="header-right">
        <button onClick={onSettings}>学期设置</button>
        <button disabled={busy} onClick={() => input.current?.click()}>
          {busy ? "读取中…" : "导入JSON"}
        </button>
        <button className="primary-button" onClick={() => downloadData(data)}>
          导出课表
        </button>
        <button onClick={onReset}>恢复演示数据</button>
        <input
          ref={input}
          hidden
          type="file"
          accept=".json,application/json"
          aria-label="选择课表JSON"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            setError("");
            setPreview(null);
            setBusy(true);
            try {
              if (file.size > 2_000_000) throw new Error("文件过大（最多2MB）");
              setPreview(parseImport(await file.text(), data.semester));
            } catch (err) {
              setError(err instanceof Error ? err.message : "文件读取失败");
            } finally {
              setBusy(false);
            }
          }}
        />
      </div>
      {error && (
        <Modal title="导入失败" onClose={() => setError("")}>
          <p role="alert" className="error">
            {error}
          </p>
        </Modal>
      )}
      {preview && (
        <Modal title="导入预览" onClose={() => setPreview(null)}>
          <p>将替换当前学期与全部课程，请先导出备份。</p>
          <p>
            <strong>{preview.data.semester.name}</strong> ·{" "}
            {preview.data.semester.startDate} ·{" "}
            {preview.data.semester.totalWeeks}周 · 每日
            {preview.data.semester.periodsPerDay}节
          </p>
          {preview.legacy && (
            <p className="warning">
              已转换旧版JSON：数字ID转为文本，周次范围转为全部周。旧版不含学期配置，将采用当前学期设置；旧版week仅为显示状态，不作为真实教学周。
            </p>
          )}
          <p>
            共 {preview.data.courses.length} 条课程；
            {
              preview.data.courses.filter(
                (c) => conflicts(c, preview.data.courses).length > 0,
              ).length
            }{" "}
            条涉及时间冲突。
          </p>
          <ul className="preview-list">
            {preview.data.courses.map((c) => (
              <li key={c.id}>
                {c.name} · {c.teacher} · {c.room}
              </li>
            ))}
          </ul>
          <div className="actions">
            <button onClick={() => setPreview(null)}>取消</button>
            <button
              className="primary-button"
              onClick={() => {
                onImport(preview.data);
                setPreview(null);
              }}
            >
              确认替换（含冲突课程）
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
