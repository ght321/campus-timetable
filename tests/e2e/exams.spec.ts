import { test, expect } from "@playwright/test";

test("exam page supports local manual exam creation and deletion", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-11-27T12:00:00+08:00"));
  await page.goto("/");
  await page.getByRole("button", { name: "考试", exact: true }).click();
  await expect(page.getByRole("heading", { name: "我的考试" })).toBeVisible();

  await page.getByRole("button", { name: "+ 手动添加" }).click();
  await page.getByLabel("考试名称").fill("数据库系统期末考试");
  await page.getByLabel("考试日期").fill("2026-12-18");
  await page.getByLabel("考试时间").fill("09:00–11:00");
  await page.getByLabel("考场").fill("第四教学楼 A203");
  await page.getByLabel("座位号").fill("18");
  await page.getByRole("button", { name: "保存考试", exact: true }).click();
  await expect(page.getByText("数据库系统期末考试")).toBeVisible();
  await expect(page.getByText("第四教学楼 A203")).toBeVisible();

  await page.reload();
  await page.getByRole("button", { name: "考试", exact: true }).click();
  await expect(page.getByText("数据库系统期末考试")).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "删除", exact: true }).click();
  await expect(page.getByText("数据库系统期末考试")).toHaveCount(0);
});


test("semester first day sets and persists teaching week 14", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-11-27T12:00:00+08:00"));
  await page.goto("/");
  await page.getByRole("button", { name: "个人信息", exact: true }).click();
  const firstDay = page.getByLabel("设置学期第一天");
  await firstDay.fill("2026-08-24");
  await expect(page.getByText(/2026-11-27 对应第 14 教学周/)).toBeVisible();
  await page.getByRole("button", { name: "课程", exact: true }).click();
  await expect(page.locator(".term-cache-warning")).toContainText("真实当前第 14 教学周");
  await page.reload();
  await page.getByRole("button", { name: "课程", exact: true }).click();
  await expect(page.locator(".term-cache-warning")).toContainText("真实当前第 14 教学周");
});
