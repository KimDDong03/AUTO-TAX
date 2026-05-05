import { useCallback, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { updateUserSafely } from "../../supabase";
import type { OrganizationMemberRole } from "../../types";
import {
  createEmptyPasswordChangeForm,
  type PasswordChangeFormState,
  type SettingsAccountState
} from "./settingsAccountTypes";
import { useSettingsOrganizationMembers } from "./useSettingsOrganizationMembers";

export type UseSettingsAccountFacadeArgs = {
  activeOrganizationId: string | null;
  bootstrapOrganizationId: string | null;
  activeOrganizationRole: OrganizationMemberRole | null;
  currentUserId: string | null;
  setGlobalError: (message: string) => void;
  showAlert: (
    message: string,
    options?: { title?: string; tone?: "default" | "warn" | "danger" | "success" }
  ) => Promise<void>;
  showConfirm: (
    message: string,
    options?: {
      title?: string;
      tone?: "default" | "warn" | "danger";
      confirmLabel?: string;
    }
  ) => Promise<boolean>;
};

export type SettingsAccountFacade = SettingsAccountState & {
  resetAccountState: () => void;
};

export function useSettingsAccountFacade({
  activeOrganizationId,
  bootstrapOrganizationId,
  activeOrganizationRole,
  currentUserId,
  setGlobalError,
  showAlert,
  showConfirm
}: UseSettingsAccountFacadeArgs): SettingsAccountFacade {
  const organizationMembers = useSettingsOrganizationMembers({
    activeOrganizationId,
    bootstrapOrganizationId,
    activeOrganizationRole,
    bootstrapReady:
      activeOrganizationId !== null &&
      activeOrganizationId === bootstrapOrganizationId,
    currentUserId,
    setGlobalError,
    showAlert,
    showConfirm
  });
  const [passwordChangeForm, setPasswordChangeForm] =
    useState<PasswordChangeFormState>(createEmptyPasswordChangeForm);

  const resetAccountState = useCallback(() => {
    setPasswordChangeForm(createEmptyPasswordChangeForm());
    organizationMembers.resetOrganizationMemberState();
  }, [organizationMembers.resetOrganizationMemberState]);

  const changePassword = useCallback(async () => {
    const nextPassword = passwordChangeForm.nextPassword.trim();
    const confirmPassword = passwordChangeForm.confirmPassword.trim();

    if (nextPassword.length < 8) {
      throw new Error("새 비밀번호는 8자 이상으로 입력하세요.");
    }

    if (nextPassword !== confirmPassword) {
      throw new Error("새 비밀번호와 확인 값이 일치하지 않습니다.");
    }

    const { error: updateError } = await updateUserSafely({
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

  return {
    canManageOrganizationMembers: organizationMembers.canManageOrganizationMembers,
    organizationMembers: organizationMembers.organizationMembers,
    organizationMemberItems: organizationMembers.organizationMemberItems,
    passwordChangeForm,
    passwordResetForm: organizationMembers.passwordResetForm,
    passwordResetTarget: organizationMembers.passwordResetTarget,
    organizationMemberForm: organizationMembers.organizationMemberForm,
    setPasswordChangeForm:
      setPasswordChangeForm as Dispatch<SetStateAction<PasswordChangeFormState>>,
    setPasswordResetForm: organizationMembers.setPasswordResetForm,
    setOrganizationMemberForm: organizationMembers.setOrganizationMemberForm,
    changePassword,
    createOrganizationMember: organizationMembers.createOrganizationMember,
    openMemberPasswordReset: organizationMembers.openMemberPasswordReset,
    removeOrganizationMember: organizationMembers.removeOrganizationMember,
    submitMemberPasswordReset: organizationMembers.submitMemberPasswordReset,
    cancelPasswordReset: organizationMembers.cancelPasswordReset,
    resetAccountState
  };
}
