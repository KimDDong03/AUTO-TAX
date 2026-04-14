import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = process.env.AUTO_TAX_PUBLIC_BASE_URL?.trim() || "http://localhost:5173";
const screenshotDir = process.env.AUTO_TAX_PUBLIC_SCREENSHOT_DIR?.trim()
  ? path.resolve(process.env.AUTO_TAX_PUBLIC_SCREENSHOT_DIR.trim())
  : path.resolve("tmp/public-landing-shots");

function parseMoney(text) {
  const digits = text.replace(/[^\d]/g, "");
  return digits ? Number.parseInt(digits, 10) : 0;
}

async function waitForViewportVisibility(page, selector) {
  await page.waitForFunction(
    (targetSelector) => {
      const element = document.querySelector(targetSelector);
      if (!(element instanceof HTMLElement)) return false;
      const rect = element.getBoundingClientRect();
      return rect.top >= 0 && rect.bottom <= window.innerHeight;
    },
    selector,
    { timeout: 15000 }
  );
}

async function readCalculatorTotal(page) {
  const text = (await page.locator(".landing-calculator-total strong").textContent()) ?? "";
  return parseMoney(text);
}

async function openLanding(page) {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.locator("#landing-login-card").waitFor({ timeout: 15000 });
}

async function captureSection(page, selector, fileName) {
  const target = page.locator(selector);
  await target.scrollIntoViewIfNeeded();
  await target.screenshot({ path: path.join(screenshotDir, fileName) });
}

const browser = await chromium.launch({ headless: true });
const desktopContext = await browser.newContext({ viewport: { width: 1440, height: 1280 } });
const tabletContext = await browser.newContext({ viewport: { width: 834, height: 1194 } });
const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
for (const context of [desktopContext, tabletContext, mobileContext]) {
  await context.route("**/api/public/login", async (route) => {
    await route.fulfill({
      status: 401,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify({ error: "테스트 로그인 실패" })
    });
  });
}
const desktopPage = await desktopContext.newPage();
const tabletPage = await tabletContext.newPage();
const mobilePage = await mobileContext.newPage();
const consoleErrors = [];
const pageErrors = [];

for (const page of [desktopPage, tabletPage, mobilePage]) {
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

try {
  await mkdir(screenshotDir, { recursive: true });

  await openLanding(desktopPage);

  await desktopPage.locator("#landing-top h1").waitFor();
  assert.equal(await desktopPage.locator(".landing-hero-proof-item").count(), 3);
  assert.equal(await desktopPage.locator("#landing-top .landing-hero-cta-row button").count(), 2);
  assert.equal(await desktopPage.locator("#landing-top .landing-product-frame").count(), 1);
  assert.equal(await desktopPage.locator(".landing-product-summary-item").count(), 4);
  assert.equal(await desktopPage.locator(".landing-product-queue-row").count(), 4);
  assert.equal(await desktopPage.getByRole("button", { name: "로그인", exact: true }).count(), 2);
  assert.equal(await desktopPage.getByRole("button", { name: "도입 문의", exact: true }).count(), 1);
  assert.equal(await desktopPage.getByRole("button", { name: "이 규모로 도입 문의", exact: true }).count(), 1);

  await desktopPage.getByRole("button", { name: "로그인", exact: true }).first().click();
  await waitForViewportVisibility(desktopPage, "#landing-login-card");
  await captureSection(desktopPage, ".landing-hero-band", "desktop-hero.png");
  await captureSection(desktopPage, "#landing-login-card", "desktop-utility.png");

  const loginRail = desktopPage.locator("#landing-login-card");
  await loginRail.getByLabel("로그인 계정").fill("demo-owner");
  await loginRail.getByLabel("비밀번호").fill("invalid-password");
  await loginRail.getByRole("button", { name: "로그인", exact: true }).click();
  await loginRail.locator(".alert.error").waitFor();
  assert.match((await loginRail.locator(".alert.error").textContent()) ?? "", /테스트 로그인 실패/);

  const supportToggle = loginRail.locator(".landing-auth-toggle");
  assert.equal(await supportToggle.getAttribute("aria-expanded"), "false");
  await supportToggle.click();
  assert.equal(await supportToggle.getAttribute("aria-expanded"), "true");
  await loginRail.getByLabel("회사명").waitFor();
  await loginRail.getByLabel("회사명").fill("AUTO-TAX 테스트");
  await loginRail.locator(".landing-auth-toggle").click();
  await desktopPage.waitForFunction(
    () => !document.querySelector('#landing-login-card input[placeholder="회사명"]'),
    null,
    { timeout: 15000 }
  );

  const pricingSection = desktopPage.locator("#landing-pricing");
  await pricingSection.scrollIntoViewIfNeeded();
  await captureSection(desktopPage, "#landing-operations", "desktop-operations.png");
  const calculator = desktopPage.locator(".landing-calculator-surface");
  await calculator.getByLabel("관리 고객 수").fill("220");
  await desktopPage.waitForFunction(
    () => {
      const value = document.querySelector(".landing-calculator-total strong")?.textContent ?? "";
      return value.includes("387,000");
    },
    null,
    { timeout: 15000 }
  );
  assert.equal(await readCalculatorTotal(desktopPage), 387000);

  const pricingTabs = calculator.locator(".landing-segmented button");
  await pricingTabs.nth(0).click();
  await desktopPage.waitForFunction(
    () => {
      const value = document.querySelector(".landing-calculator-total strong")?.textContent ?? "";
      return value.includes("232,000");
    },
    null,
    { timeout: 15000 }
  );
  assert.equal(await readCalculatorTotal(desktopPage), 232000);

  await pricingTabs.nth(1).click();
  await desktopPage.waitForFunction(
    () => {
      const value = document.querySelector(".landing-calculator-total strong")?.textContent ?? "";
      return value.includes("387,000");
    },
    null,
    { timeout: 15000 }
  );
  assert.equal(await readCalculatorTotal(desktopPage), 387000);

  await calculator.getByRole("button", { name: "이 규모로 도입 문의" }).click();
  await loginRail.getByLabel("요청 내용").waitFor();
  const supportMessage = await loginRail.getByLabel("요청 내용").inputValue();
  assert.match(supportMessage, /예상 관리 고객 수: 220곳/);
  assert.match(supportMessage, /희망 요금 기준:/);
  assert.match(supportMessage, /예상 월 구독료: 387,000원/);
  await captureSection(desktopPage, "#landing-pricing", "desktop-pricing.png");
  await captureSection(desktopPage, "#landing-login-card", "desktop-support-open.png");

  await openLanding(tabletPage);
  await captureSection(tabletPage, ".landing-hero-band", "tablet-hero.png");
  const tabletUtilityCopyBox = await tabletPage.locator(".landing-utility-copy").boundingBox();
  const tabletUtilityFormBox = await tabletPage.locator(".landing-utility-form").boundingBox();
  assert.ok(tabletUtilityCopyBox && tabletUtilityFormBox);
  assert.ok(tabletUtilityFormBox.y >= tabletUtilityCopyBox.y || Math.abs(tabletUtilityFormBox.x - tabletUtilityCopyBox.x) < 8);
  await captureSection(tabletPage, "#landing-login-card", "tablet-utility.png");

  await tabletPage.locator("#landing-operations").scrollIntoViewIfNeeded();
  const tabletOperationFlowBox = await tabletPage.locator(".landing-flow-panel").boundingBox();
  const tabletOperationSummaryBox = await tabletPage.locator(".landing-flow-side").boundingBox();
  assert.ok(tabletOperationFlowBox && tabletOperationSummaryBox);
  assert.ok(tabletOperationSummaryBox.y > tabletOperationFlowBox.y || Math.abs(tabletOperationSummaryBox.x - tabletOperationFlowBox.x) < 8);
  await captureSection(tabletPage, "#landing-operations", "tablet-operations.png");

  await tabletPage.locator("#landing-pricing").scrollIntoViewIfNeeded();
  const tabletCalculatorBox = await tabletPage.locator(".landing-calculator-surface").boundingBox();
  const tabletComparisonBox = await tabletPage.locator(".landing-plan-comparison").boundingBox();
  assert.ok(tabletCalculatorBox && tabletComparisonBox);
  assert.ok(tabletComparisonBox.y > tabletCalculatorBox.y);
  await captureSection(tabletPage, "#landing-pricing", "tablet-pricing.png");

  await openLanding(mobilePage);
  await captureSection(mobilePage, ".landing-hero-band", "mobile-hero.png");
  const mobileHeroBox = await mobilePage.locator(".landing-hero-band").boundingBox();
  const mobileUtilityBox = await mobilePage.locator("#landing-login-card").boundingBox();
  assert.ok(mobileHeroBox && mobileUtilityBox);
  assert.ok(mobileUtilityBox.y > mobileHeroBox.y);
  await captureSection(mobilePage, "#landing-login-card", "mobile-utility.png");

  await mobilePage.locator("#landing-operations").scrollIntoViewIfNeeded();
  const operationFlowBox = await mobilePage.locator(".landing-flow-panel").boundingBox();
  const operationSummaryBox = await mobilePage.locator(".landing-flow-side").boundingBox();
  assert.ok(operationFlowBox && operationSummaryBox);
  assert.ok(operationSummaryBox.y > operationFlowBox.y || Math.abs(operationSummaryBox.x - operationFlowBox.x) < 8);
  await captureSection(mobilePage, "#landing-operations", "mobile-operations.png");

  await mobilePage.locator("#landing-pricing").scrollIntoViewIfNeeded();
  const calculatorBox = await mobilePage.locator(".landing-calculator-surface").boundingBox();
  const comparisonBox = await mobilePage.locator(".landing-plan-comparison").boundingBox();
  assert.ok(calculatorBox && comparisonBox);
  assert.ok(comparisonBox.y > calculatorBox.y);
  await captureSection(mobilePage, "#landing-pricing", "mobile-pricing.png");

  if (consoleErrors.length > 0 || pageErrors.length > 0) {
    throw new Error(`runtime errors detected: console=${consoleErrors.length}, page=${pageErrors.length}`);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        baseUrl,
        checks: [
          "desktop hero/product frame rendering",
          "login CTA scroll",
          "support request toggle aria state",
          "pricing calculator input",
          "plan switching",
          "pricing prefill",
          "tablet utility/operations/pricing stack",
          "mobile one-column flow"
        ],
        screenshots: screenshotDir
      },
      null,
      2
    )
  );
} finally {
  await Promise.all([desktopPage.close(), tabletPage.close(), mobilePage.close()]).catch(() => {});
  await Promise.all([desktopContext.close(), tabletContext.close(), mobileContext.close()]).catch(() => {});
  await browser.close().catch(() => {});
}
