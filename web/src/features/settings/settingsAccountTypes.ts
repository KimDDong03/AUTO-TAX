import type { Dispatch, SetStateAction } from "react";
import type { OrganizationMemberSummary } from "../../types";

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
