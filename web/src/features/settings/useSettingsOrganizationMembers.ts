import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { api } from "../../api";
import type { OrganizationMemberRole, OrganizationMemberSummary } from "../../types";
import { isStrongPassword, PASSWORD_POLICY_MESSAGE } from "../auth/passwordPolicy";
import {
  createEmptyOrganizationMemberForm,
  createEmptyPasswordResetForm,
  type MemberPasswordResetTarget,
  type OrganizationMemberFormState,
  type PasswordResetFormState,
  type SettingsOrganizationMemberItem
} from "./settingsAccountTypes";

type UseSettingsOrganizationMembersArgs = {
  activeOrganizationId: string | null;
  bootstrapOrganizationId: string | null;
  activeOrganizationRole: OrganizationMemberRole | null;
  bootstrapReady: boolean;
  currentUserId: string | null;
  setGlobalError: (message: string) => void;
  showAlert: (
    message: string,
    options?: { title?: string; tone?: "default" | "warn" | "danger" | "success" }
  ) => Promise<void>;
  showConfirm: (
    message: string,
    options?: { title?: string; tone?: "default" | "warn" | "danger"; confirmLabel?: string }
  ) => Promise<boolean>;
};

type SettingsOrganizationMembersState = {
  canManageOrganizationMembers: boolean;
  organizationMembers: OrganizationMemberSummary[];
  organizationMemberItems: SettingsOrganizationMemberItem[];
  passwordResetForm: PasswordResetFormState;
  passwordResetTarget: MemberPasswordResetTarget | null;
  organizationMemberForm: OrganizationMemberFormState;
  setPasswordResetForm: Dispatch<SetStateAction<PasswordResetFormState>>;
  setOrganizationMemberForm: Dispatch<SetStateAction<OrganizationMemberFormState>>;
  createOrganizationMember: () => Promise<void>;
  openMemberPasswordReset: (member: OrganizationMemberSummary) => void;
  removeOrganizationMember: (member: OrganizationMemberSummary) => Promise<void>;
  submitMemberPasswordReset: () => Promise<void>;
  cancelPasswordReset: () => void;
  resetOrganizationMemberState: () => void;
};

function getWorkspaceMemberRoleLabel(role: OrganizationMemberSummary["role"]): string {
  return role === "owner" ? "관리자" : "사용자";
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : error instanceof Error
      ? error.name === "AbortError"
      : false;
}

export function useSettingsOrganizationMembers({
  activeOrganizationId,
  bootstrapOrganizationId,
  activeOrganizationRole,
  bootstrapReady,
  currentUserId,
  setGlobalError,
  showAlert,
  showConfirm
}: UseSettingsOrganizationMembersArgs): SettingsOrganizationMembersState {
  const [passwordResetForm, setPasswordResetForm] = useState<PasswordResetFormState>(
    createEmptyPasswordResetForm
  );
  const [passwordResetTarget, setPasswordResetTarget] =
    useState<MemberPasswordResetTarget | null>(null);
  const [organizationMembers, setOrganizationMembers] = useState<OrganizationMemberSummary[]>([]);
  const [organizationMemberForm, setOrganizationMemberForm] =
    useState<OrganizationMemberFormState>(createEmptyOrganizationMemberForm);
  const activeLoadControllerRef = useRef<AbortController | null>(null);
  const canManageOrganizationMembers =
    activeOrganizationId !== null &&
    activeOrganizationId === bootstrapOrganizationId &&
    activeOrganizationRole === "owner";

  const cancelOrganizationMembersLoad = useCallback(() => {
    activeLoadControllerRef.current?.abort();
    activeLoadControllerRef.current = null;
  }, []);

  const cancelPasswordReset = useCallback(() => {
    setPasswordResetTarget(null);
    setPasswordResetForm(createEmptyPasswordResetForm());
  }, []);

  const resetOrganizationMemberState = useCallback(() => {
    cancelOrganizationMembersLoad();
    setOrganizationMembers([]);
    setOrganizationMemberForm(createEmptyOrganizationMemberForm());
    cancelPasswordReset();
  }, [cancelOrganizationMembersLoad, cancelPasswordReset]);

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

    if (!isStrongPassword(nextPassword)) {
      throw new Error(PASSWORD_POLICY_MESSAGE);
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

  useEffect(() => {
    if (currentUserId !== null && bootstrapReady && canManageOrganizationMembers) {
      return;
    }

    resetOrganizationMemberState();
  }, [bootstrapReady, canManageOrganizationMembers, currentUserId, resetOrganizationMemberState]);

  useEffect(() => {
    if (currentUserId === null || !bootstrapReady || !canManageOrganizationMembers) {
      return;
    }

    const loadController = new AbortController();
    activeLoadControllerRef.current = loadController;
    setOrganizationMembers([]);
    setOrganizationMemberForm(createEmptyOrganizationMemberForm());
    cancelPasswordReset();

    void (async () => {
      try {
        const members = await api<OrganizationMemberSummary[]>("/api/organization/members", {
          signal: loadController.signal
        });
        if (activeLoadControllerRef.current !== loadController || loadController.signal.aborted) {
          return;
        }
        setOrganizationMembers(members);
      } catch (error) {
        if (activeLoadControllerRef.current !== loadController || isAbortError(error) || loadController.signal.aborted) {
          return;
        }
        setOrganizationMembers([]);
        setOrganizationMemberForm(createEmptyOrganizationMemberForm());
        cancelPasswordReset();
        setGlobalError(
          error instanceof Error ? error.message : "작업공간 사용자 목록을 불러오지 못했습니다."
        );
      } finally {
        if (activeLoadControllerRef.current === loadController) {
          activeLoadControllerRef.current = null;
        }
      }
    })();

    return () => {
      if (activeLoadControllerRef.current === loadController) {
        loadController.abort();
        activeLoadControllerRef.current = null;
      } else {
        loadController.abort();
      }
    };
  }, [
    bootstrapReady,
    canManageOrganizationMembers,
    cancelPasswordReset,
    currentUserId,
    setGlobalError
  ]);

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
    passwordResetForm,
    passwordResetTarget,
    organizationMemberForm,
    setPasswordResetForm,
    setOrganizationMemberForm,
    createOrganizationMember,
    openMemberPasswordReset,
    removeOrganizationMember,
    submitMemberPasswordReset,
    cancelPasswordReset,
    resetOrganizationMemberState
  };
}
