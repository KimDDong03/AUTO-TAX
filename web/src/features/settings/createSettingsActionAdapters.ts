export type SettingsRunAction = (
  key: string,
  action: () => Promise<void>,
  options?: { reload?: boolean }
) => Promise<void>;

export type SettingsToggleRevealField = (fieldKey: string) => void;

export type SettingsPasswordReveal = {
  visible: boolean;
  toggle: () => void;
};

export type SettingsPasswordRevealPair = {
  nextPassword: SettingsPasswordReveal;
  confirmPassword: SettingsPasswordReveal;
};

export type SettingsFeatureRevealAdapters = {
  mailPassword: SettingsPasswordReveal;
  popbillSharedPassword: SettingsPasswordReveal;
  renewalIssuePassword: SettingsPasswordReveal;
  renewalCertificatePassword: SettingsPasswordReveal;
  accountPassword: SettingsPasswordRevealPair;
  organizationMemberPassword: SettingsPasswordReveal;
  memberResetPassword: SettingsPasswordRevealPair;
};

export type SettingsFeatureActionAdapters = {
  changePassword: (action: () => Promise<void>) => Promise<void>;
  createOrganizationMember: (action: () => Promise<void>) => Promise<void>;
  removeOrganizationMember: (
    membershipId: string,
    action: () => Promise<void>
  ) => Promise<void>;
  resetOrganizationMemberPassword: (
    membershipId: string,
    action: () => Promise<void>
  ) => Promise<void>;
};

export type SettingsFeatureOrchestration = {
  reveals: SettingsFeatureRevealAdapters;
  actions: SettingsFeatureActionAdapters;
};

function createPasswordRevealAdapter(
  fieldKey: string,
  revealedFields: Record<string, boolean>,
  toggleRevealField: SettingsToggleRevealField
): SettingsPasswordReveal {
  return {
    visible: Boolean(revealedFields[fieldKey]),
    toggle: () => toggleRevealField(fieldKey)
  };
}

export function createSettingsActionAdapters({
  revealedFields,
  toggleRevealField,
  runAction
}: {
  revealedFields: Record<string, boolean>;
  toggleRevealField: SettingsToggleRevealField;
  runAction: SettingsRunAction;
}): SettingsFeatureOrchestration {
  return {
    reveals: {
      mailPassword: createPasswordRevealAdapter(
        "mailPassword",
        revealedFields,
        toggleRevealField
      ),
      popbillSharedPassword: createPasswordRevealAdapter(
        "popbillSharedPassword",
        revealedFields,
        toggleRevealField
      ),
      renewalIssuePassword: createPasswordRevealAdapter(
        "renewalIssuePassword",
        revealedFields,
        toggleRevealField
      ),
      renewalCertificatePassword: createPasswordRevealAdapter(
        "renewalCertificatePassword",
        revealedFields,
        toggleRevealField
      ),
      accountPassword: {
        nextPassword: createPasswordRevealAdapter(
          "nextPassword",
          revealedFields,
          toggleRevealField
        ),
        confirmPassword: createPasswordRevealAdapter(
          "confirmPassword",
          revealedFields,
          toggleRevealField
        )
      },
      organizationMemberPassword: createPasswordRevealAdapter(
        "organizationMemberPassword",
        revealedFields,
        toggleRevealField
      ),
      memberResetPassword: {
        nextPassword: createPasswordRevealAdapter(
          "memberResetNextPassword",
          revealedFields,
          toggleRevealField
        ),
        confirmPassword: createPasswordRevealAdapter(
          "memberResetConfirmPassword",
          revealedFields,
          toggleRevealField
        )
      }
    },
    actions: {
      changePassword: (action) =>
        runAction("change-password", action, {
          reload: false
        }),
      createOrganizationMember: (action) =>
        runAction("create-organization-member", action, {
          reload: false
        }),
      removeOrganizationMember: (membershipId, action) =>
        runAction(`remove-organization-member-${membershipId}`, action, {
          reload: false
        }),
      resetOrganizationMemberPassword: (membershipId, action) =>
        runAction(`reset-member-password-${membershipId}`, action, {
          reload: false
        })
    }
  };
}
