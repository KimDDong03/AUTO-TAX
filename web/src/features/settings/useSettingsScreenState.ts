import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { api } from "../../api";
import { supabase } from "../../supabase";
import type { AppSettings, OrganizationMemberRole, OrganizationMemberSummary } from "../../types";
import type { LocalRenewalHelperUpgradeState } from "../../helper-version";

export type MailProvider = "gmail" | "naver" | "daum";
export type SettingsSectionId = "gmail" | "popbill" | "helper" | "account";
export type SettingsAutosaveState = "idle" | "pending" | "saving" | "saved" | "error";
export type PasswordChangeFormState = {
  nextPassword: string;
  confirmPassword: string;
};
export type PasswordResetFormState = {
  nextPassword: string;
  confirmPassword: string;
};
export type MemberPasswordResetTarget = {
  kind: "member";
  membershipId: string;
  loginId: string | null;
  displayName: string | null;
};
export type OrganizationMemberFormState = {
  loginId: string;
  displayName: string;
  password: string;
};
export type SettingsOrganizationMemberItem = {
  member: OrganizationMemberSummary;
  roleLabel: string;
  isCurrentUser: boolean;
  isOwner: boolean;
  canRemove: boolean;
  canResetPassword: boolean;
  isResetTarget: boolean;
};
export type SettingsAccountState = {
  canManageOrganizationMembers: boolean;
  organizationMembers: OrganizationMemberSummary[];
  organizationMemberItems: SettingsOrganizationMemberItem[];
  passwordChangeForm: PasswordChangeFormState;
  passwordResetForm: PasswordResetFormState;
  passwordResetTarget: MemberPasswordResetTarget | null;
  organizationMemberForm: OrganizationMemberFormState;
  setPasswordChangeForm: Dispatch<SetStateAction<PasswordChangeFormState>>;
  setPasswordResetForm: Dispatch<SetStateAction<PasswordResetFormState>>;
  setOrganizationMemberForm: Dispatch<SetStateAction<OrganizationMemberFormState>>;
  changePassword: () => Promise<void>;
  createOrganizationMember: () => Promise<void>;
  openMemberPasswordReset: (member: OrganizationMemberSummary) => void;
  removeOrganizationMember: (member: OrganizationMemberSummary) => Promise<void>;
  submitMemberPasswordReset: () => Promise<void>;
  cancelPasswordReset: () => void;
};

export function createEmptyPasswordChangeForm(): PasswordChangeFormState {
  return {
    nextPassword: "",
    confirmPassword: ""
  };
}

export function createEmptyPasswordResetForm(): PasswordResetFormState {
  return {
    nextPassword: "",
    confirmPassword: ""
  };
}

export function createEmptyOrganizationMemberForm(): OrganizationMemberFormState {
  return {
    loginId: "",
    displayName: "",
    password: ""
  };
}

export type SettingsFormState = {
  mailProvider: MailProvider;
  imapHost: string;
  imapPort: string;
  imapSecure: boolean;
  mailAddress: string;
  mailPassword: string;
  imapMailbox: string;
  smtpHost: string;
  smtpPort: string;
  smtpSecure: boolean;
  notificationEmailsText: string;
  defaultIssueDay: string;
  defaultIssueHour: string;
  defaultIssueMinute: string;
  mailPollMinutes: string;
  mailSyncStartAt: string;
  timezone: string;
  popbillUserIdPrefix: string;
  popbillSharedPassword: string;
  operatorContactName: string;
  operatorContactEmail: string;
  operatorContactTel: string;
  renewalContactDepartment: string;
  renewalContactFax: string;
  renewalCertificatePassword: string;
  renewalIssuePassword: string;
  schedulerEnabled: boolean;
};

export type SettingsHealth = {
  mailReady: boolean;
  popbillReady: boolean;
  operatorReady: boolean;
};

export const MAIL_PROVIDER_CONFIG: Record<
  MailProvider,
  {
    label: string;
    imapHost: string;
    imapPort: string;
    imapSecure: boolean;
    smtpHost: string;
    smtpPort: string;
    smtpSecure: boolean;
    defaultMailbox: string;
  }
> = {
  gmail: {
    label: "Gmail",
    imapHost: "imap.gmail.com",
    imapPort: "993",
    imapSecure: true,
    smtpHost: "smtp.gmail.com",
    smtpPort: "465",
    smtpSecure: true,
    defaultMailbox: "INBOX"
  },
  naver: {
    label: "네이버 메일",
    imapHost: "imap.naver.com",
    imapPort: "993",
    imapSecure: true,
    smtpHost: "smtp.naver.com",
    smtpPort: "587",
    smtpSecure: false,
    defaultMailbox: "INBOX"
  },
  daum: {
    label: "다음 메일",
    imapHost: "imap.daum.net",
    imapPort: "993",
    imapSecure: true,
    smtpHost: "smtp.daum.net",
    smtpPort: "465",
    smtpSecure: true,
    defaultMailbox: "INBOX"
  }
};

export type UseSettingsScreenStateArgs = {
  activeOrganizationId: string | null;
  bootstrapOrganizationId: string | null;
  activeOrganizationRole: OrganizationMemberRole | null;
  bootstrapSettings: AppSettings | null;
  busyKey: string | null;
  currentUserId: string | null;
  helperReady: boolean;
  helperCertificateCount: number;
  customerRenewalAssistantOnline: boolean;
  customerRenewalAssistantUpgradeState: LocalRenewalHelperUpgradeState;
  setGlobalError: (message: string) => void;
  revealField: (fieldKey: string) => void;
  onRenewalCertificatePasswordChange: (password: string) => void;
  onRenewalIssuePasswordChange: (password: string) => void;
  refreshCustomerRenewalAssistant: () => Promise<void>;
  runAction: (key: string, action: () => Promise<void>, options?: { reload?: boolean }) => Promise<void>;
  showConfirm: (
    message: string,
    options?: { title?: string; tone?: "default" | "warn" | "danger"; confirmLabel?: string }
  ) => Promise<boolean>;
  showAlert: (
    message: string,
    options?: { title?: string; tone?: "default" | "warn" | "danger" | "success" }
  ) => Promise<void>;
};

function shouldShowPopbillPrefixPlaceholder(settings: AppSettings): boolean {
  const normalizedPrefix = settings.popbillUserIdPrefix.trim().toUpperCase();
  const isDefaultExample = normalizedPrefix === "" || normalizedPrefix === "TEST_" || normalizedPrefix === "HAE_";
  const hasWorkspacePopbillValues =
    settings.popbillSharedPasswordConfigured ||
    Boolean(settings.operatorContactName.trim() || settings.operatorContactEmail.trim() || settings.operatorContactTel.trim());

  return isDefaultExample && !hasWorkspacePopbillValues;
}

function inferMailProvider(settings: Pick<AppSettings, "imapHost" | "smtpHost">): MailProvider {
  const imapHost = settings.imapHost.trim().toLowerCase();
  const smtpHost = settings.smtpHost.trim().toLowerCase();

  if (imapHost.includes("naver") || smtpHost.includes("naver")) return "naver";
  if (imapHost.includes("daum") || smtpHost.includes("daum")) return "daum";
  return "gmail";
}

export function inferMailProviderFromAddress(address: string, fallback: MailProvider = "gmail"): MailProvider {
  const normalized = address.trim().toLowerCase();

  if (!normalized.includes("@")) {
    return fallback;
  }

  if (normalized.endsWith("@naver.com")) return "naver";
  if (normalized.endsWith("@daum.net") || normalized.endsWith("@hanmail.net")) return "daum";
  if (normalized.endsWith("@gmail.com")) return "gmail";

  return fallback;
}

function withSelectedMailProviderSettings(form: SettingsFormState) {
  const detectedProvider = inferMailProviderFromAddress(form.mailAddress, form.mailProvider);
  const config = MAIL_PROVIDER_CONFIG[detectedProvider];
  return {
    ...form,
    mailProvider: detectedProvider,
    imapHost: config.imapHost,
    imapPort: config.imapPort,
    imapSecure: config.imapSecure,
    imapMailbox: config.defaultMailbox,
    smtpHost: config.smtpHost,
    smtpPort: config.smtpPort,
    smtpSecure: config.smtpSecure
  };
}

export function settingsToForm(settings: AppSettings): SettingsFormState {
  const detectedProvider = inferMailProviderFromAddress(
    settings.imapUser || settings.smtpUser || settings.smtpFromEmail,
    inferMailProvider(settings)
  );
  return {
    mailProvider: detectedProvider,
    imapHost: settings.imapHost,
    imapPort: String(settings.imapPort),
    imapSecure: settings.imapSecure,
    mailAddress: settings.imapUser || settings.smtpUser || settings.smtpFromEmail,
    mailPassword: "",
    imapMailbox: settings.imapMailbox,
    smtpHost: settings.smtpHost,
    smtpPort: String(settings.smtpPort),
    smtpSecure: settings.smtpSecure,
    notificationEmailsText: settings.notificationEmails.join("\n"),
    defaultIssueDay: String(settings.defaultIssueDay),
    defaultIssueHour: String(settings.defaultIssueHour),
    defaultIssueMinute: String(settings.defaultIssueMinute),
    mailPollMinutes: String(settings.mailPollMinutes),
    mailSyncStartAt: "",
    timezone: settings.timezone,
    popbillUserIdPrefix: shouldShowPopbillPrefixPlaceholder(settings) ? "" : settings.popbillUserIdPrefix,
    popbillSharedPassword: "",
    operatorContactName: settings.operatorContactName,
    operatorContactEmail: settings.operatorContactEmail,
    operatorContactTel: settings.operatorContactTel,
    renewalContactDepartment: settings.renewalContactDepartment,
    renewalContactFax: settings.renewalContactFax,
    renewalCertificatePassword: "",
    renewalIssuePassword: "",
    schedulerEnabled: settings.schedulerEnabled
  };
}

export function normalizeRenewalIssuePasswordInput(value: string): string {
  return value.replace(/\D/g, "").slice(0, 6);
}

function buildSettingsPayload(form: SettingsFormState) {
  const normalized = withSelectedMailProviderSettings(form);
  const renewalIssuePassword = normalizeRenewalIssuePasswordInput(normalized.renewalIssuePassword);
  return {
    normalized,
    payload: {
      imapHost: normalized.imapHost.trim(),
      imapPort: Number(normalized.imapPort || 0),
      imapSecure: normalized.imapSecure,
      imapUser: normalized.mailAddress.trim(),
      imapPass: normalized.mailPassword.trim(),
      imapMailbox: normalized.imapMailbox.trim() || MAIL_PROVIDER_CONFIG[normalized.mailProvider].defaultMailbox,
      smtpHost: normalized.smtpHost.trim(),
      smtpPort: Number(normalized.smtpPort || 0),
      smtpSecure: normalized.smtpSecure,
      smtpUser: normalized.mailAddress.trim(),
      smtpPass: normalized.mailPassword.trim(),
      smtpFromEmail: normalized.mailAddress.trim(),
      notificationEmails: normalized.notificationEmailsText
        .split(/\r?\n/)
        .map((value) => value.trim())
        .filter(Boolean),
      defaultIssueDay: Number(normalized.defaultIssueDay || 0),
      defaultIssueHour: Number(normalized.defaultIssueHour || 0),
      defaultIssueMinute: Number(normalized.defaultIssueMinute || 0),
      mailPollMinutes: Number(normalized.mailPollMinutes || 0),
      timezone: normalized.timezone.trim(),
      popbillUserIdPrefix: normalized.popbillUserIdPrefix.trim(),
      popbillSharedPassword: normalized.popbillSharedPassword.trim(),
      operatorContactName: normalized.operatorContactName.trim(),
      operatorContactEmail: normalized.operatorContactEmail.trim(),
      operatorContactTel: normalized.operatorContactTel.trim(),
      renewalContactDepartment: normalized.renewalContactDepartment.trim(),
      renewalContactFax: normalized.renewalContactFax.trim(),
      renewalCertificatePassword: normalized.renewalCertificatePassword,
      renewalIssuePassword,
      schedulerEnabled: normalized.schedulerEnabled
    }
  };
}

function buildMailSettingsSavePayload(form: SettingsFormState, savedSettings: AppSettings | null) {
  const { normalized, payload } = buildSettingsPayload(form);
  if (!savedSettings) {
    return { normalized, payload };
  }

  return {
    normalized,
    payload: {
      ...payload,
      popbillUserIdPrefix: savedSettings.popbillUserIdPrefix,
      popbillSharedPassword: "",
      operatorContactName: savedSettings.operatorContactName,
      operatorContactEmail: savedSettings.operatorContactEmail,
      operatorContactTel: savedSettings.operatorContactTel,
      renewalContactDepartment: savedSettings.renewalContactDepartment,
      renewalContactFax: savedSettings.renewalContactFax,
      renewalCertificatePassword: "",
      renewalIssuePassword: ""
    }
  };
}

function getSettingsPayloadSignature(form: SettingsFormState) {
  return JSON.stringify(buildSettingsPayload(form).payload);
}

function canAutosaveSettings(form: SettingsFormState) {
  const { payload } = buildSettingsPayload(form);
  const isFiniteInteger = (value: number) => Number.isInteger(value) && Number.isFinite(value);

  return (
    isFiniteInteger(payload.imapPort) &&
    payload.imapPort >= 1 &&
    isFiniteInteger(payload.smtpPort) &&
    payload.smtpPort >= 1 &&
    isFiniteInteger(payload.defaultIssueDay) &&
    payload.defaultIssueDay >= 1 &&
    payload.defaultIssueDay <= 31 &&
    isFiniteInteger(payload.defaultIssueHour) &&
    payload.defaultIssueHour >= 0 &&
    payload.defaultIssueHour <= 23 &&
    isFiniteInteger(payload.defaultIssueMinute) &&
    payload.defaultIssueMinute >= 0 &&
    payload.defaultIssueMinute <= 59 &&
    isFiniteInteger(payload.mailPollMinutes) &&
    payload.mailPollMinutes >= 1 &&
    payload.mailPollMinutes <= 1440 &&
    (payload.renewalIssuePassword === "" || /^\d{6}$/.test(payload.renewalIssuePassword))
  );
}

function getWorkspaceMemberRoleLabel(role: OrganizationMemberSummary["role"]): string {
  return role === "owner" ? "owner" : "member";
}

type InternalSettingsAccountState = SettingsAccountState & {
  syncOrganizationMembers: (members: OrganizationMemberSummary[]) => void;
  resetOrganizationMemberState: () => void;
  resetAccountState: () => void;
};

function useSettingsAccountState({
  activeOrganizationId,
  bootstrapOrganizationId,
  activeOrganizationRole,
  currentUserId,
  showAlert,
  showConfirm
}: Pick<
  UseSettingsScreenStateArgs,
  | "activeOrganizationId"
  | "bootstrapOrganizationId"
  | "activeOrganizationRole"
  | "currentUserId"
  | "showAlert"
  | "showConfirm"
>): InternalSettingsAccountState {
  const [passwordChangeForm, setPasswordChangeForm] = useState<PasswordChangeFormState>(
    createEmptyPasswordChangeForm
  );
  const [passwordResetForm, setPasswordResetForm] = useState<PasswordResetFormState>(
    createEmptyPasswordResetForm
  );
  const [passwordResetTarget, setPasswordResetTarget] =
    useState<MemberPasswordResetTarget | null>(null);
  const [organizationMembers, setOrganizationMembers] = useState<OrganizationMemberSummary[]>([]);
  const [organizationMemberForm, setOrganizationMemberForm] =
    useState<OrganizationMemberFormState>(createEmptyOrganizationMemberForm);
  const canManageOrganizationMembers =
    activeOrganizationId !== null &&
    activeOrganizationId === bootstrapOrganizationId &&
    activeOrganizationRole === "owner";

  const syncOrganizationMembers = useCallback(
    (members: OrganizationMemberSummary[]) => {
      setOrganizationMembers(members);
    },
    []
  );

  const cancelPasswordReset = useCallback(() => {
    setPasswordResetTarget(null);
    setPasswordResetForm(createEmptyPasswordResetForm());
  }, []);

  const resetOrganizationMemberState = useCallback(() => {
    setOrganizationMembers([]);
    setOrganizationMemberForm(createEmptyOrganizationMemberForm());
    cancelPasswordReset();
  }, [cancelPasswordReset]);

  const resetAccountState = useCallback(() => {
    setPasswordChangeForm(createEmptyPasswordChangeForm());
    resetOrganizationMemberState();
  }, [resetOrganizationMemberState]);

  useEffect(() => {
    if (!canManageOrganizationMembers) {
      resetOrganizationMemberState();
    }
  }, [canManageOrganizationMembers, resetOrganizationMemberState]);

  const changePassword = useCallback(async () => {
    const nextPassword = passwordChangeForm.nextPassword.trim();
    const confirmPassword = passwordChangeForm.confirmPassword.trim();

    if (nextPassword.length < 8) {
      throw new Error("새 비밀번호는 8자 이상으로 입력하세요.");
    }

    if (nextPassword !== confirmPassword) {
      throw new Error("새 비밀번호와 확인 값이 일치하지 않습니다.");
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password: nextPassword
    });

    if (updateError) {
      throw updateError;
    }

    setPasswordChangeForm(createEmptyPasswordChangeForm());
    await showAlert("비밀번호를 변경했습니다.", {
      title: "비밀번호 변경 완료",
      tone: "success"
    });
  }, [passwordChangeForm, showAlert]);

  const openMemberPasswordReset = useCallback((member: OrganizationMemberSummary) => {
    setPasswordResetTarget({
      kind: "member",
      membershipId: member.membershipId,
      loginId: member.loginId,
      displayName: member.displayName
    });
    setPasswordResetForm(createEmptyPasswordResetForm());
  }, []);

  const submitMemberPasswordReset = useCallback(async () => {
    if (!passwordResetTarget) {
      throw new Error("비밀번호를 재설정할 대상을 먼저 선택하세요.");
    }

    const nextPassword = passwordResetForm.nextPassword.trim();
    const confirmPassword = passwordResetForm.confirmPassword.trim();

    if (nextPassword.length < 8) {
      throw new Error("임시 비밀번호는 8자 이상으로 입력하세요.");
    }

    if (nextPassword !== confirmPassword) {
      throw new Error("임시 비밀번호와 확인 값이 일치하지 않습니다.");
    }

    const result = await api<{ ok: true; loginId: string | null }>(
      `/api/organization/members/${passwordResetTarget.membershipId}/reset-password`,
      {
        method: "POST",
        body: JSON.stringify({
          password: nextPassword
        })
      }
    );

    await showAlert(`${result.loginId ?? "선택한 사용자"}의 임시 비밀번호를 재설정했습니다.`, {
      title: "임시 비밀번호 재설정",
      tone: "success"
    });
    cancelPasswordReset();
  }, [cancelPasswordReset, passwordResetForm, passwordResetTarget, showAlert]);

  const createOrganizationMember = useCallback(async () => {
    const result = await api<{
      members: OrganizationMemberSummary[];
      memberAction: "linked-existing-user" | "created-user";
    }>("/api/organization/members", {
      method: "POST",
      body: JSON.stringify({
        loginId: organizationMemberForm.loginId.trim(),
        displayName: organizationMemberForm.displayName.trim(),
        password: organizationMemberForm.password
      })
    });

    setOrganizationMembers(result.members);
    setOrganizationMemberForm(createEmptyOrganizationMemberForm());
    await showAlert(
      result.memberAction === "created-user"
        ? "새 사용자 계정을 만들고 작업공간 멤버로 연결했습니다."
        : "기존 사용자 계정을 작업공간 멤버로 연결했습니다.",
      {
        title: "사용자 추가 완료",
        tone: "success"
      }
    );
  }, [organizationMemberForm, showAlert]);

  const removeOrganizationMember = useCallback(
    async (member: OrganizationMemberSummary) => {
      const confirmed = await showConfirm(
        `${member.loginId ?? "선택한 사용자"}를 이 작업공간에서 제거할까요?`,
        {
          title: "작업공간 사용자 제거",
          tone: "danger",
          confirmLabel: "제거하기"
        }
      );
      if (!confirmed) {
        return;
      }

      const result = await api<{ ok: true; members: OrganizationMemberSummary[] }>(
        `/api/organization/members/${member.membershipId}`,
        {
          method: "DELETE"
        }
      );

      setOrganizationMembers(result.members);
      if (passwordResetTarget?.membershipId === member.membershipId) {
        cancelPasswordReset();
      }
    },
    [cancelPasswordReset, passwordResetTarget?.membershipId, showConfirm]
  );

  const organizationMemberItems = useMemo<SettingsOrganizationMemberItem[]>(
    () =>
      organizationMembers.map((member) => {
        const isCurrentUser = member.userId === currentUserId;
        const isOwner = member.role === "owner";
        return {
          member,
          roleLabel: getWorkspaceMemberRoleLabel(member.role),
          isCurrentUser,
          isOwner,
          canRemove: !isOwner && !isCurrentUser,
          canResetPassword: !isOwner,
          isResetTarget: passwordResetTarget?.membershipId === member.membershipId
        };
      }),
    [currentUserId, organizationMembers, passwordResetTarget?.membershipId]
  );

  return {
    canManageOrganizationMembers,
    organizationMembers,
    organizationMemberItems,
    passwordChangeForm,
    passwordResetForm,
    passwordResetTarget,
    organizationMemberForm,
    setPasswordChangeForm:
      setPasswordChangeForm as Dispatch<SetStateAction<PasswordChangeFormState>>,
    setPasswordResetForm:
      setPasswordResetForm as Dispatch<SetStateAction<PasswordResetFormState>>,
    setOrganizationMemberForm:
      setOrganizationMemberForm as Dispatch<SetStateAction<OrganizationMemberFormState>>,
    changePassword,
    createOrganizationMember,
    openMemberPasswordReset,
    removeOrganizationMember,
    submitMemberPasswordReset,
    cancelPasswordReset,
    syncOrganizationMembers,
    resetOrganizationMemberState,
    resetAccountState
  };
}

export function useSettingsScreenState({
  activeOrganizationId,
  bootstrapOrganizationId,
  activeOrganizationRole,
  bootstrapSettings,
  busyKey,
  currentUserId,
  helperReady,
  helperCertificateCount,
  customerRenewalAssistantOnline,
  customerRenewalAssistantUpgradeState,
  setGlobalError,
  revealField,
  onRenewalCertificatePasswordChange,
  onRenewalIssuePasswordChange,
  refreshCustomerRenewalAssistant,
  runAction,
  showConfirm,
  showAlert
}: UseSettingsScreenStateArgs) {
  const account = useSettingsAccountState({
    activeOrganizationId,
    bootstrapOrganizationId,
    activeOrganizationRole,
    currentUserId,
    showAlert,
    showConfirm
  });
  const [savedSettingsState, setSavedSettingsState] = useState<AppSettings | null>(null);
  const [settingsFormState, setSettingsFormState] = useState<SettingsFormState | null>(null);
  const [settingsAutosaveState, setSettingsAutosaveState] = useState<SettingsAutosaveState>("idle");
  const settingsAutosaveBaselineRef = useRef("");
  const organizationMembersLoadTokenRef = useRef(0);
  const isBootstrapReadyForActiveOrganization =
    activeOrganizationId !== null &&
    activeOrganizationId === bootstrapOrganizationId &&
    bootstrapSettings !== null;
  const savedSettings =
    savedSettingsState ?? (isBootstrapReadyForActiveOrganization ? bootstrapSettings : null);
  const settingsForm = settingsFormState ?? (savedSettings ? settingsToForm(savedSettings) : null);
  const publicAccount: SettingsAccountState = account;

  const setSettingsForm = useCallback<Dispatch<SetStateAction<SettingsFormState | null>>>(
    (nextState) => {
      setSettingsFormState((prev) => {
        const baseState = prev ?? settingsForm;
        if (typeof nextState === "function") {
          return (
            nextState as (previousState: SettingsFormState | null) => SettingsFormState | null
          )(baseState);
        }
        return nextState;
      });
    },
    [settingsForm]
  );

  const settingsHealth = useMemo<SettingsHealth>(
    () => ({
      mailReady: Boolean(
        savedSettings?.imapUser &&
          savedSettings.smtpUser &&
          savedSettings.mailPasswordConfigured &&
          savedSettings.mailConnectionVerifiedAt
      ),
      popbillReady: savedSettings?.popbillConfigured ?? false,
      operatorReady: savedSettings?.operatorConfigured ?? false
    }),
    [savedSettings]
  );

  const applySavedSettings = useCallback(
    (
      nextSavedSettings: AppSettings,
      options?: {
        syncForm?: boolean;
        baselineForm?: SettingsFormState | null;
      }
    ) => {
      const baselineForm = options?.baselineForm ?? settingsToForm(nextSavedSettings);
      setSavedSettingsState(nextSavedSettings);
      if (options?.syncForm !== false) {
        setSettingsFormState(baselineForm);
      }
      settingsAutosaveBaselineRef.current = baselineForm ? getSettingsPayloadSignature(baselineForm) : "";
      setSettingsAutosaveState("saved");
    },
    []
  );

  const resetSettingsFormState = useCallback(() => {
    setSavedSettingsState(null);
    setSettingsFormState(null);
    settingsAutosaveBaselineRef.current = "";
    setSettingsAutosaveState("idle");
  }, []);

  useEffect(() => {
    if (currentUserId !== null) {
      return;
    }

    resetSettingsFormState();
    account.resetAccountState();
  }, [account.resetAccountState, currentUserId, resetSettingsFormState]);

  useEffect(() => {
    if (!isBootstrapReadyForActiveOrganization || !bootstrapSettings) {
      resetSettingsFormState();
      return;
    }

    applySavedSettings(bootstrapSettings);
  }, [applySavedSettings, bootstrapSettings, isBootstrapReadyForActiveOrganization, resetSettingsFormState]);

  useEffect(() => {
    if (!isBootstrapReadyForActiveOrganization || !account.canManageOrganizationMembers) {
      return;
    }

    const loadToken = organizationMembersLoadTokenRef.current + 1;
    organizationMembersLoadTokenRef.current = loadToken;
    account.resetOrganizationMemberState();

    void (async () => {
      try {
        const members = await api<OrganizationMemberSummary[]>("/api/organization/members");
        if (organizationMembersLoadTokenRef.current !== loadToken) {
          return;
        }
        account.syncOrganizationMembers(members);
      } catch (error) {
        if (organizationMembersLoadTokenRef.current !== loadToken) {
          return;
        }
        account.resetOrganizationMemberState();
        setGlobalError(
          error instanceof Error ? error.message : "작업공간 사용자 목록을 불러오지 못했습니다."
        );
      }
    })();
  }, [
    account.canManageOrganizationMembers,
    account.resetOrganizationMemberState,
    account.syncOrganizationMembers,
    bootstrapSettings,
    isBootstrapReadyForActiveOrganization,
    setGlobalError
  ]);

  const detectedMailProviderLabel = settingsForm
    ? MAIL_PROVIDER_CONFIG[inferMailProviderFromAddress(settingsForm.mailAddress, settingsForm.mailProvider)].label
    : MAIL_PROVIDER_CONFIG.gmail.label;

  const settingsSections = useMemo<
    Array<{ id: SettingsSectionId; step: number; title: string; done: boolean; summary: string }>
  >(
    () => [
      {
        id: "gmail",
        step: 1,
        title: "메일 연결",
        done: settingsHealth.mailReady,
        summary: settingsHealth.mailReady ? savedSettings?.imapUser || "준비됨" : "연결 테스트 필요"
      },
      {
        id: "popbill",
        step: 2,
        title: "발행 설정",
        done: settingsHealth.popbillReady && settingsHealth.operatorReady,
        summary: settingsHealth.popbillReady && settingsHealth.operatorReady ? "준비됨" : "필수값 입력"
      },
      {
        id: "helper",
        step: 3,
        title: "헬퍼 상태",
        done: helperReady,
        summary: helperReady
          ? `준비됨 · ${helperCertificateCount}건 읽음`
          : customerRenewalAssistantUpgradeState === "upgrade-required"
            ? "재설치 필요"
            : customerRenewalAssistantOnline
              ? customerRenewalAssistantUpgradeState === "upgrade-available"
                ? "업데이트 권장"
                : "헬퍼 연결됨 · 읽기 확인"
              : "헬퍼 준비 필요"
      },
      {
        id: "account",
        step: 4,
        title: "계정 / 작업공간",
        done: true,
        summary: publicAccount.canManageOrganizationMembers ? "사용자 / 비밀번호" : "비밀번호 변경"
      }
    ],
    [
      customerRenewalAssistantOnline,
      customerRenewalAssistantUpgradeState,
      helperCertificateCount,
      helperReady,
      publicAccount.canManageOrganizationMembers,
      savedSettings?.imapUser,
      settingsHealth.mailReady,
      settingsHealth.operatorReady,
      settingsHealth.popbillReady
    ]
  );

  const setupPendingCount = settingsSections.filter((section) => !section.done).length;
  const recommendedSettingsSection: SettingsSectionId = !settingsHealth.mailReady
    ? "gmail"
    : !(settingsHealth.popbillReady && settingsHealth.operatorReady)
      ? "popbill"
      : !helperReady
        ? "helper"
        : "account";
  const nextSettingsSection = settingsSections.find((section) => !section.done)?.id ?? "account";
  const settingsAutosaveLabel =
    settingsAutosaveState === "saving"
      ? "자동 저장 중"
      : settingsAutosaveState === "error"
        ? "저장 실패"
        : settingsAutosaveState === "pending"
          ? "저장 대기"
          : "자동 저장";

  const fetchStoredRenewalCertificatePassword = useCallback(async () => {
    const result = await api<{ password: string }>("/api/settings/renewal-certificate-password");
    return result.password.trim();
  }, []);

  const fetchStoredRenewalIssuePassword = useCallback(async () => {
    const result = await api<{ password: string }>("/api/settings/renewal-issue-password");
    return normalizeRenewalIssuePasswordInput(result.password.trim());
  }, []);

  const loadCurrentPopbillSharedPassword = useCallback(async () => {
    if (!settingsForm) return;
    const result = await api<{ password: string }>("/api/settings/popbill-shared-password");
    const nextForm = { ...settingsForm, popbillSharedPassword: result.password };
    settingsAutosaveBaselineRef.current = getSettingsPayloadSignature(nextForm);
    setSettingsAutosaveState("saved");
    setSettingsForm(nextForm);
    revealField("popbillSharedPassword");
  }, [revealField, setSettingsForm, settingsForm]);

  const loadCurrentRenewalCertificatePassword = useCallback(async () => {
    if (!settingsForm) return;
    const password = await fetchStoredRenewalCertificatePassword();
    onRenewalCertificatePasswordChange(password);
    const nextForm = { ...settingsForm, renewalCertificatePassword: password };
    settingsAutosaveBaselineRef.current = getSettingsPayloadSignature(nextForm);
    setSettingsAutosaveState("saved");
    setSettingsForm(nextForm);
    revealField("renewalCertificatePassword");
  }, [
    fetchStoredRenewalCertificatePassword,
    onRenewalCertificatePasswordChange,
    revealField,
    setSettingsForm,
    settingsForm
  ]);

  const loadCurrentRenewalIssuePassword = useCallback(async () => {
    if (!settingsForm) return;
    const password = await fetchStoredRenewalIssuePassword();
    onRenewalIssuePasswordChange(password);
    const nextForm = { ...settingsForm, renewalIssuePassword: password };
    settingsAutosaveBaselineRef.current = getSettingsPayloadSignature(nextForm);
    setSettingsAutosaveState("saved");
    setSettingsForm(nextForm);
    revealField("renewalIssuePassword");
  }, [
    fetchStoredRenewalIssuePassword,
    onRenewalIssuePasswordChange,
    revealField,
    setSettingsForm,
    settingsForm
  ]);

  const handleSettingsRenewalIssuePasswordChange = useCallback(
    (nextValue: string) => {
      const normalizedValue = normalizeRenewalIssuePasswordInput(nextValue);
      onRenewalIssuePasswordChange(normalizedValue.length === 6 ? normalizedValue : "");
      setSettingsForm((prev) => (prev ? { ...prev, renewalIssuePassword: normalizedValue } : prev));
    },
    [onRenewalIssuePasswordChange, setSettingsForm]
  );

  const handleSettingsMailAddressChange = useCallback(
    (nextAddress: string) => {
      setSettingsForm((prev) => {
        if (!prev) return prev;
        const nextProvider = inferMailProviderFromAddress(nextAddress, prev.mailProvider);
        const config = MAIL_PROVIDER_CONFIG[nextProvider];
        return {
          ...prev,
          mailAddress: nextAddress,
          mailProvider: nextProvider,
          imapHost: config.imapHost,
          imapPort: config.imapPort,
          imapSecure: config.imapSecure,
          smtpHost: config.smtpHost,
          smtpPort: config.smtpPort,
          smtpSecure: config.smtpSecure
        };
      });
    },
    [setSettingsForm]
  );

  const testMailSettings = useCallback(async () => {
    if (!settingsForm) return;
    const { normalized, payload } = buildMailSettingsSavePayload(settingsForm, savedSettings);
    const result = await api<{
      imapOk: boolean;
      imapMessage: string;
      smtpOk: boolean;
      smtpMessage: string;
      testMailSent: boolean;
    }>("/api/system/mail-test", {
      method: "POST",
      body: JSON.stringify({
        imapHost: payload.imapHost,
        imapPort: payload.imapPort,
        imapSecure: payload.imapSecure,
        imapUser: payload.imapUser,
        imapPass: payload.imapPass,
        imapMailbox: payload.imapMailbox,
        smtpHost: payload.smtpHost,
        smtpPort: payload.smtpPort,
        smtpSecure: payload.smtpSecure,
        smtpUser: payload.smtpUser,
        smtpPass: payload.smtpPass,
        smtpFromName: "AUTO-TAX",
        smtpFromEmail: payload.smtpFromEmail,
        notificationEmails: payload.notificationEmails
      })
    });

    const testSucceeded = result.imapOk && result.smtpOk;
    if (testSucceeded) {
      await api<AppSettings>("/api/settings", {
        method: "PUT",
        body: JSON.stringify(payload)
      });
      const verifiedSettings = await api<AppSettings>("/api/settings/mail-connection-verified", {
        method: "POST"
      });
      applySavedSettings(verifiedSettings, {
        syncForm: false,
        baselineForm: normalized
      });
    }

    await showAlert(
      `${MAIL_PROVIDER_CONFIG[normalized.mailProvider].label} 연결 테스트 결과\nIMAP: ${
        result.imapOk ? "성공" : "실패"
      }\n${result.imapMessage}\n\nSMTP: ${result.smtpOk ? "성공" : "실패"}\n${result.smtpMessage}\n\n테스트 메일 발송: ${
        result.testMailSent ? "예" : "아니오"
      }\n\n설정 저장: ${testSucceeded ? "성공" : "실패로 저장 안 함"}`,
      {
        title: "메일 연결 테스트 결과",
        tone: testSucceeded ? "success" : "warn"
      }
    );
  }, [applySavedSettings, savedSettings, settingsForm, showAlert]);

  const runMailSettingsTest = useCallback(
    async () => runAction("mail-test", testMailSettings, { reload: false }),
    [runAction, testMailSettings]
  );
  const runLoadCurrentPopbillSharedPassword = useCallback(
    async () => runAction("load-popbill-shared-password", loadCurrentPopbillSharedPassword, { reload: false }),
    [loadCurrentPopbillSharedPassword, runAction]
  );
  const runLoadCurrentRenewalCertificatePassword = useCallback(
    async () =>
      runAction("load-renewal-certificate-password", loadCurrentRenewalCertificatePassword, { reload: false }),
    [loadCurrentRenewalCertificatePassword, runAction]
  );
  const runLoadCurrentRenewalIssuePassword = useCallback(
    async () => runAction("load-renewal-issue-password", loadCurrentRenewalIssuePassword, { reload: false }),
    [loadCurrentRenewalIssuePassword, runAction]
  );
  const runRefreshCustomerRenewalAssistant = useCallback(
    async () =>
      runAction("refresh-customer-renewal-helper", refreshCustomerRenewalAssistant, { reload: false }),
    [refreshCustomerRenewalAssistant, runAction]
  );

  useEffect(() => {
    if (!settingsForm) {
      return;
    }

    const signature = getSettingsPayloadSignature(settingsForm);

    if (!settingsAutosaveBaselineRef.current) {
      settingsAutosaveBaselineRef.current = signature;
      setSettingsAutosaveState("saved");
      return;
    }

    if (signature === settingsAutosaveBaselineRef.current) {
      setSettingsAutosaveState((prev) => (prev === "error" ? prev : "saved"));
      return;
    }

    setSettingsAutosaveState("pending");

    if (busyKey !== null || !canAutosaveSettings(settingsForm)) {
      return;
    }

    const timerId = window.setTimeout(async () => {
      try {
        setSettingsAutosaveState("saving");
        setGlobalError("");
        const { payload } = buildSettingsPayload(settingsForm);
        const nextSavedSettings = await api<AppSettings>("/api/settings", {
          method: "PUT",
          body: JSON.stringify(payload)
        });
        applySavedSettings(nextSavedSettings, {
          syncForm: false,
          baselineForm: settingsForm
        });
      } catch (saveError) {
        setSettingsAutosaveState("error");
        setGlobalError(saveError instanceof Error ? saveError.message : "설정 자동 저장에 실패했습니다.");
      }
    }, 700);

    return () => window.clearTimeout(timerId);
  }, [applySavedSettings, busyKey, setGlobalError, settingsForm]);

  return {
    savedSettings,
    settingsForm,
    setSettingsForm,
    settingsHealth,
    settingsSections,
    setupPendingCount,
    nextSettingsSection,
    recommendedSettingsSection,
    settingsAutosaveState,
    settingsAutosaveLabel,
    detectedMailProviderLabel,
    mailPasswordConfigured: savedSettings?.mailPasswordConfigured ?? false,
    popbillSharedPasswordConfigured: savedSettings?.popbillSharedPasswordConfigured ?? false,
    renewalCertificatePasswordConfigured: savedSettings?.renewalCertificatePasswordConfigured ?? false,
    renewalIssuePasswordConfigured: savedSettings?.renewalIssuePasswordConfigured ?? false,
    applySavedSettings,
    account: publicAccount,
    handleSettingsMailAddressChange,
    handleSettingsRenewalIssuePasswordChange,
    testMailSettings,
    loadCurrentPopbillSharedPassword,
    loadCurrentRenewalCertificatePassword,
    loadCurrentRenewalIssuePassword,
    runMailSettingsTest,
    runLoadCurrentPopbillSharedPassword,
    runLoadCurrentRenewalCertificatePassword,
    runLoadCurrentRenewalIssuePassword,
    runRefreshCustomerRenewalAssistant
  };
}

export type SettingsScreenState = ReturnType<typeof useSettingsScreenState>;
