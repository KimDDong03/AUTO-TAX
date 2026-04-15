import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = process.env.AUTO_TAX_PUBLIC_BASE_URL?.trim() || "http://127.0.0.1:4173";
const screenshotDir = process.env.AUTO_TAX_PUBLIC_SCREENSHOT_DIR?.trim()
  ? path.resolve(process.env.AUTO_TAX_PUBLIC_SCREENSHOT_DIR.trim())
  : path.resolve("tmp/public-access-portal-shots");

async function openPortal(page) {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.locator("#public-login-card").getByLabel("로그인 계정").waitFor({ timeout: 15000 });
}

async function captureSection(page, selector, fileName) {
  const target = page.locator(selector);
  await target.scrollIntoViewIfNeeded();
  await target.screenshot({ path: path.join(screenshotDir, fileName) });
}

function attachRuntimeCollectors(page, consoleErrors, pageErrors) {
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      !message.text().includes("/api/public/login") &&
      !message.text().includes("401 (Unauthorized)")
    ) {
      consoleErrors.push(message.text());
    }
  });

  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });
}

const browser = await chromium.launch({ headless: true });
const desktopContext = await browser.newContext({ viewport: { width: 1440, height: 1180 } });
const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
for (const context of [desktopContext, mobileContext]) {
  await context.route("**/api/public/login", async (route) => {
    await route.fulfill({
      status: 401,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify({ error: "테스트 로그인 실패" })
    });
  });
}

const desktopPage = await desktopContext.newPage();
const mobilePage = await mobileContext.newPage();
const consoleErrors = [];
const pageErrors = [];
attachRuntimeCollectors(desktopPage, consoleErrors, pageErrors);
attachRuntimeCollectors(mobilePage, consoleErrors, pageErrors);

try {
  await mkdir(screenshotDir, { recursive: true });

  await openPortal(desktopPage);

  await desktopPage.getByRole("heading", { name: "AUTO-TAX 고객 전용 접속" }).waitFor();
  assert.equal(await desktopPage.locator("#public-login-card").count(), 1);
  assert.equal(await desktopPage.getByRole("button", { name: "로그인", exact: true }).count(), 1);
  assert.equal(await desktopPage.locator(".portal-card").count(), 3);
  assert.equal(await desktopPage.locator("#landing-top").count(), 0);
  assert.equal(await desktopPage.locator("#landing-operations").count(), 0);
  assert.equal(await desktopPage.locator("#landing-pricing").count(), 0);
  assert.equal(await desktopPage.getByText("도입 문의", { exact: true }).count(), 0);
  assert.equal(await desktopPage.getByText("자주 묻는 질문", { exact: true }).count(), 0);
  await desktopPage.getByText("계정이 없거나 접속이 안 되면 담당 영업/운영자에게 요청하세요.").waitFor();
  await desktopPage.getByText("처음 접속하면 이것부터 확인하세요").waitFor();

  const loginCard = desktopPage.locator("#public-login-card");
  await loginCard.getByLabel("로그인 계정").fill("demo-owner");
  await loginCard.getByLabel("비밀번호").fill("invalid-password");
  await loginCard.getByRole("button", { name: "로그인", exact: true }).click();
  await loginCard.locator(".alert.error").waitFor({ timeout: 15000 });
  assert.match((await loginCard.locator(".alert.error").textContent()) ?? "", /테스트 로그인 실패/);
  await captureSection(desktopPage, ".portal-page", "desktop-portal.png");
  await captureSection(desktopPage, "#public-login-card", "desktop-login-card.png");

  await openPortal(mobilePage);
  const mobileLoginBox = await mobilePage.locator("#public-login-card").boundingBox();
  const mobileGuideBox = await mobilePage.locator(".portal-guide-stack").boundingBox();
  assert.ok(mobileLoginBox && mobileGuideBox);
  assert.ok(mobileGuideBox.y > mobileLoginBox.y);
  await captureSection(mobilePage, ".portal-page", "mobile-portal.png");

  const recoveryPage = await desktopContext.newPage();
  attachRuntimeCollectors(recoveryPage, consoleErrors, pageErrors);
  await openPortal(recoveryPage);
  await recoveryPage.evaluate(() => {
    window.location.hash = "#type=recovery";
  });
  await recoveryPage.waitForFunction(() => window.location.hash === "#type=recovery", null, { timeout: 15000 });
  await recoveryPage.getByRole("heading", { name: "새 비밀번호 설정" }).waitFor({ timeout: 15000 });
  await recoveryPage.getByPlaceholder("8자 이상 입력").waitFor({ timeout: 15000 });
  await captureSection(recoveryPage, ".auth-card", "desktop-recovery.png");
  await recoveryPage.close();

  if (consoleErrors.length > 0 || pageErrors.length > 0) {
    throw new Error(`runtime errors detected: console=${consoleErrors.length}, page=${pageErrors.length}`);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        baseUrl,
        checks: [
          "customer-only access portal renders",
          "marketing/support sections removed",
          "public login UI shows inline error",
          "mobile layout stacks login before guidance",
          "recovery follow-up screen still opens"
        ],
        screenshots: screenshotDir
      },
      null,
      2
    )
  );
} finally {
  await Promise.all([desktopPage.close(), mobilePage.close()]).catch(() => {});
  await Promise.all([desktopContext.close(), mobileContext.close()]).catch(() => {});
  await browser.close().catch(() => {});
}
