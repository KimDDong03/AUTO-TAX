import fs from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";

const baseUrl = process.env.AUTO_TAX_E2E_BASE_URL?.trim() || "http://127.0.0.1:4300";

function parseEnvText(text) {
  return Object.fromEntries(
    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index), line.slice(index + 1)];
      })
  );
}

async function loadEnvFile() {
  try {
    const text = await fs.readFile(new URL("../.env", import.meta.url), "utf8");
    return parseEnvText(text);
  } catch {
    return {};
  }
}

const fileEnv = await loadEnvFile();
const env = {
  ...fileEnv,
  ...process.env
};

if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_URL 과 SUPABASE_SERVICE_ROLE_KEY 환경변수가 필요합니다.");
}

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

async function assertHealth(url) {
  const response = await fetch(`${url}/api/health`);
  if (!response.ok) {
    throw new Error(`E2E 대상 서버 health check 실패: ${response.status}`);
  }
}

const suffix = String(Date.now()).slice(-8);
const email = `e2e-${suffix}@example.com`;
const password = `P!${suffix}word`;
const ownerLoginId = `e2eowner${suffix}`;
const organizationName = `E2E Workspace ${suffix}`;
const createdUserIds = new Set();
let organizationId = null;
let ownerUserId = null;

const steps = [];
const apiErrors = [];
const consoleErrors = [];
const pageErrors = [];
const startedAt = Date.now();

function log(...args) {
  console.log(`[${String(Date.now() - startedAt).padStart(5, " ")}ms]`, ...args);
}

async function recordStep(name, fn) {
  const stepStart = Date.now();
  try {
    await fn();
    const durationMs = Date.now() - stepStart;
    steps.push({ name, ok: true, durationMs });
    log("PASS", name, `${durationMs}ms`);
  } catch (error) {
    const durationMs = Date.now() - stepStart;
    steps.push({
      name,
      ok: false,
      durationMs,
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}

async function cleanup() {
  try {
    if (organizationId) {
      await supabase.from("organization_member_password_resets").delete().eq("organization_id", organizationId);
      await supabase.from("organization_member_invites").delete().eq("organization_id", organizationId);
      await supabase.from("workspace_logs").delete().eq("organization_id", organizationId);
      await supabase.from("mail_sync_checkpoints").delete().eq("organization_id", organizationId);
      await supabase.from("completed_billing_months").delete().eq("organization_id", organizationId);
      await supabase.from("customer_import_profiles").delete().eq("organization_id", organizationId);
      await supabase.from("organization_integrations").delete().eq("organization_id", organizationId);
      await supabase.from("organization_settings").delete().eq("organization_id", organizationId);
      await supabase.from("auth_user_login_index").delete().eq("user_id", ownerUserId);
      const { data: members } = await supabase.from("organization_members").select("user_id").eq("organization_id", organizationId);
      for (const member of members ?? []) {
        if (member.user_id) {
          createdUserIds.add(member.user_id);
        }
      }
      await supabase.from("organization_members").delete().eq("organization_id", organizationId);
      await supabase.from("organizations").delete().eq("id", organizationId);
    }
  } catch (error) {
    log("cleanup org error", error instanceof Error ? error.message : String(error));
  }

  for (const userId of createdUserIds) {
    try {
      await supabase.auth.admin.deleteUser(userId);
    } catch (error) {
      log("cleanup user error", userId, error instanceof Error ? error.message : String(error));
    }
  }
}

let browser = null;

try {
  await assertHealth(baseUrl);

  await recordStep("create temp auth user", async () => {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: "E2E Owner" }
    });
    if (error) throw error;
    ownerUserId = data.user.id;
    createdUserIds.add(ownerUserId);
  });

  await recordStep("seed temp workspace", async () => {
    const { data: orgData, error: orgError } = await supabase.from("organizations").insert({ name: organizationName }).select("id").single();
    if (orgError) throw orgError;
    organizationId = orgData.id;

    const { error: memberError } = await supabase.from("organization_members").insert({
      organization_id: organizationId,
      user_id: ownerUserId,
      role: "owner",
      display_name: "E2E Owner"
    });
    if (memberError) throw memberError;

    const { error: indexError } = await supabase.from("auth_user_login_index").insert({
      user_id: ownerUserId,
      login_id: ownerLoginId,
      auth_email: email.toLowerCase(),
      display_name: "E2E Owner"
    });
    if (indexError) throw indexError;
  });

  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text());
    }
  });
  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });
  page.on("response", async (response) => {
    if (response.status() >= 400) {
      let body = "";
      try {
        body = await response.text();
      } catch {}
      apiErrors.push({
        url: response.url(),
        status: response.status(),
        body: body.slice(0, 400)
      });
    }
  });

  await recordStep("load login page", async () => {
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.locator("#landing-login-card").getByLabel("로그인 계정").waitFor();
  });

  await recordStep("public login as temp owner", async () => {
    const loginCard = page.locator("#landing-login-card");
    await loginCard.getByLabel("로그인 계정").fill(ownerLoginId);
    await loginCard.getByLabel("비밀번호").fill(password);
    await Promise.all([
      page.waitForResponse((response) => response.url().endsWith("/api/bootstrap") && response.status() === 200),
      loginCard.getByRole("button", { name: "로그인" }).click()
    ]);
    await page.getByRole("button", { name: "오늘 작업" }).waitFor();
  });

  await recordStep("create customer with enter submit", async () => {
    await page.getByRole("button", { name: "고객관리" }).click();
    await page.getByRole("button", { name: "새 고객" }).click();
    const editor = page.locator(".panel-customer-editor");
    await editor.getByLabel("대표자명").fill(`E2E 대표 ${suffix}`);
    await editor.getByLabel("주소").fill("서울특별시 강남구 테헤란로 123");
    await editor.getByLabel("사업자번호").fill(`1234${suffix.slice(-6)}`);
    await editor.getByLabel("세금계산서 상호").fill(`E2E 상호 ${suffix}`);
    await editor.getByLabel("업태").fill("서비스업");
    await editor.getByLabel("업종").fill("소프트웨어 개발");
    await Promise.all([
      page.locator(".customer-summary").filter({ hasText: `E2E 상호 ${suffix}` }).first().waitFor(),
      editor.getByLabel("업종").press("Enter")
    ]);
  });

  await recordStep("initial registration csv preview and import", async () => {
    await page.getByRole("button", { name: "초기 등록" }).click();
    const importPanel = page.locator(".panel-initial-import");
    const csv = [
      "대표자명,사업자번호,세금계산서 상호,주소",
      `CSV대표${suffix},2233${suffix.slice(-6)},CSV상호${suffix},부산광역시 해운대구 센텀중앙로 97`
    ].join("\n");
    await importPanel.locator('input[type="file"]').setInputFiles({
      name: `customers-${suffix}.csv`,
      mimeType: "text/csv",
      buffer: Buffer.from(csv, "utf8")
    });
    await importPanel.getByRole("button", { name: "미리보기" }).click();
    await page.getByText("가져오기 가능 1건").waitFor();
    await importPanel.getByRole("button", { name: "가져오기 실행" }).click();
    await page.getByText(/가져오기 완료 · 성공 1건/).waitFor();
  });

  await recordStep("imported customer visible in customer list", async () => {
    await page.getByRole("button", { name: "고객관리" }).click();
    await page.locator(".customer-summary").filter({ hasText: `CSV상호${suffix}` }).first().waitFor();
  });

  await recordStep("settings member management flow", async () => {
    await page.getByRole("button", { name: "시스템설정" }).click();
    await page.getByRole("button", { name: "계정 보안" }).click();
    const settingsDetail = page.locator(".settings-detail");
    await settingsDetail.getByRole("textbox", { name: "로그인 아이디", exact: true }).fill(`member${suffix}`);
    await settingsDetail.getByRole("textbox", { name: "이름", exact: true }).fill(`멤버 ${suffix}`);
    await settingsDetail.getByPlaceholder("기존 계정이면 비워두고, 새 계정이면 8자 이상 입력").fill(`Temp!${suffix}`);
    await settingsDetail.getByRole("button", { name: "사용자 추가" }).click();
    const dialog = page.locator('[role="dialog"], [role="alertdialog"]');
    await dialog.getByRole("button", { name: "확인" }).click();
    await settingsDetail.locator(".workspace-member-card").filter({ hasText: `member${suffix}` }).first().waitFor();
  });

  await recordStep("logout returns to public page", async () => {
    await page.getByRole("button", { name: "로그아웃" }).click();
    await page.locator("#landing-login-card").getByLabel("로그인 계정").waitFor();
    await page.waitForTimeout(2000);
  });

  if (apiErrors.length > 0 || pageErrors.length > 0 || consoleErrors.length > 0) {
    throw new Error(`unexpected runtime errors: api=${apiErrors.length}, page=${pageErrors.length}, console=${consoleErrors.length}`);
  }

  console.log(JSON.stringify({ ok: true, baseUrl, steps, apiErrors, pageErrors, consoleErrors }, null, 2));
} catch (error) {
  console.log(
    JSON.stringify(
      {
        ok: false,
        baseUrl,
        steps,
        apiErrors,
        pageErrors,
        consoleErrors,
        error: error instanceof Error ? error.message : String(error)
      },
      null,
      2
    )
  );
  process.exitCode = 1;
} finally {
  if (browser) {
    await browser.close().catch(() => {});
  }
  await cleanup();
}
