import { test, expect, type Page } from "@playwright/test";
import { demoData } from "../../src/data/demo";
import { STORAGE_KEY } from "../../src/services/storage";
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-21T12:00:00+08:00"));
});
async function addCourse(page: Page, name: string) {
  await page.getByRole("button", { name: "新增课程", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "新增课程" });
  await dialog.getByLabel("课程名称", { exact: true }).fill(name);
  await dialog.getByLabel("任课教师", { exact: true }).fill("测试教师");
  await dialog.getByLabel("教学地点", { exact: true }).fill("实验室101");
  return dialog;
}
test("desktop CRUD, conflict confirmation, search, persistence and deletion", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByText("真实当前第 7 教学周", { exact: false }),
  ).toBeVisible();
  const form = await addCourse(page, "软件工程实践");
  await expect(form.getByText("发现时间冲突")).toBeVisible();
  await form.getByRole("button", { name: "保存课程", exact: true }).click();
  await expect(form.getByRole("alert")).toHaveText("请明确确认冲突后再保存");
  await form.getByLabel("我已了解冲突，仍要保存").check();
  await form.getByRole("button", { name: "保存课程", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("已自动保存到本机浏览器");
  await page.reload();
  await page
    .locator(".course-list")
    .getByRole("button", { name: /软件工程实践/ })
    .click();
  await page.getByRole("button", { name: "编辑课程", exact: true }).click();
  const edit = page.getByRole("dialog", { name: "编辑课程" });
  await edit.getByLabel("课程名称", { exact: true }).fill("软件工程验收");
  await edit.getByLabel("星期", { exact: true }).selectOption("7");
  await expect(edit.getByText("发现时间冲突")).toHaveCount(0);
  await edit.getByRole("button", { name: "保存课程", exact: true }).click();
  await page.getByLabel("课程名称搜索").fill("验收");
  await expect(page.locator(".list-course")).toHaveCount(1);
  await page.locator(".list-course").click();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "删除课程", exact: true }).click();
  await expect(
    page.getByText("没有匹配课程，请调整筛选或新增课程。"),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator(".list-course")).toHaveCount(8);
  expect(errors).toEqual([]);
});
test("corrupt data recovery preserves source until explicit reset", async ({
  page,
}) => {
  await page.addInitScript((key) => {
    if (!sessionStorage.getItem("seeded")) {
      localStorage.setItem(key, "broken");
      sessionStorage.setItem("seeded", "1");
    }
  }, STORAGE_KEY);
  await page.goto("/");
  await expect(page.getByRole("status")).toContainText("本地数据损坏");
  await expect(page.locator(".list-course")).toHaveCount(8);
  expect(
    await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY),
  ).toBe("broken");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "恢复演示数据" }).click();
  await expect(page.getByRole("status")).toHaveText("已自动保存到本机浏览器");
  await page.reload();
  await expect(page.getByRole("status")).not.toContainText("损坏");
});
test("quota errors remain visible while allowing export", async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException("quota", "QuotaExceededError");
    };
  });
  await page.goto("/");
  const form = await addCourse(page, "未持久化课程");
  await form.getByLabel("星期", { exact: true }).selectOption("7");
  await form.getByRole("button", { name: "保存课程", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("本地保存失败");
  await expect(page.locator(".list-course")).toHaveCount(9);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出课表" }).click();
  await download;
});
test("odd/even filter and overlap cards stay reachable", async ({ page }) => {
  const data = demoData();
  data.courses = [
    { ...data.courses[0], parity: "odd" },
    { ...data.courses[0], id: "even", name: "双周课程", parity: "even" },
    { ...data.courses[0], id: "overlap", name: "冲突课程" },
  ];
  await page.addInitScript(
    ({ key, data }) => localStorage.setItem(key, JSON.stringify(data)),
    { key: STORAGE_KEY, data },
  );
  await page.goto("/");
  await expect(page.locator(".course-card")).toHaveCount(2);
  await page.locator(".course-card").filter({ hasText: "冲突课程" }).click();
  await expect(page.getByRole("dialog")).toContainText("存在冲突");
  await page.keyboard.press("Escape");
  await page.getByLabel("跳转教学周").selectOption("8");
  await expect(
    page.locator(".course-card").filter({ hasText: "双周课程" }),
  ).toBeVisible();
  await expect(
    page.locator(".course-card").filter({ hasText: "高等数学" }),
  ).toHaveCount(0);
  await page.getByLabel("仅第 8 周").check();
  await expect(page.locator(".list-course")).toHaveCount(2);
});
test("course CRUD and persistence work on an insecure HTTP origin", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("http://campus-timetable.test/**", async (route) => {
    const url = new URL(route.request().url());
    const response = await route.fetch({
      url: "http://127.0.0.1:4173" + url.pathname + url.search,
    });
    await route.fulfill({ response });
  });
  await page.goto("http://campus-timetable.test/");
  expect(await page.evaluate(() => isSecureContext)).toBe(false);
  expect(await page.evaluate(() => typeof crypto.randomUUID)).toBe("undefined");
  const form = await addCourse(page, "HTTP课程");
  await form.getByLabel("星期", { exact: true }).selectOption("7");
  await form.getByRole("button", { name: "保存课程", exact: true }).click();
  await page.reload();
  await page.locator(".list-course").filter({ hasText: "HTTP课程" }).click();
  await page.getByRole("button", { name: "编辑课程", exact: true }).click();
  await page.getByLabel("课程名称", { exact: true }).fill("HTTP编辑成功");
  await page.getByRole("button", { name: "保存课程", exact: true }).click();
  await page
    .locator(".list-course")
    .filter({ hasText: "HTTP编辑成功" })
    .click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "删除课程", exact: true }).click();
  await page.reload();
  await expect(page.locator(".list-course")).toHaveCount(8);
  expect(errors).toEqual([]);
});
