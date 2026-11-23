import { useState } from "react";
import type { TimetableData } from "../models";
import { browserLoad, browserSave } from "../services/storage";
import { validateData } from "../utils/validation";
export function useTimetable() {
  const [loaded] = useState(browserLoad);
  const [data, setData] = useState(loaded.data);
  const [storageMessage, setStorageMessage] = useState(loaded.warning);
  const [writable, setWritable] = useState(loaded.writable);
  function commit(next: TimetableData, reset = false) {
    const valid = validateData(next);
    setData(valid);
    if (!writable && !reset) {
      setStorageMessage(
        "本地数据尚未重置，修改仅保留在当前页面。请导出备份或恢复演示数据后继续。",
      );
      return;
    }
    try {
      browserSave(valid);
      setWritable(true);
      setStorageMessage("已自动保存到本机浏览器");
    } catch (error) {
      setStorageMessage(error instanceof Error ? error.message : "保存失败");
    }
  }
  return { data, commit, storageMessage };
}
