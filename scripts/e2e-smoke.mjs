import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import * as XLSX from "xlsx";

const baseUrl = process.env.AUTO_TAX_E2E_BASE_URL?.trim() || "http://127.0.0.1:4300";
const localRenewalHelperUrl = "http://127.0.0.1:35119";

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
const onboardingBusinessNumber = `2${suffix.padStart(9, "0").slice(-9)}`;
const onboardingCorpName = `온보딩 상호 ${suffix}`;
const onboardingCustomerName = `온보딩 대표 ${suffix}`;
const onboardingAddress = `서울특별시 서초구 서초대로 ${suffix.slice(-3)}`;
const onboardingBizType = "전기업";
const onboardingBizClass = "태양광";
const onboardingContactMobile = "01098765432";
const onboardingPlantName = `온보딩 ${suffix}호기`;
const onboardingElectronicTaxCertificate = {
  index: "101",
  cn: `온보딩 전자세금 ${suffix}`,
  issuerToName: "한국정보인증",
  usageToName: "전자세금용",
  todate: "2027-12-31",
  oid: null,
  serial: null,
  userDN: null,
  validateFrom: null,
  detailValidateTo: null,
  certDirPath: `C:/CERTS/${suffix}/tax`
};
const onboardingGeneralCertificate = {
  index: "202",
  cn: `온보딩 범용 ${suffix}`,
  issuerToName: "금융결제원",
  usageToName: "사업자 범용",
  todate: "2027-12-31",
  oid: null,
  serial: null,
  userDN: null,
  validateFrom: null,
  detailValidateTo: null,
  certDirPath: `C:/CERTS/${suffix}/general`
};
const createdUserIds = new Set();
let organizationId = null;
let ownerUserId = null;
let browser = null;
let onboardingWorkbookDir = null;
let onboardingWorkbookPath = null;
const helperRequestLog = {
  healthCount: 0,
  bridgeProbeCount: 0,
  certificateListCount: 0,
  preflightRequests: []
};
let fakeHelperVersion = "0.1.0";
let fakeHelperMetadataMode = "ok";
let fakeHelperReleaseMetadata = {
  latestVersion: "0.1.0",
  minSupportedVersion: "0.1.0",
  downloadUrl: "/downloads/renewal-local-helper.zip",
  releasedAt: "2026-04-14T00:00:00.000Z"
};

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
  if (onboardingWorkbookDir) {
    await fs.rm(onboardingWorkbookDir, { recursive: true, force: true }).catch(() => {});
  }

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

function buildHelperProbeResponse(extra) {
  return {
    ok: true,
    version: fakeHelperVersion,
    result: {
      process: {
        detected: true,
        names: ["E2E Renewal Helper"],
        detail: "fake helper"
      },
      bridge: {
        summary: "ok",
        ports: [{ port: 443, protocol: "https", reachable: true, latencyMs: 1, error: null }],
        versionProbe: {
          ok: true,
          sourcePort: 443,
          values: { kpmcnt: "1.0.0", kpmsvc: "1.0.0", secukitNX: "1.0.0" },
          error: null
        },
        licenseProbe: {
          ok: true,
          sourcePort: 443,
          error: null
        },
        storageProbe: {
          ok: true,
          sourcePort: 443,
          mediaType: "HDD",
          certificateCount: 2,
          certificates: [onboardingElectronicTaxCertificate, onboardingGeneralCertificate],
          error: null
        },
        selectionProbe: {
          ok: true,
          sourcePort: 443,
          certificateIndex: null,
          certificateCn: null,
          certID: null,
          error: null
        },
        preflightProbe: {
          ok: false,
          sourcePort: 443,
          certificateIndex: null,
          certificateCn: null,
          certID: null,
          branch: "renew-info",
          branchPageUrl: null,
          issueCompany: null,
          companyChkYn: null,
          policy: null,
          orderNo: null,
          orderSeq: null,
          orderStatus: null,
          orderApplySeCd: null,
          payYn: null,
          nextUrl: null,
          renewInfoPageTitle: null,
          renewInfoSubmitUrl: null,
          renewInfoSubmitPathKind: null,
          renewInfoFormFieldNames: [],
          renewInfoMustHaveFieldNames: [],
          renewInfoFinalNum: null,
          renewInfoSnapshot: null,
          renewInfoBlockingMismatchFields: [],
          renewInfoAutoSubmitReady: null,
          renewInfoAutoSubmitSummary: null,
          renewInfoSubmitMissingFields: [],
          renewInfoSubmitReady: null,
          renewInfoSubmitSummary: null,
          renewInfoSubmitAttempted: null,
          renewInfoSubmitResultBranch: null,
          renewInfoSubmitResultUrl: null,
          renewInfoSubmitResultPageTitle: null,
          renewInfoSubmitResultSummary: null,
          renewInfoSubmitResultError: null,
          renewInfoPaymentPreviewLoaded: null,
          renewInfoPaymentPreviewItems: [],
          renewInfoPaymentPreviewTotalAmount: null,
          renewInfoPaymentPreviewHasAdditionalAgreement: null,
          actionImageUrl: null,
          actionImageAlt: null,
          externalFlowKind: null,
          externalFlowProductName: null,
          externalFlowProductId: null,
          externalFlowSubmitUrl: null,
          externalFlowSubmitPathKind: null,
          rawCode: null,
          message: null,
          error: null,
          ...extra
        }
      },
      notes: ["fake helper ready"]
    }
  };
}

async function mockLocalHelperRoutes(page) {
  await page.route("**/downloads/renewal-local-helper.json", async (route) => {
    if (fakeHelperMetadataMode !== "ok") {
      await route.fulfill({
        status: 503,
        headers: {
          "content-type": "application/json; charset=utf-8"
        },
        body: JSON.stringify({ error: "fake helper release metadata unavailable" })
      });
      return;
    }

    await route.fulfill({
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8"
      },
      body: JSON.stringify(fakeHelperReleaseMetadata)
    });
  });

  await page.route(`${localRenewalHelperUrl}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const headers = {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "Content-Type",
      "content-type": "application/json; charset=utf-8"
    };

    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers, body: "" });
      return;
    }

    if (request.method() === "GET" && url.pathname === "/health") {
      helperRequestLog.healthCount += 1;
      await route.fulfill({
        status: 200,
        headers,
        body: JSON.stringify({
          ok: true,
          version: fakeHelperVersion,
          status: {
            processDetected: true,
            bridgeSummary: "ok",
            notes: ["fake helper ready"]
          }
        })
      });
      return;
    }

    if (request.method() === "POST" && url.pathname === "/api/bridge-probe") {
      helperRequestLog.bridgeProbeCount += 1;
      await route.fulfill({
        status: 200,
        headers,
        body: JSON.stringify(buildHelperProbeResponse({}))
      });
      return;
    }

    if (request.method() === "POST" && url.pathname === "/api/certificates") {
      helperRequestLog.certificateListCount += 1;
      const probeResponse = buildHelperProbeResponse({});
      await route.fulfill({
        status: 200,
        headers,
        body: JSON.stringify({
          ok: true,
          version: fakeHelperVersion,
          result: {
            licenseProbe: probeResponse.result.bridge.licenseProbe,
            storageProbe: probeResponse.result.bridge.storageProbe
          }
        })
      });
      return;
    }

    if (request.method() === "POST" && url.pathname === "/api/preflight") {
      const body = request.postDataJSON?.() ?? {};
      helperRequestLog.preflightRequests.push(body);
      const certificateIndex = String(body.certificateIndex ?? "");
      const certificateCn = typeof body.certificateCn === "string" ? body.certificateCn : null;
      const snapshot = {
        companyName: onboardingCorpName,
        businessNumber: onboardingBusinessNumber,
        ceoName: onboardingCustomerName,
        bizType: onboardingBizType,
        bizClass: onboardingBizClass,
        businessFieldCode: null,
        postalCode: null,
        baseAddress: onboardingAddress,
        detailAddress: "",
        contactName: onboardingCustomerName,
        contactDepartment: "E2E",
        contactEmail: `tax-${suffix}@example.com`,
        contactTel: "0212345678",
        contactFax: null,
        contactMobile: onboardingContactMobile
      };

      await route.fulfill({
        status: 200,
        headers,
        body: JSON.stringify(
          buildHelperProbeResponse({
            ok: true,
            certificateIndex,
            certificateCn,
            certID: `${certificateIndex}-cert-id`,
            branch: "renew-info",
            renewInfoSnapshot: snapshot,
            renewInfoFormFieldNames: ["companyName", "businessNumber", "ceoName", "addr"],
            renewInfoMustHaveFieldNames: ["companyName", "businessNumber", "ceoName", "addr"],
            renewInfoBlockingMismatchFields: [],
            renewInfoAutoSubmitReady: false,
            renewInfoAutoSubmitSummary: "E2E preview only",
            renewInfoSubmitMissingFields: [],
            renewInfoSubmitReady: false,
            renewInfoSubmitSummary: "E2E preview only",
            message: "E2E fake preflight"
          })
        )
      });
      return;
    }

    if (request.method() === "POST" && url.pathname === "/api/popbill/certificate-registration") {
      await route.fulfill({
        status: 200,
        headers,
        body: JSON.stringify({
          ok: true,
          version: fakeHelperVersion,
          result: {
            outcome: "registered",
            browserChannel: "fake",
            certificateCn: onboardingElectronicTaxCertificate.cn,
            localBridgeBaseUrl: localRenewalHelperUrl,
            message: "registered by fake helper"
          }
        })
      });
      return;
    }

    await route.fulfill({
      status: 404,
      headers,
      body: JSON.stringify({ error: `Unhandled fake helper route: ${request.method()} ${url.pathname}` })
    });
  });
}

async function createOnboardingWorkbookFile() {
  onboardingWorkbookDir = await fs.mkdtemp(path.join(os.tmpdir(), "auto-tax-e2e-"));
  onboardingWorkbookPath = path.join(onboardingWorkbookDir, "AUTO-TAX_초기등록_양식.xlsx");

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ["로컬인증서번호", "인증서 종류", "인증서명(CN)", "용도표시명", "발급기관", "만료일", "인증서 비밀번호"],
      [
        onboardingGeneralCertificate.index,
        "사업자범용",
        onboardingGeneralCertificate.cn,
        onboardingGeneralCertificate.usageToName,
        onboardingGeneralCertificate.issuerToName,
        onboardingGeneralCertificate.todate,
        "general-pass"
      ],
      ["", "", "", "", "", "", ""]
    ]),
    "공동인증서"
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ["로컬인증서번호", "인증서명(CN)", "발전소명", "인증서 비밀번호"],
      [onboardingElectronicTaxCertificate.index, onboardingElectronicTaxCertificate.cn, onboardingPlantName, "tax-pass"],
      ["", "", "", ""]
    ]),
    "발전소"
  );

  XLSX.writeFile(workbook, onboardingWorkbookPath);
}

async function configureOnboardingSettings() {
  if (!organizationId) {
    throw new Error("organizationId missing before onboarding settings seed");
  }

  const verifiedAt = new Date().toISOString();
  const { error: settingsError } = await supabase.from("organization_settings").upsert(
    {
      organization_id: organizationId,
      timezone: "Asia/Seoul",
      notification_emails: [],
      default_issue_day: 10,
      default_issue_hour: 9,
      default_issue_minute: 0,
      mail_poll_minutes: 30,
      mail_sync_start_at: null,
      scheduler_enabled: false,
      mail_connection_verified_at: verifiedAt
    },
    { onConflict: "organization_id" }
  );
  if (settingsError) throw settingsError;

  const { error: integrationsError } = await supabase.from("organization_integrations").upsert(
    {
      organization_id: organizationId,
      imap_host: "imap.gmail.com",
      imap_port: 993,
      imap_secure: true,
      imap_user: email,
      imap_pass_encrypted: `mail-pass-${suffix}`,
      imap_mailbox: "INBOX",
      smtp_host: "smtp.gmail.com",
      smtp_port: 465,
      smtp_secure: true,
      smtp_user: email,
      smtp_pass_encrypted: `mail-pass-${suffix}`,
      smtp_from_name: "AUTO-TAX E2E",
      smtp_from_email: email,
      popbill_link_id: `TEST-LINK-${suffix}`,
      popbill_secret_key_encrypted: `TEST-SECRET-${suffix}`,
      popbill_is_test: true,
      popbill_partner_corp_num: "",
      popbill_user_id_prefix: `E2E${suffix.slice(-4)}_`,
      popbill_shared_password_encrypted: `Popbill!${suffix}`,
      operator_contact_name: "E2E Operator",
      operator_contact_email: email,
      operator_contact_tel: "0212345678",
      renewal_contact_department: "",
      renewal_contact_fax: "",
      renewal_certificate_password_encrypted: "",
      renewal_issue_password_encrypted: "123456"
    },
    { onConflict: "organization_id" }
  );
  if (integrationsError) throw integrationsError;
}

try {
  await createOnboardingWorkbookFile();
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
  const navButton = (label) => page.locator(".sidebar .nav-button").filter({ hasText: label });
  const getSidebarToggleOpacity = () =>
    page.locator(".sidebar-thumb-toggle").evaluate((element) => Number.parseFloat(window.getComputedStyle(element).opacity || "0"));
  await mockLocalHelperRoutes(page);

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      if (msg.text().includes("status of 503 (Service Unavailable)")) {
        return;
      }
      consoleErrors.push(msg.text());
    }
  });
  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });
  page.on("response", async (response) => {
    if (response.status() >= 400) {
      if (response.url().includes("/downloads/renewal-local-helper.json")) {
        return;
      }
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
    await page.locator("#public-login-card").getByLabel("로그인 계정").waitFor();
  });

  await recordStep("public login as temp owner", async () => {
    const loginCard = page.locator("#public-login-card");
    await loginCard.getByLabel("로그인 계정").fill(ownerLoginId);
    await loginCard.getByLabel("비밀번호").fill(password);
    await Promise.all([
      page.waitForResponse((response) => response.url().endsWith("/api/bootstrap") && response.status() === 200),
      loginCard.getByRole("button", { name: "로그인" }).click()
    ]);
    await navButton("도입 준비").waitFor();
    try {
      await page.waitForURL((url) => url.hash === "#onboarding", { timeout: 15000 });
    } catch {
      const onboardingStep = page.locator("#onboarding-active-step");
      if ((await onboardingStep.count()) === 0) {
        await page.evaluate(() => {
          window.location.hash = "#onboarding";
        });
        await page.waitForFunction(() => window.location.hash === "#onboarding", null, { timeout: 15000 });
      }
    }
    await navButton("홈").waitFor();
    await navButton("고객").waitFor();
  });

  await recordStep("blank onboarding highlights required inputs immediately", async () => {
    const onboardingActiveStep = page.locator("#onboarding-active-step");
    const mailAddressInput = onboardingActiveStep.getByLabel("메일 주소");

    await page.locator(".onboarding-step-chip").filter({ hasText: "메일 연결" }).first().click();
    await onboardingActiveStep.locator(".onboarding-active-step-copy strong").filter({ hasText: "메일 연결" }).waitFor();
    assert.equal(await onboardingActiveStep.locator("[data-required-empty='true']").count(), 2);
    assert.equal(await onboardingActiveStep.locator(".onboarding-required-hint.is-missing").count(), 2);

    await mailAddressInput.fill("invalid-mail");
    await page.waitForFunction(() => {
      const input = document.querySelector("#onboarding-active-step input[aria-describedby='onboarding-mail-address-hint']");
      const hint = document.getElementById("onboarding-mail-address-hint");
      return (
        input instanceof HTMLInputElement &&
        input.getAttribute("aria-invalid") === "true" &&
        hint?.textContent?.includes("메일 형식이 올바르지 않습니다.")
      );
    }, null, { timeout: 15000 });

    await mailAddressInput.fill(email);
    await page.waitForFunction(
      () => {
        const input = document.querySelector("#onboarding-active-step input[aria-describedby='onboarding-mail-address-hint']");
        const hint = document.getElementById("onboarding-mail-address-hint");
        return (
          input instanceof HTMLInputElement &&
          input.getAttribute("aria-invalid") !== "true" &&
          hint?.textContent?.includes("한전 메일을 읽고 알림 메일을 보낼 때 함께 사용할 계정입니다.")
        );
      },
      null,
      { timeout: 15000 }
    );

    await page.locator(".onboarding-step-chip").filter({ hasText: "발행 기본값 입력" }).first().click();
    await onboardingActiveStep.locator(".onboarding-active-step-copy strong").filter({ hasText: "발행 기본값 입력" }).waitFor();
    assert.equal(await page.getByRole("button", { name: "필수 입력 시작", exact: true }).count(), 0);
    for (const label of ["팝빌 접두어", "담당자 이름", "담당자 연락처", "담당자 이메일", "신규 고객 기본 비밀번호", "공동인증서 발급용 임시번호"]) {
      const input = onboardingActiveStep.getByLabel(label);
      const inputValue = await input.inputValue();
      assert.equal((await input.getAttribute("aria-invalid")) === "true", inputValue.trim() === "");
    }
    assert.ok((await onboardingActiveStep.locator(".onboarding-required-hint.is-missing").count()) >= 5);

    const operatorEmailInput = onboardingActiveStep.getByLabel("담당자 이메일");
    await operatorEmailInput.fill("ㅁㅈㅇㅁ");
    await page.waitForFunction(() => {
      const input = document.querySelector("#onboarding-active-step input[aria-describedby='onboarding-operator-email-hint']");
      const hint = document.getElementById("onboarding-operator-email-hint");
      return (
        input instanceof HTMLInputElement &&
        input.getAttribute("aria-invalid") === "true" &&
        hint?.textContent?.includes("메일 형식이 올바르지 않습니다.")
      );
    }, null, { timeout: 15000 });

    await onboardingActiveStep.getByLabel("팝빌 접두어").fill(`E2E${suffix.slice(-4)}_`);
    await page.waitForFunction(() => {
      const input = document.querySelector("#onboarding-popbill-user-id-prefix");
      return input instanceof HTMLInputElement && input.getAttribute("aria-invalid") !== "true";
    }, null, { timeout: 15000 });
  });

  await recordStep("pre-onboarding routing keeps onboarding accessible while manual tabs still work", async () => {
    await configureOnboardingSettings();
    await page.reload({ waitUntil: "networkidle" });
    await navButton("홈").click();
    await page.waitForFunction(() => window.location.hash === "#home", null, { timeout: 15000 });
    await navButton("홈").waitFor();
    assert.ok((await navButton("홈").first().getAttribute("class"))?.includes("active"));
    assert.equal(await page.getByRole("button", { name: "새로고침", exact: true }).count(), 0);
    const sidebarHoverZone = page.locator(".sidebar-hover-zone");
    const sidebarToggle = page.locator(".sidebar-thumb-toggle");
    await sidebarHoverZone.waitFor();
    assert.equal(await getSidebarToggleOpacity() < 0.2, true);
    await sidebarHoverZone.hover();
    await page.waitForFunction(
      () => {
        const toggle = document.querySelector(".sidebar-thumb-toggle");
        return toggle ? Number.parseFloat(window.getComputedStyle(toggle).opacity || "0") > 0.8 : false;
      },
      null,
      { timeout: 15000 }
    );
    await sidebarToggle.click();
    await page.locator(".app-shell.sidebar-collapsed").waitFor();
    const collapsedHoverZone = page.locator(".app-shell.sidebar-collapsed .sidebar-hover-zone");
    await collapsedHoverZone.hover();
    await page.waitForFunction(
      () => {
        const toggle = document.querySelector(".app-shell.sidebar-collapsed .sidebar-thumb-toggle");
        return toggle ? Number.parseFloat(window.getComputedStyle(toggle).opacity || "0") > 0.8 : false;
      },
      null,
      { timeout: 15000 }
    );
    await navButton("설정").click();
    await page.waitForFunction(() => window.location.hash === "#settings", null, { timeout: 15000 });
    assert.ok((await navButton("설정").first().getAttribute("class"))?.includes("active"));
    await navButton("도입 준비").click();
    await page.waitForFunction(() => window.location.hash === "#onboarding", null, { timeout: 15000 });
    assert.ok((await navButton("도입 준비").first().getAttribute("class"))?.includes("active"));
    await page.locator("#onboarding-active-step").waitFor();
  });

  await recordStep("stored onboarding passwords do not show false required errors", async () => {
    const onboardingActiveStep = page.locator("#onboarding-active-step");
    await page.locator(".onboarding-step-chip").filter({ hasText: "발행 기본값 입력" }).first().click();
    await onboardingActiveStep.locator(".onboarding-active-step-copy strong").filter({ hasText: "발행 기본값 입력" }).waitFor();
    assert.equal(await onboardingActiveStep.locator("[data-required-empty='true']").count(), 0);
    await page.locator(".onboarding-step-chip").filter({ hasText: "로컬 헬퍼 준비" }).first().click();
    await onboardingActiveStep.locator(".onboarding-active-step-copy strong").filter({ hasText: "로컬 헬퍼 준비" }).waitFor();
    await page.getByRole("button", { name: "공동인증서 읽기", exact: true }).waitFor();
  });

  await recordStep("onboarding helper step reads local certificates", async () => {
    const helperReadButton = page.locator("#onboarding-active-step").getByRole("button", { name: "공동인증서 읽기", exact: true });
    await helperReadButton.waitFor({ timeout: 15000 });
    await helperReadButton.click();

    await page.locator("#onboarding-active-step .onboarding-active-step-copy strong").filter({ hasText: "고객 초기 등록" }).waitFor();
    const onboardingPanel = page.locator(".panel-initial-onboarding");
    await onboardingPanel.waitFor();
    await onboardingPanel.getByText("인증서 2건 기준", { exact: false }).waitFor();
    await onboardingPanel.getByRole("button", { name: "양식 다운로드", exact: true }).waitFor();
  });

  await recordStep("customers remain reachable before onboarding commit", async () => {
    await page.evaluate(() => {
      window.location.hash = "#customers";
    });
    await page.waitForFunction(() => window.location.hash === "#customers", null, { timeout: 15000 });
    assert.ok((await navButton("고객").first().getAttribute("class"))?.includes("active"));
    await page.locator(".panel-customer-list").waitFor();
    await navButton("도입 준비").click();
    await page.waitForFunction(() => window.location.hash === "#onboarding", null, { timeout: 15000 });
    await page.locator(".onboarding-step-chip").filter({ hasText: "고객 초기 등록" }).first().click();
    await page.locator("#onboarding-active-step .onboarding-active-step-copy strong").filter({ hasText: "고객 초기 등록" }).waitFor();
  });

  await recordStep("onboarding download shifts step 4 CTA to upload", async () => {
    const onboardingPanel = page.locator(".panel-initial-onboarding");
    const primaryButton = onboardingPanel.getByRole("button", { name: "양식 다운로드", exact: true });
    await primaryButton.waitFor({ timeout: 15000 });
    const [download] = await Promise.all([page.waitForEvent("download"), primaryButton.click()]);
    await download.path();
    await page.getByText("양식을 다운로드했습니다.", { exact: false }).waitFor({ timeout: 15000 });
    await onboardingPanel.getByRole("button", { name: "양식 업로드", exact: true }).waitFor({ timeout: 15000 });
    await onboardingPanel.getByText("지금 할 일 · 양식 업로드", { exact: false }).waitFor();
  });

  await recordStep("onboarding upload previews a workbook-driven customer", async () => {
    const onboardingPanel = page.locator(".panel-initial-onboarding");
    const fileInput = page.locator('.initial-screen input[type="file"]').first();
    const workbookBuffer = await fs.readFile(onboardingWorkbookPath);
    const previewResponsePromise = page.waitForResponse(
      (response) => response.url().endsWith("/api/customer-onboarding/preview"),
      { timeout: 15000 }
    );

    try {
      const [previewResponse] = await Promise.all([
        previewResponsePromise,
        fileInput.setInputFiles({
          name: "AUTO-TAX_초기등록_양식.xlsx",
          mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          buffer: workbookBuffer
        })
      ]);
      if (previewResponse.status() !== 200) {
        throw new Error(`preview response ${previewResponse.status()} ${await previewResponse.text()}`);
      }
      await page.getByText("업로드 확인을 마쳤습니다.", { exact: false }).waitFor({ timeout: 15000 });
      await onboardingPanel.getByRole("button", { name: "고객 등록 반영", exact: true }).waitFor({ timeout: 15000 });
      await onboardingPanel.getByText("지금 할 일 · 고객 반영", { exact: false }).waitFor();
    } catch (error) {
      throw new Error(
        `preview did not complete. cause=${error instanceof Error ? error.message : String(error)} helper=${JSON.stringify(helperRequestLog)} panel=${JSON.stringify(
          await onboardingPanel.innerText()
        )}`
      );
    }

    const previewDetails = page.locator(".initial-onboarding-preview-details").first();
    await previewDetails.locator("summary").click();
    await previewDetails.getByText(onboardingCorpName, { exact: false }).waitFor();
    await previewDetails.getByText("발전소 1건", { exact: false }).waitFor();
    await previewDetails.getByText("공동인증서 1건", { exact: false }).waitFor();
    await page
      .getByText("범용 공동인증서는 등록 후 이번 업로드 고객만 대상으로 자동 연결을 시도합니다.", { exact: false })
      .waitFor();
  });

  await recordStep("onboarding commit stores customer and auto-links the imported general certificate", async () => {
    const onboardingPanel = page.locator(".panel-initial-onboarding");
    await Promise.all([
      page.waitForResponse((response) => response.url().endsWith("/api/customer-onboarding/commit") && response.status() === 202),
      onboardingPanel.getByRole("button", { name: "고객 등록 반영", exact: true }).click()
    ]);

    await page
      .getByText("범용 공동인증서 자동 연결 · 성공 1건 / 건너뜀 0건", { exact: false })
      .waitFor();
    await page.getByText(/가져오기 완료 · 신규 1건 \/ 갱신 0건 \/ 인증서 1건/).waitFor();

    if (helperRequestLog.bridgeProbeCount + helperRequestLog.certificateListCount < 2) {
      throw new Error(
        `expected at least 2 helper discovery calls, got bridgeProbe=${helperRequestLog.bridgeProbeCount} certificateList=${helperRequestLog.certificateListCount}`
      );
    }

    const preflightCertificateIndices = helperRequestLog.preflightRequests.map((request) => String(request.certificateIndex ?? ""));
    assert.deepEqual(preflightCertificateIndices.sort(), [onboardingElectronicTaxCertificate.index, onboardingGeneralCertificate.index].sort());

    const { data: importedCustomer, error: customerError } = await supabase
      .from("managed_customers")
      .select("id, business_number, corp_name, addr")
      .eq("organization_id", organizationId)
      .eq("business_number", onboardingBusinessNumber)
      .single();
    if (customerError) throw customerError;
    assert.equal(importedCustomer.corp_name, onboardingCorpName);
    assert.equal(importedCustomer.addr, onboardingAddress);

    const { data: matchAddresses, error: matchAddressError } = await supabase
      .from("managed_customer_match_addresses")
      .select("match_address")
      .eq("managed_customer_id", importedCustomer.id);
    if (matchAddressError) throw matchAddressError;
    assert.deepEqual(matchAddresses.map((row) => row.match_address), [onboardingAddress]);

    const { data: certificates, error: certificateError } = await supabase
      .from("customer_certificates")
      .select("certificate_kind, certificate_name, link_source, certificate_password_encrypted")
      .eq("organization_id", organizationId)
      .eq("managed_customer_id", importedCustomer.id);
    if (certificateError) throw certificateError;
    assert.equal(certificates.length, 2);
    assert.ok(
      certificates.some(
        (certificate) =>
          certificate.certificate_kind === "electronic_tax" &&
          certificate.certificate_name === onboardingElectronicTaxCertificate.cn
      )
    );
    assert.ok(
      certificates.some(
        (certificate) =>
          certificate.certificate_kind === "general_business" &&
          certificate.certificate_name === onboardingGeneralCertificate.cn &&
          certificate.link_source === "auto" &&
          Boolean(certificate.certificate_password_encrypted)
      )
    );
  });

  await recordStep("onboarding commit unlocks the operating shell", async () => {
    await navButton("홈").waitFor({ timeout: 15000 });
    await navButton("고객").waitFor({ timeout: 15000 });
    await navButton("홈").click();
    await page.waitForFunction(() => window.location.hash === "#home", null, { timeout: 15000 });
  });

  await recordStep("onboarding-created customer visible after tab round-trip", async () => {
    await page.evaluate(() => {
      window.location.hash = "#customers";
    });
    await page.waitForFunction(() => window.location.hash === "#customers", null, { timeout: 15000 });
    const customerPanel = page.locator(".panel-customer-list");
    await customerPanel.waitFor();
    try {
      const allFilter = page.locator(".customer-console-filter-strip button").filter({ hasText: "전체" }).first();
      if ((await allFilter.count()) > 0) {
        await allFilter.click();
      }
      await page.locator(".customer-console-search input").fill(onboardingCorpName);
      const targetRow = page.locator(".customer-console-table tbody tr").filter({ hasText: onboardingCorpName }).first();
      await targetRow.waitFor();
      await targetRow.getByText(onboardingBusinessNumber, { exact: false }).waitFor();
    } catch (error) {
      throw new Error(
        `customer console row not visible. cause=${error instanceof Error ? error.message : String(error)} panel=${JSON.stringify(
          await customerPanel.innerText()
        )}`
      );
    }
  });

  await recordStep("customer console row opens drawer and keeps status scan visible", async () => {
    const targetRow = page.locator(".customer-console-table tbody tr").filter({ hasText: onboardingCorpName }).first();
    const widthsBefore = await page.evaluate(() => {
      const readWidth = (selector) => {
        const element = document.querySelector(selector);
        if (!element) return null;
        return Math.round(element.getBoundingClientRect().width);
      };

      return {
        panel: readWidth(".panel-customer-list"),
        metrics: readWidth(".customer-console-metrics"),
        controls: readWidth(".customer-console-controls"),
        table: readWidth(".customer-console-table-wrap")
      };
    });
    await targetRow.click();

    const backdrop = page.locator(".customer-console-drawer-backdrop");
    const drawer = page.locator(".customer-console-drawer");
    await backdrop.waitFor({ timeout: 15000 });
    await drawer.waitFor({ timeout: 15000 });
    await backdrop.hover();
    await drawer.getByText(onboardingCorpName, { exact: false }).waitFor();
    await drawer.getByText(onboardingBusinessNumber, { exact: false }).waitFor();
    await drawer.getByText("상태 요약", { exact: true }).waitFor();
    await drawer.getByText("기본 정보 편집", { exact: false }).waitFor();
    const drawerLayout = await drawer.evaluate((element) => {
      const styles = window.getComputedStyle(element);
      return {
        position: styles.position,
        right: styles.right
      };
    });
    const backdropColor = await backdrop.evaluate((element) => window.getComputedStyle(element).backgroundColor);
    const widthsAfter = await page.evaluate(() => {
      const readWidth = (selector) => {
        const element = document.querySelector(selector);
        if (!element) return null;
        return Math.round(element.getBoundingClientRect().width);
      };

      return {
        panel: readWidth(".panel-customer-list"),
        metrics: readWidth(".customer-console-metrics"),
        controls: readWidth(".customer-console-controls"),
        table: readWidth(".customer-console-table-wrap")
      };
    });
    if (drawerLayout.position !== "fixed") {
      throw new Error(`customer drawer should overlay with fixed positioning. got=${JSON.stringify(drawerLayout)}`);
    }
    if (!/rgba?\(15,\s*23,\s*42(?:,|\))/.test(backdropColor)) {
      throw new Error(`customer drawer backdrop hover color regressed. got=${backdropColor}`);
    }
    for (const key of ["panel", "metrics", "controls", "table"]) {
      const before = widthsBefore[key];
      const after = widthsAfter[key];
      if (before === null || after === null) {
        throw new Error(`customer console width probe missing for ${key}. before=${JSON.stringify(widthsBefore)} after=${JSON.stringify(widthsAfter)}`);
      }
      if (Math.abs(before - after) > 1) {
        throw new Error(`customer console width changed while drawer opened for ${key}. before=${before} after=${after}`);
      }
    }
    await drawer.getByRole("button", { name: /발행 이력 \d+/ }).click();
    await drawer.getByText("발행 이력", { exact: true }).waitFor();
    await drawer.getByRole("button", { name: "개요", exact: true }).click();
    await drawer.getByText("해결 필요 항목", { exact: false }).waitFor();
    await drawer.getByRole("button", { name: "닫기", exact: true }).click();
    await page.waitForFunction(() => !document.querySelector(".customer-console-drawer"), null, { timeout: 15000 });
    await targetRow.waitFor();
  });

  await recordStep("customer console create drawer opens in-place and closes cleanly", async () => {
    const customersShell = page.locator(".customer-console-shell");
    await customersShell.getByRole("button", { name: "새 고객", exact: true }).first().click();

    const drawer = page.locator(".customer-console-drawer");
    await drawer.waitFor({ timeout: 15000 });
    await drawer.getByText("새 고객 등록", { exact: true }).waitFor();
    await drawer.getByText("등록 가이드", { exact: true }).waitFor();
    await drawer.getByText("대표자명, 사업자번호, 상호, 주소를 먼저 저장한 뒤 추가 정보를 보강하세요.", { exact: false }).waitFor();
    await drawer.getByRole("button", { name: "닫기", exact: true }).click();
    await page.waitForFunction(() => !document.querySelector(".customer-console-drawer"), null, { timeout: 15000 });
    await page.locator(".customer-console-table tbody tr").filter({ hasText: onboardingCorpName }).first().waitFor();
  });

  await recordStep("settings member management flow", async () => {
    await page.evaluate(() => {
      window.location.hash = "#settings";
    });
    await page.waitForFunction(() => window.location.hash === "#settings", null, { timeout: 15000 });
    await page.locator(".settings-layout").waitFor();
    await page.locator(".settings-step-card").filter({ hasText: "계정 / 작업공간" }).click();
    const settingsDetail = page.locator(".settings-detail");
    await settingsDetail.locator('label:has-text("로그인 아이디") input').fill(`member${suffix}`);
    await settingsDetail.locator('label:has-text("이름") input').fill(`멤버 ${suffix}`);
    await settingsDetail.locator('label:has-text("임시 비밀번호") input').fill(`Temp!${suffix}`);
    await settingsDetail.getByRole("button", { name: "사용자 추가" }).click();
    const dialog = page.locator('[role="dialog"], [role="alertdialog"]');
    await dialog.getByText("사용자 추가 완료", { exact: true }).waitFor();
    await dialog.getByRole("button", { name: "확인" }).click();
    await settingsDetail.locator(".workspace-member-card").filter({ hasText: `member${suffix}` }).first().waitFor();
  });

  await recordStep("certificates action-needed view renders", async () => {
    await page.evaluate(() => {
      window.location.hash = "#certificates";
    });
    await page.waitForFunction(() => window.location.hash === "#certificates", null, { timeout: 15000 });
    await page.locator(".panel-customer-renewal").waitFor();
    await page.locator(".certificate-guide-lead strong").filter({ hasText: /조치 필요 고객 \d+명/ }).waitFor();
  });

  await recordStep("latest helper metadata keeps upgrade notice hidden", async () => {
    fakeHelperVersion = "0.1.0";
    fakeHelperMetadataMode = "ok";
    fakeHelperReleaseMetadata = {
      latestVersion: "0.1.0",
      minSupportedVersion: "0.1.0",
      downloadUrl: "/downloads/renewal-local-helper.zip",
      releasedAt: "2026-04-14T00:00:00.000Z"
    };

    await page.evaluate(() => {
      window.location.hash = "#settings";
    });
    await page.waitForFunction(() => window.location.hash === "#settings", null, { timeout: 15000 });
    await page.locator(".settings-layout").waitFor();
    await page.locator(".settings-step-card").filter({ hasText: "헬퍼" }).first().click();
    const helperPanel = page.locator(".panel-settings-helper");
    await helperPanel.waitFor();
    const helperRefreshButton = helperPanel.getByRole("button", { name: "상태 다시 확인" }).first();
    await Promise.all([
      page.waitForResponse((response) => response.url().endsWith("/health") && response.status() === 200),
      page.waitForResponse((response) => response.url().endsWith("/downloads/renewal-local-helper.json") && response.status() === 200),
      helperRefreshButton.click()
    ]);
    await page.waitForTimeout(300);
    assert.equal(await page.getByText("헬퍼 업데이트 권장", { exact: true }).count(), 0);
    assert.equal(await page.getByText("헬퍼 재설치 필요", { exact: true }).count(), 0);
  });

  await recordStep("upgrade-available helper shows update notice but keeps actions enabled", async () => {
    fakeHelperVersion = "0.1.0";
    fakeHelperMetadataMode = "ok";
    fakeHelperReleaseMetadata = {
      latestVersion: "0.1.1",
      minSupportedVersion: "0.1.0",
      downloadUrl: "/downloads/renewal-local-helper.zip",
      releasedAt: "2026-04-14T00:00:00.000Z"
    };

    const helperPanel = page.locator(".panel-settings-helper");
    const helperRefreshButton = helperPanel.getByRole("button", { name: "상태 다시 확인" }).first();
    await Promise.all([
      page.waitForResponse((response) => response.url().endsWith("/health") && response.status() === 200),
      page.waitForResponse((response) => response.url().endsWith("/downloads/renewal-local-helper.json") && response.status() === 200),
      helperRefreshButton.click()
    ]);
    await helperPanel.getByText("헬퍼 업데이트 권장", { exact: true }).waitFor();
    await helperPanel.getByText("최신 버전: v0.1.1", { exact: true }).waitFor();
    await page.evaluate(() => {
      window.location.hash = "#certificates";
    });
    await page.waitForFunction(() => window.location.hash === "#certificates", null, { timeout: 15000 });
    const certificatesReadButton = page.locator(".panel-customer-renewal").getByRole("button", { name: "공동인증서 읽기" });
    assert.equal(await certificatesReadButton.isDisabled(), false);
    await page.evaluate(() => {
      window.location.hash = "#settings";
    });
    await page.waitForFunction(() => window.location.hash === "#settings", null, { timeout: 15000 });
    await page.locator(".settings-layout").waitFor();
    await page.locator(".panel-settings-helper").waitFor();
  });

  await recordStep("upgrade-required helper blocks helper-dependent actions", async () => {
    fakeHelperVersion = "0.1.0";
    fakeHelperMetadataMode = "ok";
    fakeHelperReleaseMetadata = {
      latestVersion: "0.1.2",
      minSupportedVersion: "0.1.1",
      downloadUrl: "/downloads/renewal-local-helper.zip",
      releasedAt: "2026-04-14T00:00:00.000Z"
    };

    const helperPanel = page.locator(".panel-settings-helper");
    const helperRefreshButton = helperPanel.getByRole("button", { name: "상태 다시 확인" }).first();
    await Promise.all([
      page.waitForResponse((response) => response.url().endsWith("/health") && response.status() === 200),
      page.waitForResponse((response) => response.url().endsWith("/downloads/renewal-local-helper.json") && response.status() === 200),
      helperRefreshButton.click()
    ]);
    await helperPanel.getByText("헬퍼 재설치 필요", { exact: true }).waitFor();
    await helperPanel.getByText("최소 지원 버전: v0.1.1", { exact: true }).waitFor();
    await page.evaluate(() => {
      window.location.hash = "#certificates";
    });
    await page.waitForFunction(() => window.location.hash === "#certificates", null, { timeout: 15000 });
    const certificatesReadButton = page.locator(".panel-customer-renewal").getByRole("button", { name: "공동인증서 읽기" });
    assert.equal(await certificatesReadButton.isDisabled(), true);
    await page.evaluate(() => {
      window.location.hash = "#settings";
    });
    await page.waitForFunction(() => window.location.hash === "#settings", null, { timeout: 15000 });
    await page.locator(".settings-layout").waitFor();
    await page.locator(".panel-settings-helper").waitFor();
  });

  await recordStep("helper metadata fetch failure falls back without hard block", async () => {
    fakeHelperVersion = "0.1.0";
    fakeHelperMetadataMode = "error";

    const helperPanel = page.locator(".panel-settings-helper");
    const helperRefreshButton = helperPanel.getByRole("button", { name: "상태 다시 확인" }).first();
    await Promise.all([
      page.waitForResponse((response) => response.url().endsWith("/health") && response.status() === 200),
      page.waitForResponse((response) => response.url().endsWith("/downloads/renewal-local-helper.json") && response.status() === 503),
      helperRefreshButton.click()
    ]);
    await page.waitForTimeout(300);
    assert.equal(await page.getByText("헬퍼 업데이트 권장", { exact: true }).count(), 0);
    assert.equal(await page.getByText("헬퍼 재설치 필요", { exact: true }).count(), 0);
    await page.evaluate(() => {
      window.location.hash = "#certificates";
    });
    await page.waitForFunction(() => window.location.hash === "#certificates", null, { timeout: 15000 });
    const certificatesReadButton = page.locator(".panel-customer-renewal").getByRole("button", { name: "공동인증서 읽기" });
    assert.equal(await certificatesReadButton.isDisabled(), false);
  });

  await recordStep("logout returns to public page", async () => {
    await page.getByRole("button", { name: "로그아웃" }).click();
    await page.locator("#public-login-card").getByLabel("로그인 계정").waitFor();
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
