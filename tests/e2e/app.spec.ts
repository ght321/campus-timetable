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
test("week navigation, semester validation, cross-year dates and empty state", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "下一周", exact: true }).click();
  await expect(page.getByLabel("跳转教学周")).toHaveValue("8");
  await page.getByRole("button", { name: "回到本周", exact: true }).click();
  await expect(page.getByLabel("跳转教学周")).toHaveValue("7");
  await page.getByLabel("跳转教学周").selectOption("20");
  await expect(
    page.getByText("第 20 周暂无课程，可以切换周次或新增课程。"),
  ).toBeVisible();
  await page.getByRole("button", { name: "学期设置", exact: true }).click();
  const form = page.getByRole("dialog", { name: "学期设置" });
  await form.getByLabel("总教学周数", { exact: true }).fill("8");
  await form.getByRole("button", { name: "保存学期" }).click();
  await expect(form.getByRole("alert")).toContainText("课程第");
  await form.getByLabel("总教学周数", { exact: true }).fill("20");
  await form.getByLabel("每日课程节次", { exact: true }).fill("12");
  await form.getByLabel("开学日期", { exact: true }).fill("2026-12-28");
  await form.getByRole("button", { name: "保存学期" }).click();
  await expect(page.getByText("学期尚未开始", { exact: false })).toBeVisible();
  await page.getByLabel("跳转教学周").selectOption("2");
  await expect(
    page.getByText("点击课程查看详情 · 2027-01-04 至 2027-01-10"),
  ).toBeVisible();
  await expect(page.locator(".period-label")).toHaveCount(12);
  await page.reload();
  await page.getByRole("button", { name: "学期设置", exact: true }).click();
  await expect(page.getByLabel("开学日期", { exact: true })).toHaveValue(
    "2026-12-28",
  );
});
test("JSON preview cancel/confirm, validation, export and legacy conversion", async ({
  page,
}) => {
  await page.goto("/");
  const upload = page.getByLabel("选择课表JSON");
  const next = { ...demoData(), courses: [] };
  await upload.setInputFiles({
    name: "empty.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(next)),
  });
  await expect(page.getByRole("dialog", { name: "导入预览" })).toContainText(
    "共 0 条课程",
  );
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await expect(page.locator(".list-course")).toHaveCount(8);
  await upload.setInputFiles({
    name: "empty.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(next)),
  });
  await page.getByRole("button", { name: "确认替换（含冲突课程）" }).click();
  await page.reload();
  await expect(page.locator(".list-course")).toHaveCount(0);
  await upload.setInputFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from("{bad"),
  });
  await expect(page.getByRole("alert")).toHaveText("JSON语法错误，请检查文件");
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  const old = {
    school: "南京理工大学",
    week: 7,
    courses: [
      {
        id: 1,
        name: "旧版数学",
        teacher: "张老师",
        room: "101",
        day: 1,
        start: 1,
        end: 2,
        weeks: "1-16周",
        color: "blue",
      },
    ],
  };
  await upload.setInputFiles({
    name: "legacy.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(old)),
  });
  await expect(
    page.getByText("已转换旧版JSON：", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "确认替换（含冲突课程）" }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出课表", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("campus-timetable.json");
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const exported = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  expect(exported.schemaVersion).toBe(1);
  expect(exported.courses[0]).toMatchObject({
    id: "1",
    name: "旧版数学",
    parity: "all",
  });
  await page.reload();
  await expect(page.locator(".list-course")).toHaveCount(1);
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
test("mobile layout, scrollable cards, keyboard dialog and screenshots", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  const scroll = page.locator(".schedule-scroll");
  expect(await scroll.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(
    true,
  );
  await page.locator(".course-card").filter({ hasText: "体育" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(
    await page.getByRole("dialog").evaluate((el) => {
      const r = el.getBoundingClientRect();
      return r.left >= 0 && r.right <= window.innerWidth;
    }),
  ).toBe(true);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.screenshot({
    path: "docs/screenshots/mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: "docs/screenshots/desktop.png",
    fullPage: true,
  });
});

test("long semester names stay inside the mobile viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "学期设置", exact: true }).click();
  await page.getByLabel("学期名称", { exact: true }).fill("A".repeat(100));
  await page.getByRole("button", { name: "保存学期", exact: true }).click();
  await page.reload();
  await expect(page.locator(".semester-card strong")).toHaveText(
    "A".repeat(100),
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
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
