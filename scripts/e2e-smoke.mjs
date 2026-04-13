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
  preflightRequests: []
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
    version: "e2e-fake-helper",
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
          version: "e2e-fake-helper",
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
          version: "e2e-fake-helper",
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
  const navButton = (label) => page.locator(".nav-list .nav-button").filter({ hasText: label });
  await mockLocalHelperRoutes(page);

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
    await navButton("오늘 작업").waitFor();
  });

  await recordStep("prepare onboarding settings up to helper step", async () => {
    await configureOnboardingSettings();
    await page.goto(`${baseUrl}/?e2e-onboarding=${suffix}#onboarding`, { waitUntil: "networkidle" });
    const onboardingScreen = page.locator(".onboarding-screen");
    await onboardingScreen.waitFor();
    await onboardingScreen.locator(".onboarding-wizard-copy strong").filter({ hasText: "로컬 헬퍼 준비" }).waitFor();
    await page.getByRole("button", { name: "공동인증서 읽기", exact: true }).waitFor();
  });

  await recordStep("onboarding helper step reads local certificates", async () => {
    const helperReadButton = page.getByRole("button", { name: "공동인증서 읽기", exact: true });
    await helperReadButton.waitFor({ timeout: 15000 });
    await Promise.all([
      page.waitForResponse(
        (response) => response.url().startsWith(`${localRenewalHelperUrl}/api/bridge-probe`) && response.status() === 200,
        { timeout: 15000 }
      ),
      helperReadButton.click()
    ]);

    await page.getByText("공동인증서 읽기까지 완료했습니다.", { exact: false }).waitFor();
    await page.getByText("읽은 공동인증서", { exact: false }).waitFor();
    await page.locator(".onboarding-wizard-copy strong").filter({ hasText: "고객 초기 등록" }).waitFor();
    const onboardingPanel = page.locator(".panel-initial-onboarding");
    await onboardingPanel.waitFor();
    await onboardingPanel.getByRole("button", { name: "양식 다운로드", exact: true }).waitFor();
  });

  await recordStep("onboarding download shifts step 4 CTA to upload", async () => {
    const onboardingPanel = page.locator(".panel-initial-onboarding");
    const primaryButton = onboardingPanel.getByRole("button", { name: "양식 다운로드", exact: true });
    await primaryButton.waitFor({ timeout: 15000 });
    const [download] = await Promise.all([page.waitForEvent("download"), primaryButton.click()]);
    await download.path();
    await page.getByText("양식을 다운로드했습니다.", { exact: false }).waitFor({ timeout: 15000 });
    await onboardingPanel.getByRole("button", { name: "작성한 양식 업로드", exact: true }).waitFor({ timeout: 15000 });
    await onboardingPanel.getByText("지금은 작성한 양식을 업로드할 차례입니다.", { exact: false }).waitFor();
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
      await onboardingPanel.getByText("지금은 고객 등록 반영 버튼을 누를 차례입니다.", { exact: false }).waitFor();
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
      page.waitForResponse((response) => response.url().endsWith("/api/customer-onboarding/commit") && response.status() === 200),
      onboardingPanel.getByRole("button", { name: "고객 등록 반영", exact: true }).click()
    ]);

    await page
      .getByText("범용 공동인증서 자동 연결 · 성공 1건 / 건너뜀 0건", { exact: false })
      .waitFor();
    await page.getByText(/가져오기 완료 · 신규 1건 \/ 갱신 0건 \/ 인증서 1건/).waitFor();

    if (helperRequestLog.bridgeProbeCount < 2) {
      throw new Error(`expected at least 2 bridge probes, got ${helperRequestLog.bridgeProbeCount}`);
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

  await recordStep("onboarding-created customer visible after tab round-trip", async () => {
    await page.goto(`${baseUrl}/#customers`, { waitUntil: "networkidle" });
    await page.locator(".customer-summary").filter({ hasText: onboardingCorpName }).first().waitFor();
  });

  await recordStep("settings member management flow", async () => {
    await page.goto(`${baseUrl}/#settings`, { waitUntil: "networkidle" });
    await page.locator(".settings-step-card").filter({ hasText: "계정 보안" }).click();
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
    await page.goto(`${baseUrl}/#certificates`, { waitUntil: "networkidle" });
    await page.getByText("전자세금용·범용·미연결 공동인증서를 보고 조치가 필요한 고객부터 해결합니다.", { exact: true }).waitFor();
    await page.getByText(/조치 필요 고객 \d+명/).waitFor();
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
