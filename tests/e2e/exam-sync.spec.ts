import { test, expect } from "@playwright/test";

test("profile sync refreshes timetable and exams together; opening exam page reads cache only", async ({ page }) => {
  let examQueries = 0;
  let examCacheReads = 0;

  await page.route("http://127.0.0.1:3001/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();

    if (url.pathname === "/api/health") {
      await route.fulfill({ json: { ok: true, service: "test", port: 3001 } });
      return;
    }
    if (url.pathname === "/api/auth/status") {
      await route.fulfill({ json: { ok: true, phase: "connected", message: "已登录" } });
      return;
    }
    if (url.pathname === "/api/auth/scan" && method === "POST") {
      await route.fulfill({ json: { ok: true, count: 1, message: "课表已更新" } });
      return;
    }
    if (url.pathname === "/api/timetable" && method === "GET") {
      await route.fulfill({
        json: {
          semester: "2026-2027-1",
          courses: [{ id: "test-course", name: "数据结构", teacher: "测试教师", room: "教一 101", day: 1, start: 1, end: 2, weeks: "1-16周" }],
        },
      });
      return;
    }
    if (url.pathname === "/api/auth/exams" && method === "POST") {
      examQueries += 1;
      await route.fulfill({ json: { ok: true, count: 1, lastSyncedAt: "2026-11-27T12:00:00+08:00" } });
      return;
    }
    if (url.pathname === "/api/exams" && method === "GET") {
      examCacheReads += 1;
      await route.fulfill({
        json: {
          exams: [{
            id: "school-exam-1", name: "数据结构期末考试", date: "2026-12-18", time: "09:00-11:00",
            room: "第四教学楼 A203", seatNumber: "18", examNumber: "第 1 场", courseCode: "0801001",
            level: "期末考试", invigilator: "测试监考教师", source: "school",
          }],
          lastSyncedAt: "2026-11-27T12:00:00+08:00",
        },
      });
      return;
    }
    await route.fulfill({ status: 404, json: { ok: false, message: `Unexpected ${method} ${url.pathname}` } });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "个人信息", exact: true }).click();
  await expect(page.getByRole("button", { name: "同步课表和考试", exact: true })).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "同步课表和考试", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("考试 1 场");

  expect(examQueries).toBe(1);
  expect(examCacheReads).toBe(1);

  await page.getByRole("button", { name: "考试", exact: true }).click();
  await expect(page.getByRole("heading", { name: "数据结构期末考试" })).toBeVisible();
  await expect(page.getByText("第四教学楼 A203")).toBeVisible();

  // Opening the exam tab must not cause a second request to the school query endpoint.
  expect(examQueries).toBe(1);
  expect(examCacheReads).toBe(1);
  const cached = await page.evaluate(() => JSON.parse(localStorage.getItem("campus-exams:v1") || "{}"));
  expect(cached.exams).toHaveLength(1);
  expect(cached.exams[0].name).toBe("数据结构期末考试");
});
