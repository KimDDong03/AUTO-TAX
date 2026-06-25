import type {
  CustomerOnboardingPreviewResponse,
  CustomerOnboardingTemplateWorkbookInput
} from "./customer-onboarding-workbook";

export type InitialRegistrationRowStatus =
  | "excluded"
  | "unchecked"
  | "checking"
  | "ready"
  | "warning"
  | "needs_recheck"
  | "needs_fix"
  | "manual_required"
  | "blocked";

export type InitialRegistrationIssueCode =
  | "password_invalid"
  | "password_needs_recheck"
  | "certificate_not_found"
  | "certificate_expired"
  | "certificate_not_issue_capable"
  | "business_info_lookup_failed"
  | "hometax_not_registered"
  | "address_missing"
  | "duplicate_business_number"
  | "duplicate_address"
  | "helper_unavailable"
  | "transient_failure"
  | "manual_info_required"
  | "unknown";

export type InitialRegistrationReviewIssue = {
  code: InitialRegistrationIssueCode;
  message: string;
  action: string;
  blocking: boolean;
  needsPassword: boolean;
  needsManualInfo: boolean;
  status: InitialRegistrationRowStatus;
  sourceMessage: string;
};

export type InitialRegistrationCandidateReview = {
  rowIndex: number;
  status: InitialRegistrationRowStatus;
  statusLabel: string;
  blocking: boolean;
  checked: boolean;
  issues: InitialRegistrationReviewIssue[];
};

export type InitialRegistrationCandidateReviewState = {
  rows: InitialRegistrationCandidateReview[];
  byRowIndex: Map<number, InitialRegistrationCandidateReview>;
  unmatchedMessages: string[];
  blockingCount: number;
  readyCount: number;
  warningCount: number;
  issueCount: number;
};

type ChecklistRow = CustomerOnboardingTemplateWorkbookInput["plants"][number];

export type InitialRegistrationChecklistRowLike = {
  rowIndex: number;
  selected?: boolean;
  certificatePassword?: string | null;
  certificateName?: string | null;
  corpName?: string | null;
  plantName?: string | null;
  customerName?: string | null;
  businessNumber?: string | null;
};

export type InitialRegistrationPasswordPasteUpdate = {
  rowIndex: number;
  value: string;
};

type PasswordFailureEntry = {
  businessNumber?: string;
  key?: string;
  customerName?: string;
  label?: string;
  corpName?: string;
  value?: string;
  failedPassword?: string;
};

function normalizeKey(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/\s+/g, "")
    .toLowerCase();
}

function normalizeBusinessNumber(value: string | null | undefined): string {
  return String(value ?? "").replace(/\D/g, "");
}

function uniqueValues(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean)));
}

export function getInitialRegistrationChecklistSelectionPatch<Row extends InitialRegistrationChecklistRowLike>(
  rows: Row[],
  input: {
    rowIndex: number;
    selected: boolean;
    anchorRowIndex: number | null;
    shiftKey: boolean;
  }
): { rowIndexes: number[]; selected: boolean } {
  if (!input.shiftKey || input.anchorRowIndex === null) {
    return { rowIndexes: [input.rowIndex], selected: input.selected };
  }

  const targetIndex = rows.findIndex((row) => row.rowIndex === input.rowIndex);
  const anchorIndex = rows.findIndex((row) => row.rowIndex === input.anchorRowIndex);
  if (targetIndex < 0 || anchorIndex < 0) {
    return { rowIndexes: [input.rowIndex], selected: input.selected };
  }

  const startIndex = Math.min(anchorIndex, targetIndex);
  const endIndex = Math.max(anchorIndex, targetIndex);
  return {
    rowIndexes: rows.slice(startIndex, endIndex + 1).map((row) => row.rowIndex),
    selected: input.selected
  };
}

export function getInitialRegistrationChecklistDragSelectionPatch<Row extends InitialRegistrationChecklistRowLike>(
  rows: Row[],
  input: {
    anchorRowIndex: number;
    currentRowIndex: number;
    selected: boolean;
    initialSelectedRowIndexes: number[];
  }
): { selectedRowIndexes: number[]; deselectedRowIndexes: number[] } {
  const anchorIndex = rows.findIndex((row) => row.rowIndex === input.anchorRowIndex);
  const currentIndex = rows.findIndex((row) => row.rowIndex === input.currentRowIndex);
  if (anchorIndex < 0 || currentIndex < 0) {
    return { selectedRowIndexes: [], deselectedRowIndexes: [] };
  }

  const startIndex = Math.min(anchorIndex, currentIndex);
  const endIndex = Math.max(anchorIndex, currentIndex);
  const initialSelectedRowIndexes = new Set(input.initialSelectedRowIndexes);
  const selectedRowIndexes: number[] = [];
  const deselectedRowIndexes: number[] = [];

  rows.forEach((row, index) => {
    const inDragRange = index >= startIndex && index <= endIndex;
    const shouldBeSelected = inDragRange ? input.selected : initialSelectedRowIndexes.has(row.rowIndex);
    const isSelected = row.selected === true;
    if (shouldBeSelected === isSelected) {
      return;
    }
    if (shouldBeSelected) {
      selectedRowIndexes.push(row.rowIndex);
    } else {
      deselectedRowIndexes.push(row.rowIndex);
    }
  });

  return { selectedRowIndexes, deselectedRowIndexes };
}

export function getInitialRegistrationPasswordClearRowIndexes<Row extends InitialRegistrationChecklistRowLike>(
  rows: Row[]
): number[] {
  return rows
    .filter((row) => row.selected === true && (row.certificatePassword ?? "").trim() !== "")
    .map((row) => row.rowIndex);
}

function normalizeInitialRegistrationSearchText(value: string): string {
  return value.trim().toLocaleLowerCase("ko-KR");
}

function compactInitialRegistrationSearchText(value: string): string {
  return normalizeInitialRegistrationSearchText(value).replace(/[\s-]+/g, "");
}

export function getInitialRegistrationChecklistSearchMatches<Row extends InitialRegistrationChecklistRowLike>(
  rows: Row[],
  searchTerm: string
): Row[] {
  const query = normalizeInitialRegistrationSearchText(searchTerm);
  if (query === "") {
    return rows;
  }

  const compactQuery = compactInitialRegistrationSearchText(searchTerm);
  return rows.filter((row) => {
    const searchableText = [
      row.corpName,
      row.plantName,
      row.certificateName,
      row.customerName,
      row.businessNumber
    ].filter(Boolean).join(" ");
    const normalizedText = normalizeInitialRegistrationSearchText(searchableText);
    if (normalizedText.includes(query)) {
      return true;
    }

    return compactQuery !== "" && compactInitialRegistrationSearchText(searchableText).includes(compactQuery);
  });
}

export function parseInitialRegistrationPasswordPasteText(text: string): string[] {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.split("\t")[0] ?? "")
    .filter((value) => value !== "");
}

export function buildInitialRegistrationPasswordPasteUpdates<Row extends InitialRegistrationChecklistRowLike>(input: {
  rows: Row[];
  selectedRowIndexes: number[];
  startRowIndex: number | null;
  text: string;
}): InitialRegistrationPasswordPasteUpdate[] {
  const values = parseInitialRegistrationPasswordPasteText(input.text);
  if (values.length === 0 || input.rows.length === 0) {
    return [];
  }

  const selectedRowIndexes = new Set(input.selectedRowIndexes);
  const selectedRows = input.rows.filter((row) => selectedRowIndexes.has(row.rowIndex));
  const startIndex = input.startRowIndex === null
    ? -1
    : input.rows.findIndex((row) => row.rowIndex === input.startRowIndex);
  const targetRows = selectedRows.length > 0
    ? selectedRows
    : startIndex >= 0
      ? input.rows.slice(startIndex)
      : [];

  if (targetRows.length === 0) {
    return [];
  }

  if (values.length === 1) {
    return targetRows.map((row) => ({ rowIndex: row.rowIndex, value: values[0] ?? "" }));
  }

  return targetRows.slice(0, values.length).map((row, index) => ({
    rowIndex: row.rowIndex,
    value: values[index] ?? ""
  }));
}

export function getInitialRegistrationCertificateLabel(row: {
  certificateIndex: string;
  certificateName: string;
}): string {
  return row.certificateName.trim() || (row.certificateIndex.trim() ? `인증서 #${row.certificateIndex.trim()}` : "인증서");
}

export function getInitialRegistrationCertificateOverrideKey(row: {
  certificateIndex: string;
  certificateName: string;
}): string {
  const normalizedIndex = row.certificateIndex.trim();
  if (normalizedIndex) {
    return `index:${normalizedIndex}`;
  }

  return `name:${normalizeKey(row.certificateName)}`;
}

function getRowLabelCandidates(row: ChecklistRow): string[] {
  return uniqueValues([
    getInitialRegistrationCertificateLabel(row),
    row.certificateName,
    row.corpName,
    row.plantName,
    row.customerName,
    row.businessNumber,
    row.certificateIndex ? `인증서 #${row.certificateIndex}` : ""
  ]);
}

function getRowMatchKeys(row: ChecklistRow): Set<string> {
  const keys = new Set<string>();
  for (const label of getRowLabelCandidates(row)) {
    keys.add(`label:${normalizeKey(label)}`);
  }
  const businessNumber = normalizeBusinessNumber(row.businessNumber);
  if (businessNumber) {
    keys.add(`business:${businessNumber}`);
  }
  keys.add(`row:${row.rowIndex}`);
  keys.add(`override:${getInitialRegistrationCertificateOverrideKey(row)}`);
  return keys;
}

function parseReviewMessage(rawMessage: string): {
  label: string | null;
  detail: string;
  fullMessage: string;
} {
  const fullMessage = rawMessage.replace(/\s+/g, " ").trim();
  const sheetMatch = fullMessage.match(/^발전소\s*시트\s*\((.+)\)[:：]\s*(.+)$/);
  if (sheetMatch) {
    return {
      label: sheetMatch[1]?.trim() || null,
      detail: sheetMatch[2]?.trim() || fullMessage,
      fullMessage
    };
  }

  const simpleMatch = fullMessage.match(/^([^:：]{1,80})[:：]\s*(.+)$/);
  if (simpleMatch) {
    return {
      label: simpleMatch[1]?.trim() || null,
      detail: simpleMatch[2]?.trim() || fullMessage,
      fullMessage
    };
  }

  return {
    label: null,
    detail: fullMessage,
    fullMessage
  };
}

function classifyInitialRegistrationIssue(rawMessage: string): InitialRegistrationReviewIssue {
  const parsed = parseReviewMessage(rawMessage);
  const message = parsed.detail;
  const normalized = message.toLowerCase();
  const hasAny = (...patterns: string[]) => patterns.some((pattern) => message.includes(pattern));
  const hasRegex = (pattern: RegExp) => pattern.test(message);

  if (
    hasAny("비밀번호", "암호") ||
    normalized.includes("password") ||
    normalized.includes("passwd") ||
    normalized.includes("pwd") ||
    message.includes("375848960")
  ) {
    return {
      code: "password_invalid",
      message,
      action: "개별 비밀번호를 다시 입력한 뒤 수정 후 다시 확인하세요.",
      blocking: true,
      needsPassword: true,
      needsManualInfo: false,
      status: "needs_fix",
      sourceMessage: parsed.fullMessage
    };
  }

  if (hasAny("만료된", "인증서 만료", "갱신가능 기간이 종료", "갱신 가능 기간이 종료")) {
    return {
      code: "certificate_expired",
      message,
      action: "만료된 인증서는 초기 등록에 사용할 수 없습니다. 목록에서 제외하거나 갱신 후 다시 읽어 주세요.",
      blocking: true,
      needsPassword: false,
      needsManualInfo: false,
      status: "blocked",
      sourceMessage: parsed.fullMessage
    };
  }

  if (hasAny("전자세금용 또는 기업범용", "발행 가능 공동인증서만", "개인 범용", "고객 등록에 사용할 수 없습니다")) {
    return {
      code: "certificate_not_issue_capable",
      message,
      action: "발행 가능한 공동인증서만 남기고 제외하세요.",
      blocking: true,
      needsPassword: false,
      needsManualInfo: false,
      status: "blocked",
      sourceMessage: parsed.fullMessage
    };
  }

  if (hasAny("다시 찾지 못했습니다", "선택한 인증서를 찾지 못", "인증서 선택", "공동인증서를 확인하지 못")) {
    return {
      code: "certificate_not_found",
      message,
      action: "공동인증서를 다시 읽거나 파일/폴더 추가 후 다시 확인하세요.",
      blocking: true,
      needsPassword: false,
      needsManualInfo: false,
      status: "blocked",
      sourceMessage: parsed.fullMessage
    };
  }

  if (hasAny("홈택스에 등록되지 않은", "hometax-not-registered")) {
    return {
      code: "hometax_not_registered",
      message,
      action: "자동조회가 어려우면 사업자번호, 상호명, 주소를 입력한 뒤 다시 확인하세요.",
      blocking: true,
      needsPassword: false,
      needsManualInfo: true,
      status: "manual_required",
      sourceMessage: parsed.fullMessage
    };
  }

  if (hasAny("사업자정보 조회 실패", "사업자 정보를 읽지 못", "자동조회로 사업자번호를 읽을 수 없습니다", "사업자번호를 읽지 못")) {
    return {
      code: "business_info_lookup_failed",
      message,
      action: "사업자번호, 상호명, 주소를 입력한 뒤 다시 확인하세요.",
      blocking: true,
      needsPassword: false,
      needsManualInfo: true,
      status: "manual_required",
      sourceMessage: parsed.fullMessage
    };
  }

  if (hasAny("사업장 주소가 없어", "사업장 주소를 입력", "주소를 확인할 수 없습니다", "매칭 주소가 없어")) {
    return {
      code: "address_missing",
      message,
      action: "한전 메일 자동 매칭에 필요하므로 사업장 주소를 입력한 뒤 다시 확인하세요.",
      blocking: true,
      needsPassword: false,
      needsManualInfo: true,
      status: "needs_fix",
      sourceMessage: parsed.fullMessage
    };
  }

  if (hasRegex(/사업자번호.*중복|이미 등록된 고객의 사업자번호|같은 사업자번호/)) {
    return {
      code: "duplicate_business_number",
      message,
      action: "기존 고객과 연결할 대상인지 확인하거나 목록에서 제외하세요.",
      blocking: true,
      needsPassword: false,
      needsManualInfo: false,
      status: "needs_fix",
      sourceMessage: parsed.fullMessage
    };
  }

  if (hasRegex(/주소.*중복|이미 등록된 고객의 주소|이미 다른 고객에 등록된 매칭 주소/)) {
    return {
      code: "duplicate_address",
      message,
      action: "중복 주소가 맞는지 확인하고 주소를 수정하거나 목록에서 제외하세요.",
      blocking: true,
      needsPassword: false,
      needsManualInfo: true,
      status: "needs_fix",
      sourceMessage: parsed.fullMessage
    };
  }

  if (hasAny("AT 헬퍼", "브리지 연결 실패", "로컬 포트", "연결하지 못했습니다", "요청이 60초")) {
    return {
      code: "helper_unavailable",
      message,
      action: "AT 헬퍼 상태를 확인한 뒤 다시 확인하세요.",
      blocking: true,
      needsPassword: false,
      needsManualInfo: false,
      status: "needs_fix",
      sourceMessage: parsed.fullMessage
    };
  }

  if (hasAny("다시 시도", "일시", "timeout", "타임아웃")) {
    return {
      code: "transient_failure",
      message,
      action: "잠시 후 다시 확인하세요.",
      blocking: true,
      needsPassword: false,
      needsManualInfo: false,
      status: "needs_fix",
      sourceMessage: parsed.fullMessage
    };
  }

  if (hasAny("사업자번호는 숫자 10자리", "대표자명 또는 상호명", "사업장 주소를 입력")) {
    return {
      code: "manual_info_required",
      message,
      action: "필수 정보를 입력한 뒤 다시 확인하세요.",
      blocking: true,
      needsPassword: false,
      needsManualInfo: true,
      status: "manual_required",
      sourceMessage: parsed.fullMessage
    };
  }

  return {
    code: "unknown",
    message,
    action: "내용을 확인한 뒤 수정하거나 다시 확인하세요.",
    blocking: true,
    needsPassword: false,
    needsManualInfo: false,
    status: "needs_fix",
    sourceMessage: parsed.fullMessage
  };
}

function buildPasswordNeedsRecheckIssue(label: string): InitialRegistrationReviewIssue {
  const normalizedLabel = label.trim() || "공동인증서";
  return {
    code: "password_needs_recheck",
    message: "비밀번호를 수정했습니다. 다시 확인해야 합니다.",
    action: "선택 고객 확인을 다시 실행하세요.",
    blocking: true,
    needsPassword: true,
    needsManualInfo: false,
    status: "needs_recheck",
    sourceMessage: `${normalizedLabel}: 비밀번호를 수정했습니다. 다시 확인해야 합니다.`
  };
}

function statusPriority(status: InitialRegistrationRowStatus): number {
  switch (status) {
    case "blocked":
      return 70;
    case "manual_required":
      return 60;
    case "needs_recheck":
      return 55;
    case "needs_fix":
      return 50;
    case "warning":
      return 40;
    case "checking":
      return 30;
    case "ready":
      return 20;
    case "unchecked":
      return 10;
    case "excluded":
      return 0;
  }
}

function getStatusLabel(status: InitialRegistrationRowStatus): string {
  switch (status) {
    case "excluded":
      return "제외";
    case "unchecked":
      return "확인 전";
    case "checking":
      return "확인 중";
    case "ready":
      return "통과";
    case "warning":
      return "보완 권장";
    case "needs_recheck":
      return "재확인 필요";
    case "needs_fix":
      return "수정 필요";
    case "manual_required":
      return "정보 입력";
    case "blocked":
      return "제외 필요";
  }
}

function getIssueMatchKeysFromMessage(message: string): Set<string> {
  const parsed = parseReviewMessage(message);
  const keys = new Set<string>();
  if (parsed.label) {
    keys.add(`label:${normalizeKey(parsed.label)}`);
  }
  const businessNumber = normalizeBusinessNumber(parsed.fullMessage);
  if (businessNumber.length === 10) {
    keys.add(`business:${businessNumber}`);
  }
  return keys;
}

function getPasswordFailureMatchKeys(entry: PasswordFailureEntry): Set<string> {
  const keys = new Set<string>();
  const rawKey = entry.key ?? entry.businessNumber ?? "";
  if (rawKey.trim()) {
    keys.add(`override:${rawKey.trim()}`);
  }
  const label = entry.label ?? entry.customerName ?? entry.corpName ?? "";
  if (label.trim()) {
    keys.add(`label:${normalizeKey(label)}`);
  }
  const businessNumber = normalizeBusinessNumber(entry.businessNumber);
  if (businessNumber) {
    keys.add(`business:${businessNumber}`);
  }
  return keys;
}

function hasSharedKey(left: Set<string>, right: Set<string>): boolean {
  for (const key of left) {
    if (right.has(key)) {
      return true;
    }
  }
  return false;
}

function previewRowToIssueMessages(preview: CustomerOnboardingPreviewResponse | null): Array<{
  rowIndex: number;
  messages: string[];
}> {
  return (preview?.rows ?? []).map((row) => ({
    rowIndex: row.rowIndex,
    messages: [
      ...row.errors.map((message) => `${row.corpName || row.customerName || row.businessNumber || `${row.rowIndex}행`}: ${message}`),
      ...row.warnings.map((message) => `${row.corpName || row.customerName || row.businessNumber || `${row.rowIndex}행`}: ${message}`)
    ]
  }));
}

export function buildInitialRegistrationCandidateReviewState(input: {
  rows: ChecklistRow[];
  preview: CustomerOnboardingPreviewResponse | null;
  error: string;
  passwordFailureEntries?: PasswordFailureEntry[];
  checking?: boolean;
}): InitialRegistrationCandidateReviewState {
  const previewMessagesByRowIndex = new Map<number, string[]>();
  for (const row of previewRowToIssueMessages(input.preview)) {
    previewMessagesByRowIndex.set(row.rowIndex, row.messages);
  }

  const globalMessages = input.error
    .split(/\r?\n/)
    .map((message) => message.trim())
    .filter(Boolean);
  const unmatchedMessages = new Set(globalMessages);
  const rows = input.rows.map<InitialRegistrationCandidateReview>((row) => {
    const selected = row.selected === true;
    const rowMatchKeys = getRowMatchKeys(row);
    const issues: InitialRegistrationReviewIssue[] = [];

    for (const entry of input.passwordFailureEntries ?? []) {
      if (hasSharedKey(rowMatchKeys, getPasswordFailureMatchKeys(entry))) {
        const label = entry.label ?? entry.customerName ?? getInitialRegistrationCertificateLabel(row);
        const failedPassword = entry.failedPassword?.trim() ?? "";
        const currentPassword = (entry.value?.trim() || row.certificatePassword?.trim() || "");
        issues.push(
          failedPassword && currentPassword && currentPassword !== failedPassword
            ? buildPasswordNeedsRecheckIssue(label)
            : classifyInitialRegistrationIssue(`${label}: 공동인증서 비밀번호가 올바르지 않습니다.`)
        );
      }
    }

    for (const message of previewMessagesByRowIndex.get(row.rowIndex) ?? []) {
      issues.push(classifyInitialRegistrationIssue(message));
    }

    for (const message of globalMessages) {
      if (hasSharedKey(rowMatchKeys, getIssueMatchKeysFromMessage(message))) {
        issues.push(classifyInitialRegistrationIssue(message));
        unmatchedMessages.delete(message);
      }
    }

    const dedupedIssues = Array.from(
      new Map(issues.map((issue) => [`${issue.code}:${issue.message}`, issue])).values()
    );
    const blocking = dedupedIssues.some((issue) => issue.blocking);
    const status = !selected
      ? "excluded"
      : input.checking
        ? "checking"
        : dedupedIssues.length > 0
          ? dedupedIssues
              .map((issue) => issue.status)
              .sort((left, right) => statusPriority(right) - statusPriority(left))[0] ?? "needs_fix"
          : input.preview
            ? "ready"
            : "unchecked";

    return {
      rowIndex: row.rowIndex,
      status,
      statusLabel: getStatusLabel(status),
      blocking,
      checked: Boolean(input.preview) && selected,
      issues: dedupedIssues
    };
  });

  const selectedRows = rows.filter((row, index) => input.rows[index]?.selected === true);
  const blockingCount = selectedRows.filter((row) => row.blocking).length;
  const readyCount = selectedRows.filter((row) => row.status === "ready").length;
  const warningCount = selectedRows.filter((row) => row.status === "warning").length;
  const issueCount = selectedRows.filter((row) => row.issues.length > 0).length;

  return {
    rows,
    byRowIndex: new Map(rows.map((row) => [row.rowIndex, row])),
    unmatchedMessages: Array.from(unmatchedMessages),
    blockingCount,
    readyCount,
    warningCount,
    issueCount
  };
}
