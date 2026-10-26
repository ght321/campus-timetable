import { demoData } from "../data/demo";
import type { TimetableData } from "../models";
import { validateData } from "../utils/validation";
export const STORAGE_KEY = "campus-timetable:v1";
export type StoragePort = Pick<Storage, "getItem" | "setItem">;
export type LoadResult = {
  data: TimetableData;
  warning: string;
  writable: boolean;
};
export function loadData(storage: StoragePort): LoadResult {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    return {
      data: raw === null ? demoData() : validateData(JSON.parse(raw)),
      warning: "",
      writable: true,
    };
  } catch {
    return {
      data: demoData(),
      warning:
        "本地数据损坏或不可读取，已临时加载演示数据，原存储未覆盖。导出仅备份当前页面数据；如需损坏原文，请先通过浏览器存储工具备份，再恢复演示数据或导入替换。",
      writable: false,
    };
  }
}
export function saveData(storage: StoragePort, data: TimetableData): void {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(validateData(data)));
  } catch {
    throw new Error("本地保存失败（存储被禁用或空间不足），请导出JSON备份。");
  }
}
export function browserLoad(): LoadResult {
  try {
    return loadData(window.localStorage);
  } catch {
    return {
      data: demoData(),
      warning: "浏览器禁止本地存储；修改仅保留在当前页面，请导出JSON。",
      writable: false,
    };
  }
}
export function browserSave(data: TimetableData): void {
  try {
    saveData(window.localStorage, data);
  } catch (error) {
    throw new Error(
      error instanceof Error ? error.message : "本地保存失败，请导出JSON",
    );
  }
}
