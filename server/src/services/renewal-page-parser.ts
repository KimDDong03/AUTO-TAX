import type {
  RenewalBridgePreflightProbe,
  RenewalInfoSnapshot,
  RenewalPreflightComparisonProfile,
  RenewalPreflightSubmissionProfile
} from "../domain.js";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractInputValueById(html: string, id: string): string | null {
  const escapedId = escapeRegExp(id);
  const patterns = [
    new RegExp(`<input[^>]*id=["']${escapedId}["'][^>]*value=["']([^"']*)["']`, "i"),
    new RegExp(`<input[^>]*value=["']([^"']*)["'][^>]*id=["']${escapedId}["']`, "i")
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }

  return null;
}

function extractFormBlocks(html: string): Array<{ attrs: string; inner: string }> {
  return [...html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)].map((match) => ({
    attrs: match[1] ?? "",
    inner: match[2] ?? ""
  }));
}

function extractFormBlock(html: string, id: string): string | null {
  const escapedId = escapeRegExp(id);
  const match = html.match(new RegExp(`<form[^>]*id=["']${escapedId}["'][^>]*>[\\s\\S]*?<\\/form>`, "i"));
  return match?.[0] ?? null;
}

function extractFormAction(html: string, id: string, pageUrl: string): string | null {
  const escapedId = escapeRegExp(id);
  const match = html.match(new RegExp(`<form[^>]*id=["']${escapedId}["'][^>]*action\\s*=\\s*["']([^"']+)["']`, "i"));
  return match?.[1] ? new URL(match[1], pageUrl).toString() : null;
}

function extractAttr(source: string, name: string): string | null {
  const match = source.match(new RegExp(`\\b${escapeRegExp(name)}=["']([^"']*)["']`, "i"));
  return match?.[1] ?? null;
}

function parseFormInputs(formHtml: string): Array<{ name: string; value: string }> {
  const values: Array<{ name: string; value: string }> = [];

  for (const match of formHtml.matchAll(/<(input|select|textarea)\b([^>]*)>(?:([\s\S]*?)<\/\1>)?/gi)) {
    const tag = match[1]?.toLowerCase() ?? "";
    const attrs = match[2] ?? "";
    const name = extractAttr(attrs, "name")?.trim();
    if (!name || /\bdisabled\b/i.test(attrs)) {
      continue;
    }

    if (tag === "input") {
      const type = (extractAttr(attrs, "type") ?? "text").toLowerCase();
      if ((type === "radio" || type === "checkbox") && !/\bchecked\b/i.test(attrs)) {
        continue;
      }
      values.push({ name, value: extractAttr(attrs, "value") ?? "" });
      continue;
    }

    if (tag === "textarea") {
      values.push({ name, value: match[3] ?? "" });
      continue;
    }

    const selectedOption = [...(match[3] ?? "").matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/gi)].find((option) =>
      /\bselected\b/i.test(option[1] ?? "")
    );
    values.push({
      name,
      value: (selectedOption ? extractAttr(selectedOption[1] ?? "", "value") : null) ?? selectedOption?.[2] ?? ""
    });
  }

  return values;
}

function extractInputNames(html: string): string[] {
  const names = new Set<string>();
  for (const match of html.matchAll(/<input\b[^>]*name=["']([^"']+)["'][^>]*>/gi)) {
    const name = match[1]?.trim();
    if (name) {
      names.add(name);
    }
  }
  return [...names];
}

function extractCheckedRadioValueInBlock(html: string): string | null {
  const patterns = [
    /<input\b[^>]*type=["']radio["'][^>]*checked[^>]*value=["']([^"']*)["']/i,
    /<input\b[^>]*type=["']radio["'][^>]*value=["']([^"']*)["'][^>]*checked/i
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1] !== undefined) {
      return match[1];
    }
  }

  return null;
}

function extractMustHaveFieldNames(html: string): string[] {
  const names = new Set<string>();
  for (const match of html.matchAll(/<input\b[^>]*>/gi)) {
    const tag = match[0];
    if (!/\bmustHave\b/i.test(tag)) {
      continue;
    }
    const nameMatch = tag.match(/\bname=["']([^"']+)["']/i);
    const name = nameMatch?.[1]?.trim();
    if (name) {
      names.add(name);
    }
  }
  return [...names];
}

function mergeFormValues(items: Array<{ name: string; value: string }>): Record<string, string> {
  const merged: Record<string, string> = {};

  for (const item of items) {
    if (item.name in merged) {
      merged[item.name] += item.value;
      continue;
    }
    merged[item.name] = item.value;
  }

  return merged;
}

function decodeHtmlText(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeAmountText(value: string): string {
  return value.replace(/^=\s*/, "").trim();
}

function trimToNull(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? null : trimmed;
}

function normalizeVisibleValue(value: string | null | undefined): string | null {
  const trimmed = trimToNull(value);
  if (!trimmed) {
    return null;
  }

  return /[0-9A-Za-z가-힣]/.test(trimmed) ? trimmed : null;
}

function digitsOnly(value: string | null | undefined): string {
  return String(value ?? "").replace(/\D/g, "");
}

function normalizePhoneLikeValue(value: string | null | undefined): string | null {
  const normalized = normalizeVisibleValue(value);
  if (!normalized) {
    return null;
  }

  return digitsOnly(normalized).length >= 7 ? normalized : null;
}

function normalizeTextForCompare(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/\s+/g, "")
    .trim()
    .toLowerCase();
}

function normalizeAddressForCompare(value: string | null | undefined): string {
  return normalizeTextForCompare(value)
    .replace(/(\d+)-0\b/g, "$1")
    .replace(/[(),.-]/g, "");
}

function parseFormValueMap(formHtml: string): Record<string, string> {
  return mergeFormValues(parseFormInputs(formHtml));
}

function parseRenewInfoProductDetailMap(html: string): Record<string, string> {
  const match =
    html.match(/prodDetailJSON\s*=\s*(\[[\s\S]*?\])\s*\[0\]\s*;/i) ??
    html.match(/prodDetailJSON\s*=\s*(\{[\s\S]*?\})\s*;/i);
  const payload = match?.[1]?.trim();
  if (!payload) {
    return {};
  }

  try {
    const parsed = JSON.parse(payload) as unknown;
    const source =
      Array.isArray(parsed) ? (parsed[0] as Record<string, unknown> | undefined) : (parsed as Record<string, unknown>);
    if (!source || typeof source !== "object") {
      return {};
    }

    return Object.fromEntries(
      Object.entries(source)
        .filter((entry): entry is [string, string | number] => typeof entry[1] === "string" || typeof entry[1] === "number")
        .map(([key, value]) => [key, String(value)])
    );
  } catch {
    return {};
  }
}

function normalizeSnapshotSource(source: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(source)
      .filter((entry): entry is [string, string | number] => typeof entry[1] === "string" || typeof entry[1] === "number")
      .map(([key, value]) => [key, String(value)])
  );
}

function buildRenewInfoSnapshot(
  companyValues: Record<string, string>,
  infoValues: Record<string, string>,
  productValues: Record<string, string>
): RenewalInfoSnapshot {
  return {
    companyName: trimToNull(companyValues.ordrrEntprsNm) ?? trimToNull(productValues.ordrrEntprsNm),
    businessNumber: normalizeVisibleValue(companyValues.secOrdrrBizrno) ?? normalizeVisibleValue(productValues.secOrdrrBizrno),
    ceoName: trimToNull(infoValues.ordEntprsRprsntvNm) ?? trimToNull(productValues.ordEntprsRprsntvNm),
    bizType: trimToNull(infoValues.ordEntprsBizcnd) ?? trimToNull(productValues.ordEntprsBizcnd),
    bizClass: trimToNull(infoValues.ordEntprsIndstr) ?? trimToNull(productValues.ordEntprsIndstr),
    businessFieldCode: trimToNull(infoValues.ordEntprsBsnsRelmCd) ?? trimToNull(productValues.ordEntprsBsnsRelmCd),
    postalCode: trimToNull(infoValues.ordrrZip) ?? trimToNull(productValues.ordrrZip),
    baseAddress: trimToNull(infoValues.ordrrBassAddr) ?? trimToNull(productValues.ordrrBassAddr),
    detailAddress: trimToNull(infoValues.ordrrDtlAddr) ?? trimToNull(productValues.ordrrDtlAddr),
    contactName: trimToNull(infoValues.ordEntprsChargrNm) ?? trimToNull(productValues.ordEntprsChargrNm),
    contactDepartment: trimToNull(infoValues.ordEntprsChargrDeptNm) ?? trimToNull(productValues.ordEntprsChargrDeptNm),
    contactEmail: buildRenewInfoEmail(infoValues) ?? trimToNull(productValues.ordEntprsChargrEmail),
    contactTel: normalizePhoneLikeValue(
      joinSegmentedValue(infoValues, ["ordEntprsChargrTel", "ordEntprsChargrTel1", "ordEntprsChargrTel2"]) ??
        productValues.ordEntprsChargrTel
    ),
    contactFax: normalizePhoneLikeValue(
      joinSegmentedValue(infoValues, ["ordEntprsChargrFax", "ordEntprsChargrFax1", "ordEntprsChargrFax2"]) ??
        productValues.ordEntprsChargrFax
    ),
    contactMobile: normalizePhoneLikeValue(
      joinSegmentedValue(infoValues, ["ordEntprsChargrHpno", "ordEntprsChargrHpno1", "ordEntprsChargrHpno2"]) ??
        productValues.ordEntprsChargrHpno
    )
  };
}

function joinSegmentedValue(values: Record<string, string>, names: string[], separator = "-"): string | null {
  const parts = names.map((name) => trimToNull(values[name])).filter((value): value is string => value !== null);
  return parts.length > 0 ? normalizeVisibleValue(parts.join(separator)) : null;
}

function buildRenewInfoEmail(values: Record<string, string>): string | null {
  const combined = trimToNull(values.ordEntprsChargrEmail);
  if (combined) {
    return combined;
  }

  const local = trimToNull(values.ordEntprsChargrEmail1);
  const domain = trimToNull(values.ordEntprsChargrEmail3);
  return local && domain ? `${local}@${domain}` : null;
}

function normalizeSubmitPathKind(
  submitUrl: string | null
): RenewalBridgePreflightProbe["renewInfoSubmitPathKind"] {
  if (!submitUrl) {
    return null;
  }

  if (submitUrl.includes("/apply/")) {
    return "apply";
  }
  if (submitUrl.includes("/renew/")) {
    return "renew";
  }
  return "unknown";
}

function extractPageTitle(html: string): string | null {
  return (
    html.match(/document\.title\s*=\s*"([^"]+)"/i)?.[1]?.trim() ||
    html.match(/<title>([^<]+)<\/title>/i)?.[1]?.trim() ||
    null
  );
}

function splitEmailAddress(value: string): { local: string; domain: string } | null {
  const trimmed = value.trim();
  if (!trimmed.includes("@")) {
    return null;
  }

  const [local, domain] = trimmed.split("@");
  if (!local || !domain) {
    return null;
  }

  return { local, domain };
}

function normalizePhoneValue(value: string): string {
  return value.replace(/[^\d-]/g, "").trim();
}

function splitPhoneNumber(value: string): string[] {
  const digits = value.replace(/\D/g, "");
  if (!digits) {
    return [];
  }

  if (digits.startsWith("02")) {
    if (digits.length === 9) {
      return ["02", digits.slice(2, 5), digits.slice(5)];
    }
    if (digits.length >= 10) {
      return ["02", digits.slice(2, 6), digits.slice(6, 10)];
    }
  }

  if (digits.startsWith("0504") && digits.length >= 11) {
    return ["0504", digits.slice(4, 7), digits.slice(7, 11)];
  }

  if (digits.length >= 11) {
    return [digits.slice(0, 3), digits.slice(3, 7), digits.slice(7, 11)];
  }

  if (digits.length === 10) {
    return [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6, 10)];
  }

  if (digits.length === 8) {
    return [digits.slice(0, 4), digits.slice(4)];
  }

  return [digits];
}

function setIfPresent(values: Record<string, string>, name: string, value: string): void {
  if (!(name in values)) {
    return;
  }

  values[name] = value;
}

function hasAnyVisibleValue(values: Record<string, string>, names: string[]): boolean {
  return names.some((name) => trimToNull(values[name]) !== null);
}

function setPhoneValue(values: Record<string, string>, baseName: string, value: string): void {
  const normalized = normalizePhoneValue(value);
  if (!normalized) {
    return;
  }

  const segments = splitPhoneNumber(normalized);
  const hasSplitFields = [`${baseName}1`, `${baseName}2`, `${baseName}3`].some((name) => name in values);

  if (hasSplitFields) {
    setIfPresent(values, baseName, segments[0] ?? "");
    setIfPresent(values, `${baseName}1`, segments[1] ?? "");
    setIfPresent(values, `${baseName}2`, segments[2] ?? "");
    setIfPresent(values, `${baseName}3`, segments[3] ?? "");
    return;
  }

  setIfPresent(values, baseName, normalized);
}

function fillBlankPhoneValue(values: Record<string, string>, baseName: string, value: string | null): void {
  if (!value) {
    return;
  }
  if (hasAnyVisibleValue(values, [baseName, `${baseName}1`, `${baseName}2`, `${baseName}3`])) {
    return;
  }

  setPhoneValue(values, baseName, value);
}

function setEmailValue(values: Record<string, string>, baseName: string, value: string): void {
  const trimmed = value.trim();
  if (!trimmed) {
    return;
  }

  const hasSplitFields = [`${baseName}1`, `${baseName}2`, `${baseName}3`].some((name) => name in values);
  const emailParts = splitEmailAddress(trimmed);
  if (hasSplitFields && emailParts) {
    setIfPresent(values, `${baseName}1`, emailParts.local);
    setIfPresent(values, `${baseName}2`, "@");
    setIfPresent(values, `${baseName}3`, emailParts.domain);
    return;
  }

  setIfPresent(values, baseName, trimmed);
}

function fillBlankEmailValue(values: Record<string, string>, baseName: string, value: string | null): void {
  if (!value) {
    return;
  }
  if (hasAnyVisibleValue(values, [baseName, `${baseName}1`, `${baseName}2`, `${baseName}3`])) {
    return;
  }

  setEmailValue(values, baseName, value);
}

function applyRenewInfoSubmissionOverrides(
  values: Record<string, string>,
  profile: RenewalPreflightSubmissionProfile
): void {
  setIfPresent(values, "ordPw", profile.issuePassword.trim());
  setIfPresent(values, "ordEntprsChargrNm", profile.contactName.trim());
  setIfPresent(values, "ordEntprsChargrDeptNm", profile.contactDepartment.trim());

  const email = profile.contactEmail.trim();
  if (email) {
    setEmailValue(values, "ordEntprsChargrEmail", email);
  }

  setPhoneValue(values, "ordEntprsChargrTel", profile.contactTel);
  setPhoneValue(values, "ordEntprsChargrFax", profile.contactFax);
  setPhoneValue(values, "ordEntprsChargrHpno", profile.contactMobile);
}

function fillBlankRenewInfoValue(values: Record<string, string>, name: string, fallback: string | null): void {
  if (!(name in values)) {
    return;
  }
  if (trimToNull(values[name]) !== null) {
    return;
  }
  if (fallback === null) {
    return;
  }

  values[name] = fallback;
}

function extractValidatedSectionForms(html: string): Array<{ attrs: string; inner: string }> {
  return extractFormBlocks(html)
    .filter((form) => {
      const sectionType = extractAttr(form.attrs, "data-sectionType");
      return extractAttr(form.attrs, "data-kica-validateCandi") === "true" || sectionType === "aply";
    })
    .reverse();
}

function extractRadioGroupDefaultValues(formHtml: string): Record<string, string> {
  const groups = new Map<string, Array<{ value: string; checked: boolean; required: boolean }>>();

  for (const match of formHtml.matchAll(/<input\b([^>]*)>/gi)) {
    const attrs = match[1] ?? "";
    const type = (extractAttr(attrs, "type") ?? "text").toLowerCase();
    if (type !== "radio") {
      continue;
    }

    const name = extractAttr(attrs, "name")?.trim();
    if (!name) {
      continue;
    }

    const options = groups.get(name) ?? [];
    options.push({
      value: extractAttr(attrs, "value") ?? "",
      checked: /\bchecked\b/i.test(attrs),
      required: /\bkica_forceToSelect_method\b/i.test(attrs) || /\bneedyn=["']?Y["']?/i.test(attrs)
    });
    groups.set(name, options);
  }

  const defaults: Record<string, string> = {};
  for (const [name, options] of groups.entries()) {
    if (options.every((option) => option.value.trim() === "")) {
      continue;
    }

    const checked = options.find((option) => option.checked);
    if (checked) {
      defaults[name] = checked.value;
      continue;
    }

    const required = options.some((option) => option.required);
    defaults[name] =
      (required ? options.find((option) => option.value === "Y") : options.find((option) => option.value === "N"))?.value ??
      options.find((option) => option.value === "Y")?.value ??
      options[0]?.value ??
      "";
  }

  return defaults;
}

function buildRenewInfoAgreementSectionValues(formHtml: string): Record<string, string> {
  const values = mergeFormValues(parseFormInputs(formHtml));
  Object.assign(values, extractRadioGroupDefaultValues(formHtml));

  if ("advrEmail" in values && trimToNull(values.advrEmail) === null) {
    values.advrEmail = "N";
  }
  if ("advrHp" in values && trimToNull(values.advrHp) === null) {
    values.advrHp = "N";
  }

  return values;
}

function buildRenewInfoApplySectionValues(
  html: string,
  profile: RenewalPreflightSubmissionProfile
): Record<string, string> {
  const infoForm = extractFormBlock(html, "aplyInfForm") ?? "";
  const values = mergeFormValues(parseFormInputs(infoForm));
  const snapshot = parseRenewInfoSnapshot(html).renewInfoSnapshot;
  const productValues = parseRenewInfoProductDetailMap(html);

  fillBlankRenewInfoValue(values, "ordEntprsBizcnd", snapshot?.bizType ?? null);
  fillBlankRenewInfoValue(values, "ordEntprsIndstr", snapshot?.bizClass ?? null);
  fillBlankRenewInfoValue(values, "ordEntprsBsnsRelmCd", snapshot?.businessFieldCode ?? null);
  fillBlankRenewInfoValue(values, "ordEntprsRprsntvNm", snapshot?.ceoName ?? null);
  fillBlankRenewInfoValue(values, "ordrrZip", snapshot?.postalCode ?? null);
  fillBlankRenewInfoValue(values, "ordrrBassAddr", snapshot?.baseAddress ?? null);
  fillBlankRenewInfoValue(
    values,
    "ordrrDtlAddr",
    snapshot?.detailAddress ?? (snapshot?.baseAddress ? "상세주소 없음" : null)
  );
  fillBlankRenewInfoValue(values, "ordEntprsChargrNm", snapshot?.contactName ?? null);
  fillBlankRenewInfoValue(values, "ordEntprsChargrDeptNm", snapshot?.contactDepartment ?? null);
  fillBlankRenewInfoValue(values, "certUsePurps", trimToNull(productValues.certUsePurps));
  fillBlankPhoneValue(values, "ordEntprsChargrTel", snapshot?.contactTel ?? null);
  fillBlankPhoneValue(values, "ordEntprsChargrFax", snapshot?.contactFax ?? null);
  fillBlankPhoneValue(values, "ordEntprsChargrHpno", snapshot?.contactMobile ?? null);
  fillBlankEmailValue(values, "ordEntprsChargrEmail", snapshot?.contactEmail ?? null);

  applyRenewInfoSubmissionOverrides(values, profile);
  return values;
}

export function parseRenewInfoFlow(
  html: string,
  pageUrl: string
): Pick<
  RenewalBridgePreflightProbe,
  | "renewInfoPageTitle"
  | "renewInfoSubmitUrl"
  | "renewInfoSubmitPathKind"
  | "renewInfoFormFieldNames"
  | "renewInfoMustHaveFieldNames"
  | "renewInfoFinalNum"
> {
  const infoForm = extractFormBlock(html, "aplyInfForm") ?? "";
  const submitForm = extractFormBlock(html, "applyForm") ?? "";
  const submitUrl = extractFormAction(html, "applyForm", pageUrl);
  const pageTitle = extractPageTitle(html);

  return {
    renewInfoPageTitle: pageTitle,
    renewInfoSubmitUrl: submitUrl,
    renewInfoSubmitPathKind: normalizeSubmitPathKind(submitUrl),
    renewInfoFormFieldNames: extractInputNames(infoForm),
    renewInfoMustHaveFieldNames: extractMustHaveFieldNames(submitForm),
    renewInfoFinalNum: extractInputValueById(submitForm, "finalNum")
  };
}

export function parseRenewInfoSnapshot(
  html: string
): Pick<RenewalBridgePreflightProbe, "renewInfoSnapshot"> {
  const companyInfoForm = extractFormBlocks(html).find((form) => /\bname=["']disableWhenPrePro["']/i.test(form.attrs));
  const infoForm = extractFormBlock(html, "aplyInfForm") ?? "";
  const companyValues = companyInfoForm ? parseFormValueMap(`<form${companyInfoForm.attrs}>${companyInfoForm.inner}</form>`) : {};
  const infoValues = parseFormValueMap(infoForm);
  const productValues = parseRenewInfoProductDetailMap(html);
  const snapshot = buildRenewInfoSnapshot(companyValues, infoValues, productValues);

  return {
    renewInfoSnapshot: Object.values(snapshot).some((value) => value !== null) ? snapshot : null
  };
}

export function parseRenewInfoSnapshotFromData(
  source: Record<string, unknown>
): Pick<RenewalBridgePreflightProbe, "renewInfoSnapshot"> {
  const normalizedSource = normalizeSnapshotSource(source);
  const snapshot = buildRenewInfoSnapshot({}, normalizedSource, normalizedSource);

  return {
    renewInfoSnapshot: Object.values(snapshot).some((value) => value !== null) ? snapshot : null
  };
}

export function buildRenewInfoComparison(
  snapshot: RenewalInfoSnapshot | null,
  profile: RenewalPreflightComparisonProfile | null
): Pick<
  RenewalBridgePreflightProbe,
  "renewInfoBlockingMismatchFields" | "renewInfoAutoSubmitReady" | "renewInfoAutoSubmitSummary"
> {
  if (!profile) {
    return {
      renewInfoBlockingMismatchFields: [],
      renewInfoAutoSubmitReady: null,
      renewInfoAutoSubmitSummary: null
    };
  }

  if (!snapshot) {
    return {
      renewInfoBlockingMismatchFields: [],
      renewInfoAutoSubmitReady: null,
      renewInfoAutoSubmitSummary: "비교 보류 · renew-info 기본값 미노출"
    };
  }

  const mismatchLabels: string[] = [];
  const missingLabels: string[] = [];
  const candidates: Array<{
    label: string;
    actual: string | null;
    expected: string | null;
    normalize: (value: string | null | undefined) => string;
  }> = [
    { label: "업체명", actual: snapshot.companyName, expected: profile.corpName, normalize: normalizeTextForCompare },
    { label: "사업자등록번호", actual: snapshot.businessNumber, expected: profile.businessNumber, normalize: digitsOnly },
    { label: "대표자명", actual: snapshot.ceoName, expected: profile.ceoName, normalize: normalizeTextForCompare },
    { label: "사업장주소", actual: snapshot.baseAddress, expected: profile.addr, normalize: normalizeAddressForCompare }
  ];

  for (const candidate of candidates) {
    const actual = candidate.normalize(candidate.actual);
    const expected = candidate.normalize(candidate.expected);
    if (!actual) {
      missingLabels.push(candidate.label);
      continue;
    }
    if (!expected) {
      continue;
    }
    if (actual !== expected) {
      mismatchLabels.push(candidate.label);
    }
  }

  if (mismatchLabels.length > 0) {
    return {
      renewInfoBlockingMismatchFields: mismatchLabels,
      renewInfoAutoSubmitReady: false,
      renewInfoAutoSubmitSummary: `자동 제출 차단 · ${mismatchLabels.join(", ")} 불일치`
    };
  }

  if (missingLabels.length > 0) {
    return {
      renewInfoBlockingMismatchFields: [],
      renewInfoAutoSubmitReady: null,
      renewInfoAutoSubmitSummary: "비교 보류 · renew-info 기본값 미노출"
    };
  }

  return {
    renewInfoBlockingMismatchFields: [],
    renewInfoAutoSubmitReady: true,
    renewInfoAutoSubmitSummary: "고객 기본정보 일치"
  };
}

export function buildEffectiveRenewInfoSubmissionProfile(
  snapshot: RenewalInfoSnapshot | null,
  profile: RenewalPreflightSubmissionProfile | null
): RenewalPreflightSubmissionProfile | null {
  if (!snapshot && !profile) {
    return null;
  }

  return {
    contactName: trimToNull(snapshot?.contactName) ?? profile?.contactName ?? "",
    contactDepartment: trimToNull(snapshot?.contactDepartment) ?? profile?.contactDepartment ?? "",
    contactEmail: trimToNull(snapshot?.contactEmail) ?? profile?.contactEmail ?? "",
    contactTel: trimToNull(snapshot?.contactTel) ?? profile?.contactTel ?? "",
    contactFax: trimToNull(snapshot?.contactFax) ?? profile?.contactFax ?? "",
    contactMobile: trimToNull(snapshot?.contactMobile) ?? profile?.contactMobile ?? "",
    issuePassword: profile?.issuePassword ?? ""
  };
}

export function buildRenewInfoSubmitProfileReadiness(
  formFieldNames: string[],
  profile: RenewalPreflightSubmissionProfile | null
): Pick<
  RenewalBridgePreflightProbe,
  "renewInfoSubmitMissingFields" | "renewInfoSubmitReady" | "renewInfoSubmitSummary"
> {
  if (!profile) {
    return {
      renewInfoSubmitMissingFields: [],
      renewInfoSubmitReady: null,
      renewInfoSubmitSummary: null
    };
  }

  const fieldSpecs = [
    {
      names: ["ordPw"],
      label: "발급용 임시번호",
      value: profile.issuePassword
    },
    {
      names: ["ordEntprsChargrNm"],
      label: "담당자명",
      value: profile.contactName
    },
    {
      names: ["ordEntprsChargrDeptNm"],
      label: "담당부서",
      value: profile.contactDepartment
    },
    {
      names: ["ordEntprsChargrEmail", "ordEntprsChargrEmail1", "ordEntprsChargrEmail3"],
      label: "이메일",
      value: profile.contactEmail
    },
    {
      names: ["ordEntprsChargrTel", "ordEntprsChargrTel1", "ordEntprsChargrTel2", "ordEntprsChargrTel3"],
      label: "전화번호",
      value: profile.contactTel
    },
    {
      names: ["ordEntprsChargrFax", "ordEntprsChargrFax1", "ordEntprsChargrFax2", "ordEntprsChargrFax3"],
      label: "팩스번호",
      value: profile.contactFax
    },
    {
      names: ["ordEntprsChargrHpno", "ordEntprsChargrHpno1", "ordEntprsChargrHpno2", "ordEntprsChargrHpno3"],
      label: "휴대폰 번호",
      value: profile.contactMobile
    }
  ];

  const missingLabels = fieldSpecs
    .filter((fieldSpec) => fieldSpec.names.some((name) => formFieldNames.includes(name)))
    .filter((fieldSpec) => trimToNull(fieldSpec.value) === null)
    .map((fieldSpec) => fieldSpec.label);

  if (missingLabels.length > 0) {
    return {
      renewInfoSubmitMissingFields: missingLabels,
      renewInfoSubmitReady: false,
      renewInfoSubmitSummary: `자동 제출 차단 · ${missingLabels.join(", ")} 미입력`
    };
  }

  return {
    renewInfoSubmitMissingFields: [],
    renewInfoSubmitReady: true,
    renewInfoSubmitSummary: "자동 제출 입력값 준비 완료"
  };
}

export function buildRenewInfoSubmitRequest(
  html: string,
  pageUrl: string,
  profile: RenewalPreflightSubmissionProfile
): Array<[string, string]> {
  const submitForm = extractFormBlock(html, "applyForm") ?? "";
  void pageUrl;
  const pairs = parseFormInputs(submitForm).map((item) => [item.name, item.value] as [string, string]);
  const sectionCounts = new Map<string, number>();

  for (const form of extractValidatedSectionForms(html)) {
    const sectionType = extractAttr(form.attrs, "data-sectionType")?.trim();
    if (!sectionType) {
      continue;
    }

    const formHtml = `<form${form.attrs}>${form.inner}</form>`;
    const values =
      sectionType === "aply"
        ? buildRenewInfoApplySectionValues(html, profile)
        : sectionType === "agre"
          ? buildRenewInfoAgreementSectionValues(formHtml)
          : mergeFormValues(parseFormInputs(formHtml));

    pairs.push([sectionType, JSON.stringify(values)]);
    const nextCount = (sectionCounts.get(sectionType) ?? 0) + 1;
    sectionCounts.set(sectionType, nextCount);
    if (nextCount <= 1) {
      pairs.push([sectionType, ""]);
    }
  }

  return pairs;
}

export function parseRenewInfoSubmitResult(
  html: string,
  pageUrl: string
): Pick<
  RenewalBridgePreflightProbe,
  | "renewInfoSubmitAttempted"
  | "renewInfoSubmitResultBranch"
  | "renewInfoSubmitResultUrl"
  | "renewInfoSubmitResultPageTitle"
  | "renewInfoSubmitResultSummary"
  | "renewInfoSubmitResultError"
> {
  const pageTitle = extractPageTitle(html);
  const applyFormAction = extractFormAction(html, "applyForm", pageUrl);
  const resultUrl = applyFormAction ?? pageUrl;
  const normalized = `${pageTitle ?? ""}\n${html}`;

  let branch: RenewalBridgePreflightProbe["renewInfoSubmitResultBranch"] = "unknown";
  if (/stepEntrpsPasswordCnfirm\.sg/i.test(normalized) || /비밀번호/i.test(normalized)) {
    branch = "password-confirm";
  } else if (/stepEntrpsRenewPayment(?:Confirm)?\.sg/i.test(normalized) || /결제/i.test(normalized)) {
    branch = "renew-payment";
  } else if (/stepEntrpsApplyInfoInput\.sg/i.test(normalized) || /갱신정보\s*입력/i.test(normalized)) {
    branch = "renew-info";
  }

  const resultSummary =
    branch === "renew-payment"
      ? "신청정보 제출 성공 · 결제 단계 진입"
      : branch === "password-confirm"
        ? "신청정보 제출 성공 · 발급 직전 단계 진입"
        : branch === "renew-info"
          ? "신청정보 제출 후 입력 단계 유지"
          : "신청정보 제출 결과 해석 보류";

  return {
    renewInfoSubmitAttempted: true,
    renewInfoSubmitResultBranch: branch,
    renewInfoSubmitResultUrl: resultUrl,
    renewInfoSubmitResultPageTitle: pageTitle,
    renewInfoSubmitResultSummary: resultSummary,
    renewInfoSubmitResultError: null
  };
}

export function buildRenewInfoPaymentPreviewRequest(
  html: string,
  pageUrl: string
): Array<[string, string]> {
  const forms = extractFormBlocks(html);
  const prodPayloads = forms
    .filter((form) => extractAttr(form.attrs, "data-sectionType") === "prod")
    .map((form) => ({
      name: "prodKey",
      value: JSON.stringify(mergeFormValues(parseFormInputs(`<form${form.attrs}>${form.inner}</form>`)))
    }));

  const requestPairs: Array<[string, string]> = (prodPayloads.length === 1 ? [...prodPayloads, ...prodPayloads] : [...prodPayloads]).map(
    (item) => [item.name, item.value]
  );
  const payInfoForm = extractFormBlock(html, "payInfForm") ?? "";
  const pprsSection = html.match(/<div[^>]*id=["']pprsPrsntnSection["'][\s\S]*?<\/div>/i)?.[0] ?? "";
  const applyForm = extractFormBlock(html, "applyForm") ?? "";

  requestPairs.push([
    "serialNo",
    decodeHtmlText(payInfoForm.match(/<h3[^>]*class=["'][^"']*typ2[^"']*["'][^>]*>\s*<strong>([^<]*)<\/strong>/i)?.[1] ?? "")
  ]);
  requestPairs.push([
    "certJobPrgrsSeCd",
    pageUrl.includes("/renew/") ? "RENW" : "APLY"
  ]);

  const pprsRecptMthdCd = extractCheckedRadioValueInBlock(pprsSection);
  if (pprsRecptMthdCd) {
    requestPairs.push(["pprsRecptMthdCd", pprsRecptMthdCd]);
  }

  requestPairs.push(...parseFormInputs(applyForm).map((item) => [item.name, item.value] as [string, string]));
  return requestPairs;
}

export function parseRenewInfoPaymentPreview(
  html: string
): Pick<
  RenewalBridgePreflightProbe,
  | "renewInfoPaymentPreviewLoaded"
  | "renewInfoPaymentPreviewItems"
  | "renewInfoPaymentPreviewTotalAmount"
  | "renewInfoPaymentPreviewHasAdditionalAgreement"
> {
  const itemRows = [...html.matchAll(/<tr\b[^>]*>\s*<th[^>]*>([\s\S]*?)<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>\s*<strong>([\s\S]*?)<\/strong>\s*<\/td>\s*<\/tr>/gi)];
  const items = itemRows
    .map((match) => [
      decodeHtmlText(match[1] ?? ""),
      decodeHtmlText(match[2] ?? ""),
      normalizeAmountText(decodeHtmlText(match[3] ?? ""))
    ])
    .filter((parts) => parts.every((part) => part !== ""))
    .map((parts) => `${parts[0]} / ${parts[1]} / ${parts[2]}`);
  const totalAmount = normalizeVisibleValue(
    normalizeAmountText(
      decodeHtmlText(
        html.match(/<dl[^>]*class=["'][^"']*total-price[^"']*["'][^>]*>[\s\S]*?<dd[^>]*>([\s\S]*?)<\/dd>/i)?.[1] ?? ""
      )
    )
  );
  const hasAdditionalAgreement = /추가\s*약관|별도\s*약관|개인정보\s*수집/i.test(html);

  return {
    renewInfoPaymentPreviewLoaded: items.length > 0 || totalAmount !== null,
    renewInfoPaymentPreviewItems: items,
    renewInfoPaymentPreviewTotalAmount: totalAmount,
    renewInfoPaymentPreviewHasAdditionalAgreement: hasAdditionalAgreement
  };
}
