import { useState } from "react";
import type { Semester } from "../../models";
import { validateSemester } from "../../utils/validation";
import { Modal } from "../../components/Common/Modal";
export function SemesterForm({
  initial,
  onSave,
  onClose,
}: {
  initial: Semester;
  onSave: (s: Semester) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(initial),
    [error, setError] = useState("");
  return (
    <Modal title="学期设置" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          try {
            onSave(validateSemester(draft));
          } catch (err) {
            setError(err instanceof Error ? err.message : "设置无效");
          }
        }}
      >
        <div className="form-grid">
          <label>
            学期名称
            <input
              required
              maxLength={100}
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </label>
          <label>
            开学日期
            <input
              type="date"
              required
              min="1900-01-01"
              max="2100-12-31"
              value={draft.startDate}
              onChange={(e) =>
                setDraft({ ...draft, startDate: e.target.value })
              }
            />
          </label>
          <label>
            总教学周数
            <input
              required
              type="number"
              min={1}
              max={53}
              value={draft.totalWeeks || ""}
              onChange={(e) =>
                setDraft({ ...draft, totalWeeks: Number(e.target.value) })
              }
            />
          </label>
          <label>
            每日课程节次
            <input
              required
              type="number"
              min={1}
              max={24}
              value={draft.periodsPerDay || ""}
              onChange={(e) =>
                setDraft({ ...draft, periodsPerDay: Number(e.target.value) })
              }
            />
          </label>
        </div>
        <p className="hint">
          开学日期所在的周一至周日为第1教学周；单双周按教学周编号判断。缩短周数或节次前，请先修改超出范围的课程。
        </p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="actions">
          <button type="button" onClick={onClose}>
            取消
          </button>
          <button className="primary-button">保存学期</button>
        </div>
      </form>
    </Modal>
  );
}
