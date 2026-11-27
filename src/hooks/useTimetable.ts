import { useState } from "react";
import type { TimetableData } from "../models";
import { browserLoad, browserSave } from "../services/storage";
import { validateData } from "../utils/validation";
export function useTimetable() {
  const [loaded] = useState(browserLoad);
  const [data, setData] = useState(loaded.data);
  const [storageMessage, setStorageMessage] = useState(loaded.warning);
  const [writable, setWritable] = useState(loaded.writable);
  function commit(next: TimetableData, reset = false): boolean {
    const valid = validateData(next);
    if (!writable && !reset) {
      setData(valid);
      setStorageMessage(
        "本地数据尚未重置，修改仅保留在当前页面。请先导出备份或恢复演示数据后继续。",
      );
      return false;
    }
    try {
      // Persist the complete validated snapshot before updating React state.
      // A failed write therefore leaves the previous timetable intact.
      browserSave(valid);
      setData(valid);
      setWritable(true);
      setStorageMessage("已整体保存到浏览器本地存储");
      return true;
    } catch (error) {
      setStorageMessage(error instanceof Error ? error.message : "本地保存失败");
      return false;
    }
  }
  return { data, commit, storageMessage };
}
