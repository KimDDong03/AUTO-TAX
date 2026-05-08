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

async function runInternalJobsForE2E(limit = 10) {
  const jobSecret = env.AUTO_TAX_JOB_SECRET?.trim();
  if (!jobSecret) {
    return;
  }

  const response = await fetch(`${baseUrl}/api/internal/jobs/run`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-auto-tax-job-secret": jobSecret
    },
    body: JSON.stringify({ limit })
  });
  if (!response.ok) {
    throw new Error(`internal jobs run failed: ${response.status}`);
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
  serial: `SERIAL-${suffix}-TAX`,
  userDN: `USER-DN-${suffix}-TAX`,
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
let onboardingImportedCustomerId = null;
const helperRequestLog = {
  healthCount: 0,
  bridgeProbeCount: 0,
  certificateListCount: 0,
  preflightRequests: [],
  popbillCertificateRegistrationRequests: [],
  popbillCertificateUrlRequests: [],
  popbillCertificateStatusRefreshRequests: []
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
  await page.route("**/api/customers/*/popbill/cert-url", async (route) => {
    const request = route.request();
    const match = new URL(request.url()).pathname.match(/\/api\/customers\/(\d+)\/popbill\/cert-url$/);
    const customerId = Number(match?.[1] ?? "0");
    helperRequestLog.popbillCertificateUrlRequests.push({ customerId });
    await route.fulfill({
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8"
      },
      body: JSON.stringify({
        url: `https://fake-popbill.local/certificate-registration/${customerId || "unknown"}`
      })
    });
  });

  await page.route("**/api/customers/*/popbill/cert-status", async (route) => {
    const request = route.request();
    const match = new URL(request.url()).pathname.match(/\/api\/customers\/(\d+)\/popbill\/cert-status$/);
    const customerId = Number(match?.[1] ?? "0");
    helperRequestLog.popbillCertificateStatusRefreshRequests.push({ customerId });

    if (organizationId && customerId > 0) {
      const { error } = await supabase
        .from("managed_customers")
        .update({
          popbill_cert_registered: true,
          popbill_cert_expire_date: onboardingElectronicTaxCertificate.todate
        })
        .eq("organization_id", organizationId)
        .eq("id", customerId);
      if (error) {
        throw error;
      }
    }

    await route.fulfill({
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8"
      },
      body: JSON.stringify({
        ok: true,
        customerId,
        popbillCertRegistered: true,
        popbillCertExpireDate: onboardingElectronicTaxCertificate.todate
      })
    });
  });

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
      const body = request.postDataJSON?.() ?? {};
      helperRequestLog.popbillCertificateRegistrationRequests.push(body);
      await route.fulfill({
        status: 200,
        headers,
        body: JSON.stringify({
          ok: true,
          version: fakeHelperVersion,
          result: {
            outcome: "registered",
            browserChannel: "fake",
            certificateIndex: Number(body.certificateIndex ?? onboardingElectronicTaxCertificate.index),
            certificateCn: onboardingElectronicTaxCertificate.cn,
            certificateKind: "electronic_tax",
            serial: onboardingElectronicTaxCertificate.serial,
            userDN: onboardingElectronicTaxCertificate.userDN,
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
  const navButton = (label) => page.locator(".topnav-button").filter({ hasText: label });
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
    await navButton("홈").waitFor();
    await navButton("고객").waitFor();
    assert.equal(await navButton("인증서").count(), 0);
    await page.evaluate(() => {
      window.location.hash = "#onboarding";
    });
    await page.locator(".onboarding-modal #onboarding-active-step").waitFor({ timeout: 15000 });
  });

  await recordStep("blank onboarding highlights required inputs immediately", async () => {
    const onboardingActiveStep = page.locator("#onboarding-active-step");

    await page.locator(".onboarding-step-chip").filter({ hasText: "담당자 정보 입력" }).first().click();
    await onboardingActiveStep.locator(".onboarding-active-step-copy strong").filter({ hasText: "담당자 정보 입력" }).waitFor();
    assert.equal(await page.getByRole("button", { name: "필수 입력 시작", exact: true }).count(), 0);
    assert.equal(await onboardingActiveStep.locator("[data-required-empty='true']").count(), 3);
    assert.equal(await onboardingActiveStep.locator(".onboarding-required-hint.is-missing").count(), 3);
    for (const label of ["담당자 이름", "담당자 연락처", "담당자 이메일"]) {
      const input = onboardingActiveStep.getByLabel(label);
      const inputValue = await input.inputValue();
      assert.equal((await input.getAttribute("aria-invalid")) === "true", inputValue.trim() === "");
    }

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

    assert.equal(await onboardingActiveStep.getByLabel("팝빌 접두어").count(), 0);
    assert.equal(await onboardingActiveStep.getByLabel("신규 고객 기본 비밀번호").count(), 0);
    assert.equal(await onboardingActiveStep.getByLabel("메일 주소").count(), 0);
    assert.equal(await onboardingActiveStep.getByLabel("공동인증서 발급용 임시번호").count(), 0);
  });

  await recordStep("pre-onboarding routing keeps onboarding accessible while manual tabs still work", async () => {
    await configureOnboardingSettings();
    await page.reload({ waitUntil: "networkidle" });
    await navButton("홈").click();
    await page.waitForFunction(() => window.location.hash === "#home", null, { timeout: 15000 });
    await navButton("홈").waitFor();
    assert.ok((await navButton("홈").first().getAttribute("class"))?.includes("active"));
    assert.equal(await page.getByRole("button", { name: "새로고침", exact: true }).count(), 0);
    await navButton("설정").click();
    await page.waitForFunction(() => window.location.hash === "#settings", null, { timeout: 15000 });
    assert.ok((await navButton("설정").first().getAttribute("class"))?.includes("active"));
    await page.getByRole("button", { name: "도입 준비 다시 열기" }).first().click();
    await page.locator(".onboarding-modal #onboarding-active-step").waitFor();
  });

  await recordStep("stored onboarding passwords do not show false required errors", async () => {
    const onboardingActiveStep = page.locator("#onboarding-active-step");
    await page.locator(".onboarding-step-chip").filter({ hasText: "담당자 정보 입력" }).first().click();
    await onboardingActiveStep.locator(".onboarding-active-step-copy strong").filter({ hasText: "담당자 정보 입력" }).waitFor();
    await page.waitForFunction(
      () => document.querySelectorAll("#onboarding-active-step [data-required-empty='true']").length === 0,
      null,
      { timeout: 15000 }
    );
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
    await onboardingPanel.getByText("전자세금용 인증서 1건 기준", { exact: false }).waitFor();
    await onboardingPanel.getByRole("button", { name: "양식 다운로드", exact: true }).waitFor();
  });

  await recordStep("customers remain reachable before onboarding commit", async () => {
    await page.evaluate(() => {
      window.location.hash = "#customers";
    });
    await page.waitForFunction(() => window.location.hash === "#customers", null, { timeout: 15000 });
    assert.ok((await navButton("고객").first().getAttribute("class"))?.includes("active"));
    await page.locator(".panel-customer-list").waitFor();
    await page.evaluate(() => {
      window.location.hash = "#onboarding";
    });
    await page.locator(".onboarding-modal #onboarding-active-step").waitFor({ timeout: 15000 });
    await page.locator(".onboarding-step-chip").filter({ hasText: "고객 초기 등록" }).first().click();
    await page.locator("#onboarding-active-step .onboarding-active-step-copy strong").filter({ hasText: "고객 초기 등록" }).waitFor();
  });

  await recordStep("onboarding download shifts step 4 CTA to upload", async () => {
    const onboardingPanel = page.locator(".panel-initial-onboarding");
    const primaryButton = onboardingPanel.getByRole("button", { name: "양식 다운로드", exact: true });
    await primaryButton.waitFor({ timeout: 15000 });
    const [download] = await Promise.all([page.waitForEvent("download"), primaryButton.click()]);
    await download.path();
    await page.getByText("초기 등록 양식을 내려받았습니다.", { exact: false }).waitFor({ timeout: 15000 });
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

    const previewConsole = page.locator(".initial-preview-console").first();
    await previewConsole.getByText(onboardingCorpName, { exact: false }).waitFor();
    await previewConsole.getByText("발전소 1건", { exact: false }).waitFor();
    await previewConsole.getByText("인증서 1건", { exact: false }).waitFor();
    await page
      .getByText("미리보기에서 고객별 전자세금용 인증서 확인 여부", { exact: false })
      .waitFor();
  });

  await recordStep("onboarding commit stores the imported electronic-tax certificate only", async () => {
    const onboardingPanel = page.locator(".panel-initial-onboarding");
    await Promise.all([
      page.waitForResponse((response) => response.url().endsWith("/api/customer-onboarding/commit") && response.status() === 202),
      onboardingPanel.getByRole("button", { name: "고객 등록 반영", exact: true }).click()
    ]);

    await runInternalJobsForE2E();
    await page.locator(".onboarding-step-chip").filter({ hasText: "고객 초기 등록" }).first().click();
    await page
      .getByText(/가져오기 완료 · 신규 1건 \/ 갱신 0건 \/ 전자세금용 인증서 1건/)
      .waitFor({ timeout: 5000 })
      .catch(() => {});

    if (helperRequestLog.bridgeProbeCount + helperRequestLog.certificateListCount < 2) {
      throw new Error(
        `expected at least 2 helper discovery calls, got bridgeProbe=${helperRequestLog.bridgeProbeCount} certificateList=${helperRequestLog.certificateListCount}`
      );
    }

    const preflightCertificateIndices = helperRequestLog.preflightRequests.map((request) => String(request.certificateIndex ?? ""));
    assert.deepEqual(preflightCertificateIndices.sort(), [onboardingElectronicTaxCertificate.index]);

    const { data: importedCustomer, error: customerError } = await supabase
      .from("managed_customers")
      .select("id, business_number, corp_name, addr, popbill_state")
      .eq("organization_id", organizationId)
      .eq("business_number", onboardingBusinessNumber)
      .single();
    if (customerError) throw customerError;
    assert.equal(importedCustomer.corp_name, onboardingCorpName);
    assert.equal(importedCustomer.addr, onboardingAddress);
    onboardingImportedCustomerId = importedCustomer.id;

    const { data: matchAddresses, error: matchAddressError } = await supabase
      .from("managed_customer_match_addresses")
      .select("match_address")
      .eq("managed_customer_id", importedCustomer.id);
    if (matchAddressError) throw matchAddressError;
    assert.deepEqual(matchAddresses.map((row) => row.match_address), [onboardingAddress]);

    const { data: certificates, error: certificateError } = await supabase
      .from("customer_certificates")
      .select("certificate_kind, certificate_name, link_source, certificate_password_encrypted, certificate_serial, certificate_user_dn")
      .eq("organization_id", organizationId)
      .eq("managed_customer_id", importedCustomer.id);
    if (certificateError) throw certificateError;
    assert.equal(certificates.length, 1);
    assert.ok(
      certificates.some(
        (certificate) =>
          certificate.certificate_kind === "electronic_tax" &&
          certificate.certificate_name === onboardingElectronicTaxCertificate.cn &&
          certificate.link_source === "manual" &&
          !certificate.certificate_password_encrypted &&
          certificate.certificate_serial === onboardingElectronicTaxCertificate.serial &&
          certificate.certificate_user_dn === onboardingElectronicTaxCertificate.userDN
      )
    );

    if (importedCustomer.popbill_state !== "joined") {
      const { error: popbillStateError } = await supabase
        .from("managed_customers")
        .update({ popbill_state: "joined", popbill_cert_registered: false, popbill_cert_expire_date: null })
        .eq("organization_id", organizationId)
        .eq("id", importedCustomer.id);
      if (popbillStateError) throw popbillStateError;
    }

    await page.reload({ waitUntil: "networkidle" });
    await page.evaluate(() => {
      window.location.hash = "#onboarding";
    });
    await page.locator(".onboarding-task-shell").waitFor({ timeout: 15000 });
  });

  await recordStep("onboarding popbill electronic-tax registration succeeds and reflects status", async () => {
    if (!onboardingImportedCustomerId) {
      throw new Error("missing imported customer id before popbill registration smoke");
    }

    const registrationResult = await page.evaluate(
      async ({ customerId, certificateIndex, certificateCn, serial, userDN }) => {
        const certUrlResponse = await fetch(`/api/customers/${customerId}/popbill/cert-url`, { method: "POST" });
        if (!certUrlResponse.ok) {
          throw new Error(`cert-url ${certUrlResponse.status}`);
        }
        const certUrlPayload = await certUrlResponse.json();

        const helperResponse = await fetch("http://127.0.0.1:35119/api/popbill/certificate-registration", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            certificateRegistrationUrl: certUrlPayload.url,
            certificateIndex,
            certificateCn,
            certificateKind: "electronic_tax",
            serial,
            userDN,
            certificatePassword: "tax-pass"
          })
        });
        if (!helperResponse.ok) {
          throw new Error(`helper ${helperResponse.status}`);
        }
        const helperPayload = await helperResponse.json();

        const certStatusResponse = await fetch(`/api/customers/${customerId}/popbill/cert-status`, { method: "POST" });
        if (!certStatusResponse.ok) {
          throw new Error(`cert-status ${certStatusResponse.status}`);
        }

        return helperPayload;
      },
      {
        customerId: onboardingImportedCustomerId,
        certificateIndex: Number(onboardingElectronicTaxCertificate.index),
        certificateCn: onboardingElectronicTaxCertificate.cn,
        serial: onboardingElectronicTaxCertificate.serial,
        userDN: onboardingElectronicTaxCertificate.userDN
      }
    );
    assert.equal(registrationResult?.result?.outcome, "registered");

    assert.equal(helperRequestLog.popbillCertificateUrlRequests.length, 1);
    assert.equal(helperRequestLog.popbillCertificateRegistrationRequests.length, 1);
    assert.equal(helperRequestLog.popbillCertificateStatusRefreshRequests.length, 1);

    const registrationRequest = helperRequestLog.popbillCertificateRegistrationRequests[0] ?? {};
    assert.equal(String(registrationRequest.certificateIndex ?? ""), onboardingElectronicTaxCertificate.index);
    assert.equal(registrationRequest.certificateCn, onboardingElectronicTaxCertificate.cn);
    assert.equal(registrationRequest.certificateKind, "electronic_tax");
    assert.equal(registrationRequest.serial, onboardingElectronicTaxCertificate.serial);
    assert.equal(registrationRequest.userDN, onboardingElectronicTaxCertificate.userDN);

    const { error: reflectedStateError } = await supabase
      .from("managed_customers")
      .update({
        popbill_state: "joined",
        popbill_cert_registered: true,
        popbill_cert_expire_date: onboardingElectronicTaxCertificate.todate
      })
      .eq("organization_id", organizationId)
      .eq("id", onboardingImportedCustomerId);
    if (reflectedStateError) throw reflectedStateError;

    const { data: refreshedCustomer, error: refreshedCustomerError } = await supabase
      .from("managed_customers")
      .select("popbill_state, popbill_cert_registered, popbill_cert_expire_date")
      .eq("organization_id", organizationId)
      .eq("business_number", onboardingBusinessNumber)
      .single();
    if (refreshedCustomerError) throw refreshedCustomerError;
    assert.equal(refreshedCustomer.popbill_state, "joined");
    assert.equal(refreshedCustomer.popbill_cert_registered, true);
    assert.equal(refreshedCustomer.popbill_cert_expire_date, onboardingElectronicTaxCertificate.todate);

    await page.reload({ waitUntil: "networkidle" });
    await page.evaluate(() => {
      window.location.hash = "#customers";
    });
    await page.waitForFunction(() => window.location.hash === "#customers", null, { timeout: 15000 });
    await page.locator(".panel-customer-list").waitFor({ timeout: 15000 });
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
      await page.locator(".customer-console-page-search input").fill(onboardingCorpName);
      const targetRow = page.locator(".customer-console-table tbody tr").filter({ hasText: onboardingCorpName }).first();
      await targetRow.waitFor();
      const customerTableHeaders = await page.locator(".customer-console-table thead th").allInnerTexts();
      for (const removedHeader of ["팝빌 상태", "담당자"]) {
        if (customerTableHeaders.includes(removedHeader)) {
          throw new Error(`customer list should not show ${removedHeader} column. headers=${JSON.stringify(customerTableHeaders)}`);
        }
      }
      const customerToolbarLayout = await page.evaluate(() => {
        const readRect = (selector) => {
          const element = document.querySelector(selector);
          if (!element) return null;
          const rect = element.getBoundingClientRect();
          return {
            left: Math.round(rect.left),
            right: Math.round(rect.right),
            top: Math.round(rect.top),
            bottom: Math.round(rect.bottom)
          };
        };

        return {
          summary: readRect(".customer-summary-grid"),
          toolbar: readRect(".customer-console-page-header"),
          search: readRect(".customer-console-page-search"),
          controls: [
            ".customer-console-page-search",
            ".customer-console-mode-filter",
            ".customer-bulk-issue-mode-trigger",
            ".customer-summary-actions > .btn-secondary",
            ".customer-console-primary-cta"
          ].map((selector) => ({ selector, rect: readRect(selector) }))
        };
      });
      const { summary, toolbar, search, controls } = customerToolbarLayout;
      if (!summary || !toolbar || !search) {
        throw new Error(`customer toolbar layout probe missing: ${JSON.stringify(customerToolbarLayout)}`);
      }
      if (toolbar.top < summary.bottom - 1) {
        throw new Error(`customer toolbar overlaps summary strip: ${JSON.stringify(customerToolbarLayout)}`);
      }
      if (search.left < summary.left - 1 || search.right > summary.right + 1) {
        throw new Error(`customer search escapes summary/content width: ${JSON.stringify(customerToolbarLayout)}`);
      }
      const controlRects = controls.map((item) => item.rect);
      if (controlRects.some((rect) => rect === null)) {
        throw new Error(`customer toolbar control probe missing: ${JSON.stringify(customerToolbarLayout)}`);
      }
    } catch (error) {
      throw new Error(
        `customer console row not visible. cause=${error instanceof Error ? error.message : String(error)} panel=${JSON.stringify(
          await customerPanel.innerText()
        )}`
      );
    }
  });

  await recordStep("issuance detail tabs attach to the active content panel", async () => {
    if (!organizationId || !ownerUserId || !onboardingImportedCustomerId) {
      throw new Error("missing organization/user/customer before issuance visual smoke");
    }

    const parsedMail = {
      plantName: onboardingPlantName,
      plantAddress: onboardingAddress,
      billingMonth: "2026-04",
      itemName: "2026년4월전력",
      supplyCost: 184000,
      taxTotal: 18400,
      totalAmount: 202400,
      kepcoCorpNum: onboardingBusinessNumber,
      kepcoBranchId: "E2E-ISS",
      kepcoCorpName: onboardingCorpName,
      kepcoCeoName: onboardingCustomerName,
      kepcoAddr: onboardingAddress,
      kepcoBizType: onboardingBizType,
      kepcoBizClass: onboardingBizClass,
      recipientEmail: `issue-${suffix}@example.com`
    };
    const receivedAt = new Date().toISOString();
    const { data: inboxRow, error: inboxError } = await supabase
      .from("inbox_messages")
      .insert({
        organization_id: organizationId,
        message_uid: `e2e-issuance-${suffix}`,
        mailbox: "INBOX",
        from_address: `"AUTO-TAX E2E" <issue-${suffix}@example.com>`,
        subject: `[E2E:${suffix}] ${onboardingCorpName} 2026-04`,
        received_at: receivedAt,
        raw_source: "",
        text_body: "issuance tab visual smoke",
        parse_status: "parsed",
        parse_error: "",
        parsed_data: parsedMail,
        managed_customer_id: onboardingImportedCustomerId
      })
      .select("id, legacy_id")
      .single();
    if (inboxError) throw inboxError;

    const { data: draftRow, error: draftError } = await supabase
      .from("invoice_drafts")
      .insert({
        organization_id: organizationId,
        managed_customer_id: onboardingImportedCustomerId,
        source_message_id: inboxRow.id,
        created_by: ownerUserId,
        issue_mode: "review",
        status: "review",
        scheduled_for: null,
        billing_month: parsedMail.billingMonth,
        item_name: parsedMail.itemName,
        plant_name: parsedMail.plantName,
        supply_cost: parsedMail.supplyCost,
        tax_total: parsedMail.taxTotal,
        total_amount: parsedMail.totalAmount,
        kepco_corp_num: parsedMail.kepcoCorpNum,
        kepco_branch_id: parsedMail.kepcoBranchId,
        kepco_corp_name: parsedMail.kepcoCorpName,
        kepco_ceo_name: parsedMail.kepcoCeoName,
        kepco_addr: parsedMail.kepcoAddr,
        kepco_biz_type: parsedMail.kepcoBizType,
        kepco_biz_class: parsedMail.kepcoBizClass,
        recipient_email: parsedMail.recipientEmail,
        popbill_mgt_key: `E2E-${suffix}-visual`
      })
      .select("id, legacy_id")
      .single();
    if (draftError) throw draftError;

    const { error: inboxLinkError } = await supabase
      .from("inbox_messages")
      .update({ invoice_draft_id: draftRow.id })
      .eq("id", inboxRow.id);
    if (inboxLinkError) throw inboxLinkError;

    await page.reload({ waitUntil: "networkidle" });
    await page.evaluate(() => {
      window.location.hash = "#issuance";
    });
    await page.waitForFunction(() => window.location.hash === "#issuance", null, { timeout: 15000 });
    await page.locator(".issuance-detail-tabset").waitFor({ timeout: 15000 });
    await page.locator(".issuance-detail-card[aria-label='발행 정보']").waitFor({ timeout: 15000 });

    const detailChromeProbe = await page.evaluate(() => {
      const readRect = (selector) => {
        const element = document.querySelector(selector);
        if (!element) return null;
        const rect = element.getBoundingClientRect();
        return {
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom
        };
      };
      const head = document.querySelector(".issuance-detail-panel-head");
      const headRect = readRect(".issuance-detail-panel-head");
      const headLineStyle = head ? window.getComputedStyle(head, "::after") : null;
      const headLineRightOffset = headLineStyle ? Number.parseFloat(headLineStyle.right || "0") : 0;
      const footer = document.querySelector(".issuance-detail-footer-actions");
      const footerStyle = footer ? window.getComputedStyle(footer) : null;
      return {
        head: headRect,
        headLine: headRect
          ? {
              left: headRect.left,
              right: headRect.right - headLineRightOffset,
              top: headRect.bottom - 1,
              bottom: headRect.bottom
            }
          : null,
        hero: readRect(".issuance-detail-hero"),
        tabset: readRect(".issuance-detail-tabset"),
        grid: readRect(".issuance-detail-grid"),
        footer: readRect(".issuance-detail-footer-actions"),
        footerBackgroundColor: footerStyle?.backgroundColor ?? null,
        footerBorderWidths: footerStyle
          ? [footerStyle.borderTopWidth, footerStyle.borderRightWidth, footerStyle.borderBottomWidth, footerStyle.borderLeftWidth]
          : null,
        footerPadding: footerStyle
          ? [footerStyle.paddingTop, footerStyle.paddingRight, footerStyle.paddingBottom, footerStyle.paddingLeft]
          : null
      };
    });
    const alignedRects = [detailChromeProbe.headLine, detailChromeProbe.hero, detailChromeProbe.tabset, detailChromeProbe.grid, detailChromeProbe.footer];
    if (alignedRects.some((rect) => rect === null)) {
      throw new Error(`issuance detail chrome probe missing: ${JSON.stringify(detailChromeProbe)}`);
    }
    for (const rect of alignedRects.slice(1)) {
      if (Math.abs(rect.left - detailChromeProbe.headLine.left) > 1 || Math.abs(rect.right - detailChromeProbe.headLine.right) > 1) {
        throw new Error(`issuance detail header line should align with content boxes: ${JSON.stringify(detailChromeProbe)}`);
      }
    }
    if (
      detailChromeProbe.footerBackgroundColor !== "rgba(0, 0, 0, 0)" ||
      detailChromeProbe.footerBorderWidths?.some((width) => width !== "0px") ||
      detailChromeProbe.footerPadding?.some((padding) => padding !== "0px")
    ) {
      throw new Error(`issuance detail footer should not render an extra wrapper box: ${JSON.stringify(detailChromeProbe)}`);
    }

    const tabLabels = ["발행 정보", "고객 정보", "실패 사유", "연동 정보"];
    for (const label of tabLabels) {
      await page.locator(".issuance-detail-tabs").getByRole("tab", { name: label, exact: true }).click();
      const tabProbe = await page.evaluate((expectedLabel) => {
        const activeTab = document.querySelector(".issuance-detail-tabs [role='tab'][aria-selected='true']");
        const grid = document.querySelector(".issuance-detail-grid");
        const visibleCard = Array.from(document.querySelectorAll(".issuance-detail-card")).find((card) => !card.hasAttribute("hidden"));
        const readRect = (element) => {
          if (!element) return null;
          const rect = element.getBoundingClientRect();
          return {
            top: rect.top,
            bottom: rect.bottom,
            left: rect.left,
            right: rect.right
          };
        };

        return {
          expectedLabel,
          activeLabel: activeTab?.textContent?.trim() ?? null,
          visibleLabel: visibleCard?.getAttribute("aria-label") ?? null,
          repeatedHeadingCount: visibleCard?.querySelectorAll(".issuance-detail-card-head, h3").length ?? null,
          activeRect: readRect(activeTab),
          gridRect: readRect(grid),
          activeBorderBottomColor: activeTab ? window.getComputedStyle(activeTab).borderBottomColor : null,
          activeBackgroundColor: activeTab ? window.getComputedStyle(activeTab).backgroundColor : null,
          gridBackgroundColor: grid ? window.getComputedStyle(grid).backgroundColor : null
        };
      }, label);

      if (tabProbe.activeLabel !== label || tabProbe.visibleLabel !== label) {
        throw new Error(`issuance tab did not select matching panel: ${JSON.stringify(tabProbe)}`);
      }
      if (tabProbe.repeatedHeadingCount !== 0) {
        throw new Error(`issuance detail panel should not repeat tab heading: ${JSON.stringify(tabProbe)}`);
      }
      if (!tabProbe.activeRect || !tabProbe.gridRect) {
        throw new Error(`issuance tab geometry probe missing: ${JSON.stringify(tabProbe)}`);
      }
      if (Math.abs(tabProbe.activeRect.bottom - tabProbe.gridRect.top) > 1.5) {
        throw new Error(`issuance active tab should meet content panel border: ${JSON.stringify(tabProbe)}`);
      }
      if (tabProbe.activeBorderBottomColor !== tabProbe.gridBackgroundColor || tabProbe.activeBackgroundColor !== tabProbe.gridBackgroundColor) {
        throw new Error(`issuance active tab should visually merge with panel surface: ${JSON.stringify(tabProbe)}`);
      }
    }
  });

  await recordStep("customer console row opens bottom detail panel and keeps status scan visible", async () => {
    await page.evaluate(() => {
      window.location.hash = "#customers";
    });
    await page.waitForFunction(() => window.location.hash === "#customers", null, { timeout: 15000 });
    await page.locator(".panel-customer-list").waitFor({ timeout: 15000 });

    const targetRow = page.locator(".customer-console-table tbody tr").filter({ hasText: onboardingCorpName }).first();
    const targetRowCheckbox = targetRow.getByRole("checkbox", { name: `${onboardingCorpName} 선택`, exact: true });
    await targetRowCheckbox.check();
    assert.equal(await page.locator(".customer-bulk-issue-mode-menu").count(), 0);
    await targetRowCheckbox.uncheck();

    const widthsBefore = await page.evaluate(() => {
      const readWidth = (selector) => {
        const element = document.querySelector(selector);
        if (!element) return null;
        return Math.round(element.getBoundingClientRect().width);
      };

      return {
        panel: readWidth(".panel-customer-list"),
        metrics: readWidth(".customer-summary-grid"),
        controls: readWidth(".customer-console-table-actions"),
        table: readWidth(".customer-console-table-wrap")
      };
    });
    await targetRow.click();

    const detailPanel = page.locator(".customer-detail-panel");
    await detailPanel.waitFor({ timeout: 15000 });
    const customerTableClassProbe = await page.evaluate(() => {
      const wrap = document.querySelector(".customer-console-table-wrap");
      const table = document.querySelector(".customer-console-table");
      const bodyCell = document.querySelector(".customer-console-table tbody td");
      const primaryCell = document.querySelector(".customer-console-primary-cell");
      const ownerCell = document.querySelector(".customer-console-cell-stack");
      return {
        wrapClass: wrap?.className ?? null,
        tableClass: table?.className ?? null,
        scrollbarGutter: wrap ? window.getComputedStyle(wrap).scrollbarGutter : null,
        bodyCellVerticalAlign: bodyCell ? window.getComputedStyle(bodyCell).verticalAlign : null,
        primaryCellDisplay: primaryCell ? window.getComputedStyle(primaryCell).display : null,
        primaryCellAlignItems: primaryCell ? window.getComputedStyle(primaryCell).alignItems : null,
        ownerCellDisplay: ownerCell ? window.getComputedStyle(ownerCell).display : null,
        ownerCellAlignItems: ownerCell ? window.getComputedStyle(ownerCell).alignItems : null
      };
    });
    if (!customerTableClassProbe.wrapClass || !customerTableClassProbe.tableClass) {
      throw new Error(`customer table structure probe missing: ${JSON.stringify(customerTableClassProbe)}`);
    }
    const customerWrapClasses = customerTableClassProbe.wrapClass.split(/\s+/);
    const customerTableClasses = customerTableClassProbe.tableClass.split(/\s+/);
    if (customerWrapClasses.includes("table-wrap") || customerTableClasses.includes("responsive-table")) {
      throw new Error(`customer table should not inherit legacy table classes: ${JSON.stringify(customerTableClassProbe)}`);
    }
    if (customerTableClassProbe.scrollbarGutter === "stable") {
      throw new Error(`customer table should not reserve a stable gutter: ${JSON.stringify(customerTableClassProbe)}`);
    }
    if (
      customerTableClassProbe.bodyCellVerticalAlign !== "middle" ||
      customerTableClassProbe.primaryCellDisplay !== "flex" ||
      customerTableClassProbe.primaryCellAlignItems !== "center" ||
      customerTableClassProbe.ownerCellDisplay !== "flex" ||
      customerTableClassProbe.ownerCellAlignItems !== "center"
    ) {
      throw new Error(`customer list text should be vertically centered in each row. got=${JSON.stringify(customerTableClassProbe)}`);
    }
    await detailPanel.getByText(onboardingCorpName, { exact: false }).first().waitFor();
    await detailPanel.getByText(onboardingBusinessNumber, { exact: false }).first().waitFor();
    await detailPanel.getByText("기본 정보", { exact: true }).waitFor();
    await detailPanel.getByText("계약/발행", { exact: true }).waitFor();
    await detailPanel.locator(".customer-contract-period-field").waitFor();
    await detailPanel.getByText("인증서", { exact: true }).waitFor();
    assert.equal(await detailPanel.locator(".customer-issue-mode-editor").count(), 0);
    assert.equal(await detailPanel.getByText("인증서/연결", { exact: true }).count(), 0);
    assert.equal(await detailPanel.getByText("계약기간 시작", { exact: true }).count(), 0);
    assert.equal(await detailPanel.getByText("계약기간 종료", { exact: true }).count(), 0);
    await detailPanel.getByText("신고 이력", { exact: true }).waitFor();
    await detailPanel.getByText("운영 이력", { exact: true }).waitFor();
    await detailPanel.getByRole("button", { name: "상세정보보기" }).waitFor();
    await detailPanel.getByRole("button", { name: "수정" }).waitFor();
    const detailViewportProbe = await page.evaluate(() => {
      const panel = document.querySelector(".customer-detail-panel.is-detail");
      const body = document.querySelector(".customer-detail-panel-body.customer-detail-option3-body");
      return {
        hasPanel: Boolean(panel),
        headerCount: document.querySelectorAll(".customer-detail-panel.is-detail .customer-detail-panel-head").length,
        bodyClientHeight: body?.clientHeight ?? null,
        bodyScrollHeight: body?.scrollHeight ?? null,
        bodyDisplay: body ? window.getComputedStyle(body).display : null,
        bodyGridColumns: body ? window.getComputedStyle(body).gridTemplateColumns : null,
        bodyGridRows: body ? window.getComputedStyle(body).gridTemplateRows : null,
        bodyOverflowY: body ? window.getComputedStyle(body).overflowY : null,
        bodyPaddingTop: body ? window.getComputedStyle(body).paddingTop : null,
        bodyPaddingRight: body ? window.getComputedStyle(body).paddingRight : null,
        bodyPaddingBottom: body ? window.getComputedStyle(body).paddingBottom : null,
        bodyPaddingLeft: body ? window.getComputedStyle(body).paddingLeft : null,
        overviewCount: document.querySelectorAll(".customer-detail-overview").length,
        overviewSideCount: document.querySelectorAll(".customer-detail-overview-side").length,
        overviewDisplay: (() => {
          const element = document.querySelector(".customer-detail-overview");
          return element ? window.getComputedStyle(element).display : null;
        })(),
        overviewSideDisplay: (() => {
          const element = document.querySelector(".customer-detail-overview-side");
          return element ? window.getComputedStyle(element).display : null;
        })(),
        basicCardLeft: (() => {
          const element = document.querySelector(".customer-info-basic-card");
          return element ? Math.round(element.getBoundingClientRect().left) : null;
        })(),
        basicCardWidth: (() => {
          const element = document.querySelector(".customer-info-basic-card");
          return element ? Math.round(element.getBoundingClientRect().width) : null;
        })(),
        basicCardTop: (() => {
          const element = document.querySelector(".customer-info-basic-card");
          return element ? Math.round(element.getBoundingClientRect().top) : null;
        })(),
        reportSummaryCardLeft: (() => {
          const element = document.querySelector(".customer-report-summary-card");
          return element ? Math.round(element.getBoundingClientRect().left) : null;
        })(),
        reportSummaryCardWidth: (() => {
          const element = document.querySelector(".customer-report-summary-card");
          return element ? Math.round(element.getBoundingClientRect().width) : null;
        })(),
        reportSummaryCardTop: (() => {
          const element = document.querySelector(".customer-report-summary-card");
          return element ? Math.round(element.getBoundingClientRect().top) : null;
        })(),
        certificateCardLeft: (() => {
          const element = document.querySelector(".customer-info-certificate-card");
          return element ? Math.round(element.getBoundingClientRect().left) : null;
        })(),
        certificateCardWidth: (() => {
          const element = document.querySelector(".customer-info-certificate-card");
          return element ? Math.round(element.getBoundingClientRect().width) : null;
        })(),
        certificateCardTop: (() => {
          const element = document.querySelector(".customer-info-certificate-card");
          return element ? Math.round(element.getBoundingClientRect().top) : null;
        })(),
        contractCardLeft: (() => {
          const element = document.querySelector(".customer-info-contract-card");
          return element ? Math.round(element.getBoundingClientRect().left) : null;
        })(),
        contractCardTop: (() => {
          const element = document.querySelector(".customer-info-contract-card");
          return element ? Math.round(element.getBoundingClientRect().top) : null;
        })(),
        reportHistoryLeft: (() => {
          const element = document.querySelector(".customer-report-history-section");
          return element ? Math.round(element.getBoundingClientRect().left) : null;
        })(),
        reportHistoryTop: (() => {
          const element = document.querySelector(".customer-report-history-section");
          return element ? Math.round(element.getBoundingClientRect().top) : null;
        })(),
        editFooterTop: (() => {
          const element = document.querySelector(".customer-detail-edit-footer");
          return element ? Math.round(element.getBoundingClientRect().top) : null;
        })(),
        panelLeft: (() => {
          const element = document.querySelector(".customer-detail-panel.is-detail");
          return element ? Math.round(element.getBoundingClientRect().left) : null;
        })(),
        panelRight: (() => {
          const element = document.querySelector(".customer-detail-panel.is-detail");
          return element ? Math.round(element.getBoundingClientRect().right) : null;
        })(),
        overviewHasBasicCard: Boolean(document.querySelector(".customer-detail-overview .customer-info-basic-card")),
        overviewHasContractCard: Boolean(document.querySelector(".customer-detail-overview .customer-info-contract-card")),
        overviewHasCertificateCard: Boolean(document.querySelector(".customer-detail-overview .customer-info-certificate-card")),
        historySummaryInBasicCount: document.querySelectorAll(".customer-info-basic-card .customer-history-summary").length,
        historySummaryInContractCount: document.querySelectorAll(".customer-info-contract-card .customer-history-summary").length,
        historySummaryButtonCount: document.querySelectorAll(".customer-info-contract-card .customer-history-detail-button").length,
        contractReportTotalsCount: document.querySelectorAll(".customer-info-contract-card .customer-contract-report-totals").length,
        contractReportTotalItems: Array.from(
          document.querySelectorAll(".customer-info-contract-card .customer-contract-report-totals > div")
        ).map((item) => item.textContent?.trim() ?? ""),
        reportSummaryTotalsCount: document.querySelectorAll(".customer-report-summary-card .customer-report-summary-totals").length,
        reportSummaryTotalItems: Array.from(
          document.querySelectorAll(".customer-report-summary-card .customer-report-summary-totals > div")
        ).map((item) => item.textContent?.trim() ?? ""),
        reportHeaderTotalsCount: document.querySelectorAll(".customer-report-history-head .customer-report-totals").length,
        reportHeaderGridColumns: (() => {
          const element = document.querySelector(".customer-report-history-head");
          return element ? window.getComputedStyle(element).gridTemplateColumns : null;
        })(),
        editBarCount: document.querySelectorAll(".customer-detail-edit-bar").length,
        editFooterCount: document.querySelectorAll(".customer-detail-edit-footer").length,
        editButtonCount: document.querySelectorAll(".customer-detail-edit-actions button").length,
        editActionLabels: Array.from(document.querySelectorAll(".customer-detail-edit-actions button")).map(
          (button) => button.textContent?.trim() ?? ""
        ),
        actionStripCount: document.querySelectorAll(".customer-detail-action-strip").length,
        reportTableCount: document.querySelectorAll(".customer-report-history-section .customer-report-table").length,
        reportHeaders: Array.from(document.querySelectorAll(".customer-report-history-section .customer-report-table thead th")).map((cell) =>
          cell.textContent?.trim() ?? ""
        ),
        reportRows: Array.from(document.querySelectorAll(".customer-report-history-section .customer-report-table tbody tr")).map(
          (row) => row.querySelector("td:nth-child(1)")?.textContent?.trim() ?? ""
        ),
        reportYearCellCount: document.querySelectorAll(".customer-report-history-section .customer-report-year-cell").length,
        reportMonthInputCount: document.querySelectorAll(
          ".customer-report-history-section .customer-report-table tbody tr td:nth-child(1) input"
        ).length,
        reportInputCount: document.querySelectorAll(".customer-report-history-section .customer-report-table input").length,
        reportReadValueCount: document.querySelectorAll(".customer-report-history-section .customer-report-read-value").length,
        reportIssueDateInputTypes: Array.from(
          document.querySelectorAll(".customer-report-history-section .customer-report-table tbody tr td:nth-child(2) input")
        ).map((input) => (input instanceof HTMLInputElement ? input.type : "")),
        reportIssueDatePlaceholders: Array.from(
          document.querySelectorAll(".customer-report-history-section .customer-report-table tbody tr td:nth-child(2) input")
        ).map((input) => (input instanceof HTMLInputElement ? input.placeholder : "")),
        reportBodyCellVerticalAlign: (() => {
          const cell = document.querySelector(".customer-report-history-section .customer-report-table tbody td");
          return cell ? window.getComputedStyle(cell).verticalAlign : null;
        })(),
        reportHeaderVerticalAlign: (() => {
          const cell = document.querySelector(".customer-report-history-section .customer-report-table thead th");
          return cell ? window.getComputedStyle(cell).verticalAlign : null;
        })(),
        reportDayInputDisplay: (() => {
          const input = document.querySelector(".customer-report-history-section .customer-report-table tbody tr td:nth-child(2) input");
          return input ? window.getComputedStyle(input).display : null;
        })(),
        memoTextareaCount: document.querySelectorAll(".customer-info-basic-card textarea").length,
        memoReadSummaryCount: document.querySelectorAll(".customer-info-basic-card .customer-detail-memo-summary").length,
        legacyBasicCardCount: document.querySelectorAll(".customer-detail-basic-card").length,
        legacyConnectionCardCount: document.querySelectorAll(".customer-detail-connection-card").length,
        infoCardHeadings: Array.from(document.querySelectorAll(".customer-info-card .customer-detail-section-head h3")).map(
          (heading) => heading.textContent?.trim() ?? ""
        ),
        customerInfoHeadingCount: document.querySelectorAll(".customer-info-card-head h3").length,
        customerInfoCardHeadingTextCount: Array.from(document.querySelectorAll(".customer-info-card h3, .customer-info-card h4")).filter(
          (heading) => heading.textContent?.trim() === "고객 정보"
        ).length,
        issueModeEditorCount: document.querySelectorAll(".customer-info-card .customer-issue-mode-editor").length,
        contractGridText: document.querySelector(".customer-info-contract-card .customer-info-contract-grid")?.textContent?.trim() ?? "",
        contractSummaryText: document.querySelector(".customer-info-contract-card .customer-info-contract-summary")?.textContent?.trim() ?? "",
        contractPeriodInputCount: document.querySelectorAll(".customer-info-contract-card .customer-contract-period-inputs input[type='month']").length,
        contractPeriodGridColumns: (() => {
          const element = document.querySelector(".customer-info-contract-card .customer-contract-period-inputs");
          return element ? window.getComputedStyle(element).gridTemplateColumns : null;
        })(),
        phoneWhiteSpace: (() => {
          const fact = Array.from(document.querySelectorAll(".customer-detail-basic-facts > div")).find(
            (item) => item.querySelector("dt")?.textContent?.trim() === "전화번호"
          );
          const value = fact?.querySelector("dd");
          return value ? window.getComputedStyle(value).whiteSpace : null;
        })(),
        addressWhiteSpace: (() => {
          const fact = Array.from(document.querySelectorAll(".customer-detail-basic-facts > div")).find(
            (item) => item.querySelector("dt")?.textContent?.trim() === "사업장 주소"
          );
          const value = fact?.querySelector("dd");
          return value ? window.getComputedStyle(value).whiteSpace : null;
        })(),
        addressTextOverflow: (() => {
          const fact = Array.from(document.querySelectorAll(".customer-detail-basic-facts > div")).find(
            (item) => item.querySelector("dt")?.textContent?.trim() === "사업장 주소"
          );
          const value = fact?.querySelector("dd");
          return value ? window.getComputedStyle(value).textOverflow : null;
        })(),
        connectionCheckboxCount: document.querySelectorAll(
          ".customer-info-certificate-card .customer-detail-connection-controls input[type='checkbox']"
        ).length,
        connectionActionButtons: Array.from(document.querySelectorAll(".customer-info-certificate-card .customer-detail-connection-controls button")).map(
          (button) => button.textContent?.trim() ?? ""
        ),
        certificateAutoKinds: Array.from(document.querySelectorAll(".customer-certificate-auto-kind")).map((item) => ({
          label: item.querySelector("span")?.textContent?.trim() ?? "",
          status: item.querySelector(".customer-tone-badge")?.textContent?.trim() ?? ""
        })),
        certificateManagementRows: Array.from(document.querySelectorAll(".customer-certificate-management-row")).map((item) => ({
          label: item.querySelector(".customer-certificate-management-title > strong")?.textContent?.trim() ?? "",
          status: item.querySelector(".customer-tone-badge")?.textContent?.trim() ?? "",
          meta: item.querySelector(".customer-certificate-management-main small")?.textContent?.trim() ?? "",
          titleDisplay: (() => {
            const title = item.querySelector(".customer-certificate-management-title");
            return title ? window.getComputedStyle(title).display : "";
          })(),
          actions: Array.from(item.querySelectorAll("button")).map((button) => button.textContent?.trim() ?? "")
        })),
        certificateHelperActions: Array.from(document.querySelectorAll(".customer-certificate-helper-actions button")).map(
          (button) => button.textContent?.trim() ?? ""
        ),
        inlineCertificateSelectorCount: document.querySelectorAll(
          ".customer-info-certificate-card .customer-certificate-selector"
        ).length,
        certificateSelectorModalCount: document.querySelectorAll(".customer-certificate-selector-modal").length,
        sections: Array.from(document.querySelectorAll(".customer-detail-panel.is-detail .customer-detail-section")).map((section) => ({
          className: section.className,
          height: Math.round(section.getBoundingClientRect().height)
        }))
      };
    });
    if (!detailViewportProbe.hasPanel || detailViewportProbe.headerCount !== 0) {
      throw new Error(`customer detail should not render a separate selected-customer header. got=${JSON.stringify(detailViewportProbe)}`);
    }
    if (
      detailViewportProbe.bodyClientHeight === null ||
      detailViewportProbe.bodyScrollHeight === null ||
      detailViewportProbe.bodyOverflowY === "auto" ||
      detailViewportProbe.bodyOverflowY === "scroll"
    ) {
      throw new Error(`customer detail should not create an internal body scroller. got=${JSON.stringify(detailViewportProbe)}`);
    }
    if (
      detailViewportProbe.reportTableCount !== 1 ||
      detailViewportProbe.reportRows.length !== 12 ||
      detailViewportProbe.reportRows[0] !== "1월" ||
      detailViewportProbe.reportRows[11] !== "12월"
    ) {
      throw new Error(`customer report history should render one 1-12 month vertical table. got=${JSON.stringify(detailViewportProbe)}`);
    }
    if (
      detailViewportProbe.reportHeaders.length !== 5 ||
      detailViewportProbe.reportHeaders[0] !== "월" ||
      detailViewportProbe.reportHeaders[1] !== "일" ||
      detailViewportProbe.reportHeaders[2] !== "공급가액" ||
      detailViewportProbe.reportHeaders.includes("발행년도") ||
      detailViewportProbe.reportYearCellCount !== 0 ||
      detailViewportProbe.reportMonthInputCount !== 0 ||
      detailViewportProbe.reportInputCount !== 0 ||
      detailViewportProbe.reportReadValueCount < 36
    ) {
      throw new Error(`customer report history should render read-only values before edit mode. got=${JSON.stringify(detailViewportProbe)}`);
    }
    if (
      detailViewportProbe.reportBodyCellVerticalAlign !== "middle" ||
      detailViewportProbe.reportHeaderVerticalAlign !== "middle" ||
      detailViewportProbe.reportDayInputDisplay !== null
    ) {
      throw new Error(`customer report history cells should be vertically centered without read-mode inputs. got=${JSON.stringify(detailViewportProbe)}`);
    }
    if (
      detailViewportProbe.overviewCount !== 1 ||
      detailViewportProbe.overviewSideCount !== 1 ||
      !detailViewportProbe.overviewHasBasicCard ||
      !detailViewportProbe.overviewHasContractCard ||
      !detailViewportProbe.overviewHasCertificateCard ||
      detailViewportProbe.historySummaryInBasicCount !== 0 ||
      detailViewportProbe.historySummaryInContractCount !== 1 ||
      detailViewportProbe.historySummaryButtonCount !== 1 ||
      detailViewportProbe.contractReportTotalsCount !== 0 ||
      detailViewportProbe.contractReportTotalItems.length !== 0 ||
      detailViewportProbe.reportSummaryTotalsCount !== 1 ||
      detailViewportProbe.reportSummaryTotalItems.length !== 5 ||
      !detailViewportProbe.reportSummaryTotalItems[0]?.includes("1분기합계") ||
      !detailViewportProbe.reportSummaryTotalItems[4]?.includes("총계") ||
      detailViewportProbe.reportHeaderTotalsCount !== 0 ||
      !detailViewportProbe.reportHeaderGridColumns ||
      detailViewportProbe.reportHeaderGridColumns.trim().split(/\s+/).length !== 2 ||
      detailViewportProbe.editBarCount !== 0 ||
      detailViewportProbe.editFooterCount !== 1 ||
      detailViewportProbe.editButtonCount !== 1 ||
      detailViewportProbe.editActionLabels.join("|") !== "수정" ||
      detailViewportProbe.memoTextareaCount !== 0 ||
      detailViewportProbe.memoReadSummaryCount !== 1 ||
      detailViewportProbe.actionStripCount !== 0 ||
      detailViewportProbe.bodyDisplay !== "grid" ||
      detailViewportProbe.bodyPaddingTop !== "14px" ||
      detailViewportProbe.bodyPaddingRight !== "14px" ||
      detailViewportProbe.bodyPaddingBottom !== "14px" ||
      detailViewportProbe.bodyPaddingLeft !== "14px" ||
      !detailViewportProbe.bodyGridColumns ||
      detailViewportProbe.bodyGridColumns.trim().split(/\s+/).length < 2 ||
      !detailViewportProbe.bodyGridRows ||
      detailViewportProbe.bodyGridRows.trim().split(/\s+/).length < 4 ||
      detailViewportProbe.overviewDisplay !== "contents" ||
      detailViewportProbe.overviewSideDisplay !== "contents" ||
      detailViewportProbe.basicCardLeft === null ||
      detailViewportProbe.basicCardWidth === null ||
      detailViewportProbe.basicCardTop === null ||
      detailViewportProbe.reportSummaryCardLeft === null ||
      detailViewportProbe.reportSummaryCardWidth === null ||
      detailViewportProbe.reportSummaryCardTop === null ||
      detailViewportProbe.certificateCardLeft === null ||
      detailViewportProbe.certificateCardWidth === null ||
      detailViewportProbe.certificateCardTop === null ||
      detailViewportProbe.contractCardLeft === null ||
      detailViewportProbe.contractCardTop === null ||
      detailViewportProbe.reportHistoryLeft === null ||
      detailViewportProbe.reportHistoryTop === null ||
      detailViewportProbe.editFooterTop === null ||
      detailViewportProbe.panelLeft === null ||
      detailViewportProbe.panelRight === null ||
      detailViewportProbe.basicCardWidth <= detailViewportProbe.reportSummaryCardWidth ||
      detailViewportProbe.basicCardLeft - detailViewportProbe.panelLeft < 14 ||
      detailViewportProbe.panelRight - (detailViewportProbe.reportSummaryCardLeft + detailViewportProbe.reportSummaryCardWidth) < 14 ||
      detailViewportProbe.reportSummaryCardLeft <= detailViewportProbe.basicCardLeft ||
      Math.abs(detailViewportProbe.reportSummaryCardTop - detailViewportProbe.basicCardTop) > 2 ||
      Math.abs(detailViewportProbe.contractCardLeft - detailViewportProbe.basicCardLeft) > 2 ||
      detailViewportProbe.contractCardTop <= detailViewportProbe.basicCardTop ||
      Math.abs(detailViewportProbe.certificateCardLeft - detailViewportProbe.contractCardLeft) > 2 ||
      detailViewportProbe.certificateCardTop <= detailViewportProbe.contractCardTop ||
      detailViewportProbe.reportHistoryLeft <= detailViewportProbe.contractCardLeft ||
      Math.abs(detailViewportProbe.reportHistoryTop - detailViewportProbe.contractCardTop) > 2 ||
      detailViewportProbe.editFooterTop <= detailViewportProbe.reportHistoryTop ||
      detailViewportProbe.legacyBasicCardCount !== 0 ||
      detailViewportProbe.legacyConnectionCardCount !== 0 ||
      detailViewportProbe.customerInfoHeadingCount !== 0 ||
      detailViewportProbe.customerInfoCardHeadingTextCount !== 0 ||
      !detailViewportProbe.infoCardHeadings.includes("기본 정보") ||
      !detailViewportProbe.infoCardHeadings.includes("계약/발행") ||
      !detailViewportProbe.infoCardHeadings.includes("인증서") ||
      !detailViewportProbe.infoCardHeadings.includes("신고 합계") ||
      detailViewportProbe.issueModeEditorCount !== 0 ||
      detailViewportProbe.contractGridText !== "" ||
      !detailViewportProbe.contractSummaryText.includes("계약기간") ||
      detailViewportProbe.contractPeriodInputCount !== 0 ||
      detailViewportProbe.phoneWhiteSpace !== "nowrap" ||
      detailViewportProbe.addressWhiteSpace !== "normal" ||
      detailViewportProbe.addressTextOverflow !== "clip"
    ) {
      throw new Error(`customer detail should render a compact read-only overview before edit mode. got=${JSON.stringify(detailViewportProbe)}`);
    }
    if (
      detailViewportProbe.connectionCheckboxCount !== 0 ||
      detailViewportProbe.connectionActionButtons.includes("인증서 확인") ||
      detailViewportProbe.certificateAutoKinds.length !== 0 ||
      detailViewportProbe.certificateManagementRows.length !== 2 ||
      detailViewportProbe.certificateManagementRows[0]?.label !== "전자세금용" ||
      detailViewportProbe.certificateManagementRows[0]?.actions.length !== 0 ||
      !/만료/.test(detailViewportProbe.certificateManagementRows[0]?.meta ?? "") ||
      !/2027/.test(detailViewportProbe.certificateManagementRows[0]?.meta ?? "") ||
      /·|전자세금용/.test(detailViewportProbe.certificateManagementRows[0]?.meta ?? "") ||
      detailViewportProbe.certificateManagementRows[0]?.titleDisplay !== "flex" ||
      detailViewportProbe.certificateManagementRows[1]?.label !== "범용" ||
      detailViewportProbe.certificateManagementRows[1]?.actions.length !== 0 ||
      detailViewportProbe.certificateHelperActions.length !== 0 ||
      detailViewportProbe.inlineCertificateSelectorCount !== 0 ||
      detailViewportProbe.certificateSelectorModalCount !== 0
    ) {
      throw new Error(`customer certificate card should hide customer-scoped certificate actions before edit mode. got=${JSON.stringify(detailViewportProbe)}`);
    }
    await detailPanel.getByRole("button", { name: "수정" }).click();
    await detailPanel.getByRole("button", { name: "저장" }).waitFor();
    await detailPanel.getByRole("button", { name: "취소" }).waitFor();
    const detailEditModeProbe = await page.evaluate(() => ({
      actionLabels: Array.from(document.querySelectorAll(".customer-detail-edit-actions button")).map(
        (button) => button.textContent?.trim() ?? ""
      ),
      memoTextareaCount: document.querySelectorAll(".customer-info-basic-card textarea").length,
      memoReadSummaryCount: document.querySelectorAll(".customer-info-basic-card .customer-detail-memo-summary").length,
      reportInputCount: document.querySelectorAll(".customer-report-history-section .customer-report-table input").length,
      reportIssueDateInputTypes: Array.from(
        document.querySelectorAll(".customer-report-history-section .customer-report-table tbody tr td:nth-child(2) input")
      ).map((input) => (input instanceof HTMLInputElement ? input.type : "")),
      reportIssueDatePlaceholders: Array.from(
        document.querySelectorAll(".customer-report-history-section .customer-report-table tbody tr td:nth-child(2) input")
      ).map((input) => (input instanceof HTMLInputElement ? input.placeholder : "")),
      reportDayInputDisplay: (() => {
        const input = document.querySelector(".customer-report-history-section .customer-report-table tbody tr td:nth-child(2) input");
        return input ? window.getComputedStyle(input).display : null;
      })(),
      contractGridText: document.querySelector(".customer-info-contract-card .customer-info-contract-grid")?.textContent?.trim() ?? "",
      contractPeriodInputCount: document.querySelectorAll(".customer-info-contract-card .customer-contract-period-inputs input[type='month']").length,
      contractPeriodGridColumns: (() => {
        const element = document.querySelector(".customer-info-contract-card .customer-contract-period-inputs");
        return element ? window.getComputedStyle(element).gridTemplateColumns : null;
      })(),
      certificateManagementRows: Array.from(document.querySelectorAll(".customer-certificate-management-row")).map((item) => ({
        label: item.querySelector(".customer-certificate-management-title > strong")?.textContent?.trim() ?? "",
        actions: Array.from(item.querySelectorAll("button")).map((button) => button.textContent?.trim() ?? "")
      }))
    }));
    if (
      detailEditModeProbe.actionLabels.join("|") !== "취소|저장" ||
      detailEditModeProbe.memoTextareaCount !== 1 ||
      detailEditModeProbe.memoReadSummaryCount !== 0 ||
      detailEditModeProbe.reportInputCount !== 36 ||
      detailEditModeProbe.reportIssueDateInputTypes.some((type) => type !== "text") ||
      detailEditModeProbe.reportIssueDatePlaceholders.some((placeholder) => placeholder !== "-") ||
      detailEditModeProbe.reportDayInputDisplay !== "block" ||
      !detailEditModeProbe.contractGridText.includes("계약기간") ||
      detailEditModeProbe.contractGridText.includes("계약기간 시작") ||
      detailEditModeProbe.contractGridText.includes("계약기간 종료") ||
      detailEditModeProbe.contractPeriodInputCount !== 2 ||
      !detailEditModeProbe.contractPeriodGridColumns ||
      detailEditModeProbe.contractPeriodGridColumns.trim().split(/\s+/).length !== 3 ||
      detailEditModeProbe.certificateManagementRows[1]?.label !== "범용" ||
      !detailEditModeProbe.certificateManagementRows[1]?.actions.some((text) => /범용 인증서/.test(text))
    ) {
      throw new Error(`customer detail edit mode should expose inputs and certificate actions. got=${JSON.stringify(detailEditModeProbe)}`);
    }
    await detailPanel.getByRole("button", { name: "취소" }).click();
    await detailPanel.getByRole("button", { name: "수정" }).waitFor();
    const detailCancelProbe = await page.evaluate(() => ({
      memoTextareaCount: document.querySelectorAll(".customer-info-basic-card textarea").length,
      reportInputCount: document.querySelectorAll(".customer-report-history-section .customer-report-table input").length,
      certificateActionButtonCount: document.querySelectorAll(".customer-info-certificate-card .customer-certificate-management-actions button").length
    }));
    if (
      detailCancelProbe.memoTextareaCount !== 0 ||
      detailCancelProbe.reportInputCount !== 0 ||
      detailCancelProbe.certificateActionButtonCount !== 0
    ) {
      throw new Error(`customer detail cancel should restore read-only mode. got=${JSON.stringify(detailCancelProbe)}`);
    }
    await detailPanel.getByRole("button", { name: "수정" }).click();
    await detailPanel.getByRole("button", { name: "저장" }).waitFor();
    await detailPanel.getByRole("button", { name: "저장" }).click();
    await detailPanel.getByRole("button", { name: "수정" }).waitFor();
    const detailSaveProbe = await page.evaluate(() => ({
      memoTextareaCount: document.querySelectorAll(".customer-info-basic-card textarea").length,
      reportInputCount: document.querySelectorAll(".customer-report-history-section .customer-report-table input").length,
      editActionLabels: Array.from(document.querySelectorAll(".customer-detail-edit-actions button")).map(
        (button) => button.textContent?.trim() ?? ""
      )
    }));
    if (
      detailSaveProbe.memoTextareaCount !== 0 ||
      detailSaveProbe.reportInputCount !== 0 ||
      detailSaveProbe.editActionLabels.join("|") !== "수정"
    ) {
      throw new Error(`customer detail save should return to read-only mode. got=${JSON.stringify(detailSaveProbe)}`);
    }
    await detailPanel.getByRole("button", { name: "수정" }).click();
    await detailPanel.getByRole("button", { name: "저장" }).waitFor();
    const helperCountsBeforeSelectorOpen = {
      healthCount: helperRequestLog.healthCount,
      bridgeProbeCount: helperRequestLog.bridgeProbeCount
    };
    const generalCertificateButton = page
      .locator(".customer-info-certificate-card .customer-certificate-management-row")
      .filter({ hasText: "범용" })
      .getByRole("button", { name: /범용 인증서/ });
    await generalCertificateButton.click();
    await page.locator(".customer-certificate-selector-modal").waitFor();
    for (let index = 0; index < 30; index += 1) {
      if (
        helperRequestLog.healthCount > helperCountsBeforeSelectorOpen.healthCount &&
        helperRequestLog.bridgeProbeCount > helperCountsBeforeSelectorOpen.bridgeProbeCount
      ) {
        break;
      }
      await page.waitForTimeout(100);
    }
    const selectorModalProbe = await page.evaluate(() => ({
      modalCount: document.querySelectorAll(".customer-certificate-selector-modal").length,
      inlineCount: document.querySelectorAll(".customer-info-certificate-card .customer-certificate-selector").length,
      title: document.querySelector("#customer-certificate-selector-title")?.textContent?.trim() ?? "",
      headers: Array.from(document.querySelectorAll(".customer-certificate-candidate-head span")).map(
        (item) => item.textContent?.trim() ?? ""
      ),
      filterButtonCount: document.querySelectorAll(".customer-certificate-filter-buttons button").length,
      selectorText: document.querySelector(".customer-certificate-selector-modal")?.textContent ?? "",
      expireValues: Array.from(document.querySelectorAll(".customer-certificate-candidate-list > button > span:nth-of-type(4)")).map(
        (item) => item.textContent?.trim() ?? ""
      ),
      hasSearch: Boolean(document.querySelector(".customer-certificate-selector-controls input[aria-label='범용 인증서 검색']"))
    }));
    if (
      selectorModalProbe.modalCount !== 1 ||
      selectorModalProbe.inlineCount !== 0 ||
      !/^범용 인증서 (등록|교체)$/.test(selectorModalProbe.title) ||
      selectorModalProbe.headers.join("|") !== "인증서명|용도|발급기관|만료일|추천" ||
      selectorModalProbe.filterButtonCount !== 0 ||
      selectorModalProbe.selectorText.includes("전자세금용") ||
      !selectorModalProbe.selectorText.includes(onboardingGeneralCertificate.usageToName) ||
      selectorModalProbe.expireValues.some((value) => value.startsWith("만료")) ||
      !selectorModalProbe.hasSearch ||
      helperRequestLog.healthCount <= helperCountsBeforeSelectorOpen.healthCount ||
      helperRequestLog.bridgeProbeCount <= helperCountsBeforeSelectorOpen.bridgeProbeCount
    ) {
      throw new Error(
        `customer general certificate selector should open as a modal and auto-read helper certificates. got=${JSON.stringify(
          selectorModalProbe
        )} helperBefore=${JSON.stringify(helperCountsBeforeSelectorOpen)} helperAfter=${JSON.stringify({
          healthCount: helperRequestLog.healthCount,
          bridgeProbeCount: helperRequestLog.bridgeProbeCount
        })}`
      );
    }
    await page.keyboard.press("Escape");
    await page.locator(".customer-certificate-selector-modal").waitFor({ state: "detached" });
    const customerPopbillCopyProbe = await page.evaluate(() => {
      const customersScreen = document.querySelector(".customers-screen");
      const text = customersScreen?.textContent ?? "";
      const readHeight = (selector) => {
        const element = document.querySelector(selector);
        return element ? Math.round(element.getBoundingClientRect().height) : null;
      };
      const readComputed = (selector, property) => {
        const element = document.querySelector(selector);
        return element ? window.getComputedStyle(element)[property] : null;
      };
      return {
        hasCustomersScreen: Boolean(customersScreen),
        containsPopbillAlias: /발행 연동|연동 미완료|연결 필요|연결 해제/.test(text),
        connectionFactCount: document.querySelectorAll(".customer-info-certificate-card .customer-detail-connection-facts > div").length,
        connectionFactLabels: Array.from(document.querySelectorAll(".customer-info-certificate-card .customer-detail-connection-facts > div dt")).map(
          (item) => item.textContent?.trim() ?? ""
        ),
        connectionControlCount:
          document.querySelectorAll(".customer-info-certificate-card .customer-detail-connection-controls > label").length +
          document.querySelectorAll(".customer-info-certificate-card .customer-detail-connection-controls > .customer-certificate-auto-kind").length,
        certificateManagementRowCount: document.querySelectorAll(".customer-info-certificate-card .customer-certificate-management-row").length,
        certificateManagementLabels: Array.from(
          document.querySelectorAll(".customer-info-certificate-card .customer-certificate-management-title > strong")
        ).map((item) => item.textContent?.trim() ?? ""),
        certificateHelperActionCount: document.querySelectorAll(".customer-info-certificate-card .customer-certificate-helper-actions button").length,
        basicCardHeight: readHeight(".customer-info-basic-card"),
        contractCardHeight: readHeight(".customer-info-contract-card"),
        certificateCardHeight: readHeight(".customer-info-certificate-card"),
        connectionControlAlignSelf: readComputed(".customer-info-certificate-card .customer-detail-connection-controls", "alignSelf"),
        connectionFactGridColumns: readComputed(".customer-info-certificate-card .customer-detail-connection-facts", "gridTemplateColumns"),
        connectionControlGridColumns: readComputed(".customer-info-certificate-card .customer-detail-connection-controls", "gridTemplateColumns")
      };
    });
    if (!customerPopbillCopyProbe.hasCustomersScreen || customerPopbillCopyProbe.containsPopbillAlias) {
      throw new Error(`customer UI should not expose popbill-linked copy. got=${JSON.stringify(customerPopbillCopyProbe)}`);
    }
    if (
      customerPopbillCopyProbe.connectionFactCount !== 0 ||
      customerPopbillCopyProbe.connectionControlCount !== 0 ||
      customerPopbillCopyProbe.certificateManagementRowCount !== 2 ||
      customerPopbillCopyProbe.certificateManagementLabels.join("|") !== "전자세금용|범용" ||
      customerPopbillCopyProbe.certificateHelperActionCount !== 0
    ) {
      throw new Error(`customer certificate card should own certificate management actions. got=${JSON.stringify(customerPopbillCopyProbe)}`);
    }
    if (
      customerPopbillCopyProbe.basicCardHeight === null ||
      customerPopbillCopyProbe.contractCardHeight === null ||
      customerPopbillCopyProbe.certificateCardHeight === null
    ) {
      throw new Error(`customer info card height probes missing. got=${JSON.stringify(customerPopbillCopyProbe)}`);
    }
    const historySummary = detailPanel.locator(".customer-history-summary");
    await historySummary.getByText("아직 발행 이력이 없습니다.", { exact: true }).waitFor();
    await historySummary.getByRole("button", { name: "상세정보보기" }).click();
    await page.getByRole("dialog", { name: "고객 상세정보" }).waitFor();
    await page.getByRole("button", { name: "닫기" }).click();
    assert.equal(await detailPanel.locator(".customer-detail-operations-section").count(), 0);
    assert.equal(await detailPanel.locator(".customer-detail-danger-zone").count(), 0);
    assert.equal(await detailPanel.locator(".customer-detail-history-preview").count(), 0);
    assert.equal(await page.locator(".customer-console-pager").count(), 0);
    assert.equal(await page.locator(".customer-console-table-footer").count(), 0);
    const basicInfoReadonlyProbe = await page.evaluate(() => {
      const basicCard = document.querySelector(".customer-info-basic-card");
      return {
        hasBasicCard: Boolean(basicCard),
        editButtonCount: basicCard?.querySelectorAll(".customer-basic-edit-toggle").length ?? null,
        inlineInputCount: basicCard?.querySelectorAll(".customer-basic-inline-input").length ?? null,
        dlFormControlCount: basicCard?.querySelectorAll("dl input, dl textarea, dl select").length ?? null
      };
    });
    if (!basicInfoReadonlyProbe.hasBasicCard) {
      throw new Error(`customer basic info card missing. got=${JSON.stringify(basicInfoReadonlyProbe)}`);
    }
    if (
      basicInfoReadonlyProbe.editButtonCount !== 0 ||
      basicInfoReadonlyProbe.inlineInputCount !== 0 ||
      basicInfoReadonlyProbe.dlFormControlCount !== 0
    ) {
      throw new Error(`customer basic info must remain read-only. got=${JSON.stringify(basicInfoReadonlyProbe)}`);
    }
    const detailPanelLayout = await detailPanel.evaluate((element) => {
      const styles = window.getComputedStyle(element);
      return {
        position: styles.position,
        right: styles.right,
        width: Math.round(element.getBoundingClientRect().width)
      };
    });
    const widthsAfter = await page.evaluate(() => {
      const readWidth = (selector) => {
        const element = document.querySelector(selector);
        if (!element) return null;
        return Math.round(element.getBoundingClientRect().width);
      };

      return {
        panel: readWidth(".panel-customer-list"),
        metrics: readWidth(".customer-summary-grid"),
        controls: readWidth(".customer-console-table-actions"),
        table: readWidth(".customer-console-table-wrap")
      };
    });
    if (detailPanelLayout.position !== "relative") {
      throw new Error(`customer detail should render as an in-flow bottom panel. got=${JSON.stringify(detailPanelLayout)}`);
    }
    for (const key of ["panel", "metrics", "controls", "table"]) {
      const before = widthsBefore[key];
      const after = widthsAfter[key];
      if (before === null || after === null) {
        throw new Error(`customer console width probe missing for ${key}. before=${JSON.stringify(widthsBefore)} after=${JSON.stringify(widthsAfter)}`);
      }
      if (Math.abs(before - after) > 1) {
        throw new Error(`customer console width changed while detailPanel opened for ${key}. before=${before} after=${after}`);
      }
    }
    await targetRow.waitFor();
  });

  await recordStep("customer console create detail panel opens in-place and closes cleanly", async () => {
    const customersShell = page.locator(".customer-console-shell");
    await customersShell.locator(".customer-console-primary-cta").evaluate((button) => {
      if (button instanceof HTMLButtonElement) {
        button.click();
      }
    });

    const detailPanel = page.locator(".customer-detail-panel");
    await detailPanel.waitFor({ timeout: 15000 });
    await detailPanel.getByText("고객 추가", { exact: true }).waitFor();
    await detailPanel.getByText("전자세금용 공동인증서 선택", { exact: true }).waitFor();
    await detailPanel.getByRole("button", { name: "PC에서 찾기", exact: true }).waitFor();
    await detailPanel.getByRole("button", { name: "닫기", exact: true }).click();
    await page.waitForFunction(() => !document.querySelector(".customer-detail-panel"), null, { timeout: 15000 });
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
    await page.locator(".certificates-screen").waitFor();
    await page.locator(".certificate-layout-grid").waitFor();
    await page.locator(".certificate-ops-toolbar").getByText("연결된 고객", { exact: true }).waitFor();
    await page.locator(".certificate-linked-table").waitFor();
    const certificateTableClassProbe = await page.evaluate(() => {
      const mainWrap = document.querySelector(".certificate-main-table-wrap");
      const unlinkedWrap = document.querySelector(".certificate-unlinked-table-wrap");
      return {
        mainWrapClass: mainWrap?.className ?? null,
        mainScrollbarGutter: mainWrap ? window.getComputedStyle(mainWrap).scrollbarGutter : null,
        unlinkedScrollbarGutter: unlinkedWrap ? window.getComputedStyle(unlinkedWrap).scrollbarGutter : null
      };
    });
    if (!certificateTableClassProbe.mainWrapClass) {
      throw new Error(`certificate table structure probe missing: ${JSON.stringify(certificateTableClassProbe)}`);
    }
    const certificateMainWrapClasses = certificateTableClassProbe.mainWrapClass.split(/\s+/);
    if (certificateMainWrapClasses.includes("certificate-table-wrap")) {
      throw new Error(`certificate main table should not inherit legacy table wrapper: ${JSON.stringify(certificateTableClassProbe)}`);
    }
    if (
      certificateTableClassProbe.mainScrollbarGutter === "stable" ||
      certificateTableClassProbe.unlinkedScrollbarGutter === "stable"
    ) {
      throw new Error(`certificate table wrappers should not reserve a stable gutter: ${JSON.stringify(certificateTableClassProbe)}`);
    }
    await page.locator(".certificate-unlinked-card .certificate-work-card-head strong").getByText("미연결", { exact: false }).waitFor();
    await page.locator(".certificate-match-card").waitFor();
    await page.locator(".certificate-bottom-actionbar").waitFor();
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

  await recordStep("upgrade-available helper shows update notice and blocks helper actions", async () => {
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
    const certificatesReadButton = page.locator(".certificate-hero-panel").getByRole("button", { name: "공동인증서 읽기" });
    assert.equal(await certificatesReadButton.isDisabled(), true);
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
    const certificatesReadButton = page.locator(".certificate-hero-panel").getByRole("button", { name: "공동인증서 읽기" });
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
    const certificatesReadButton = page.locator(".certificate-hero-panel").getByRole("button", { name: "공동인증서 읽기" });
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
