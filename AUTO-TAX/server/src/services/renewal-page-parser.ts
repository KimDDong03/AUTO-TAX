import type {
  RenewalBridgePreflightProbe,
  RenewalInfoSnapshot,
  RenewalPreflightComparisonProfile
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
  const pageTitle =
    html.match(/document\.title\s*=\s*"([^"]+)"/i)?.[1]?.trim() ||
    html.match(/<title>([^<]+)<\/title>/i)?.[1]?.trim() ||
    null;

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

  const snapshot: RenewalInfoSnapshot = {
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
    contactTel:
      joinSegmentedValue(infoValues, ["ordEntprsChargrTel", "ordEntprsChargrTel1", "ordEntprsChargrTel2"]) ??
      normalizeVisibleValue(productValues.ordEntprsChargrTel),
    contactFax:
      joinSegmentedValue(infoValues, ["ordEntprsChargrFax", "ordEntprsChargrFax1", "ordEntprsChargrFax2"]) ??
      normalizeVisibleValue(productValues.ordEntprsChargrFax),
    contactMobile:
      joinSegmentedValue(infoValues, ["ordEntprsChargrHpno", "ordEntprsChargrHpno1", "ordEntprsChargrHpno2"]) ??
      normalizeVisibleValue(productValues.ordEntprsChargrHpno)
  };

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
    { label: "사업장주소", actual: snapshot.baseAddress, expected: profile.addr, normalize: normalizeAddressForCompare },
    { label: "업태", actual: snapshot.bizType, expected: profile.bizType, normalize: normalizeTextForCompare },
    { label: "업종", actual: snapshot.bizClass, expected: profile.bizClass, normalize: normalizeTextForCompare }
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
  const itemRows = [...html.matchAll(/<tr>[\s\S]*?<th[^>]*>([^<]*)<\/th>[\s\S]*?<td>([^<]*)<\/td>[\s\S]*?<td[^>]*><strong>([^<]*)<\/strong>/gi)];
  const items = itemRows.map((row) => {
    const title = decodeHtmlText(row[1] ?? "");
    const quantity = decodeHtmlText(row[2] ?? "");
    const amount = decodeHtmlText(row[3] ?? "");
    return [title, quantity, amount].filter(Boolean).join(" / ");
  });

  const totalAmount =
    normalizeAmountText(
      decodeHtmlText(html.match(/<dl[^>]*class=["'][^"']*total-price[^"']*["'][\s\S]*?<dd>([\s\S]*?)<\/dd>/i)?.[1] ?? "")
    ) || null;

  return {
    renewInfoPaymentPreviewLoaded: /id=["']devSubPayInfForm["']/i.test(html),
    renewInfoPaymentPreviewItems: items,
    renewInfoPaymentPreviewTotalAmount: totalAmount,
    renewInfoPaymentPreviewHasAdditionalAgreement: /id=["']devAdiSubAcrsAgreForm["']/i.test(html)
  };
}
