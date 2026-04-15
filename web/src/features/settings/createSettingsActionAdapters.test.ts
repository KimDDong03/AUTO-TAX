import assert from "node:assert/strict";
import test from "node:test";
import { createSettingsActionAdapters } from "./createSettingsActionAdapters";

test("createSettingsActionAdapters maps reveal state to feature-scoped toggles", () => {
  const toggledKeys: string[] = [];
  const orchestration = createSettingsActionAdapters({
    revealedFields: {
      mailPassword: true,
      renewalIssuePassword: true,
      nextPassword: true
    },
    toggleRevealField: (fieldKey) => {
      toggledKeys.push(fieldKey);
    },
    runAction: async () => {}
  });

  assert.equal(orchestration.reveals.mailPassword.visible, true);
  assert.equal(orchestration.reveals.popbillSharedPassword.visible, false);
  assert.equal(orchestration.reveals.accountPassword.nextPassword.visible, true);
  assert.equal(
    orchestration.reveals.accountPassword.confirmPassword.visible,
    false
  );

  orchestration.reveals.memberResetPassword.confirmPassword.toggle();
  orchestration.reveals.renewalIssuePassword.toggle();

  assert.deepEqual(toggledKeys, [
    "memberResetConfirmPassword",
    "renewalIssuePassword"
  ]);
});

test("createSettingsActionAdapters wraps member/account actions with stable keys", async () => {
  const actionCalls: Array<{
    key: string;
    reload: boolean | undefined;
  }> = [];
  const orchestration = createSettingsActionAdapters({
    revealedFields: {},
    toggleRevealField: () => {},
    runAction: async (key, action, options) => {
      actionCalls.push({
        key,
        reload: options?.reload
      });
      await action();
    }
  });
  const executed: string[] = [];

  await orchestration.actions.changePassword(async () => {
    executed.push("change");
  });
  await orchestration.actions.createOrganizationMember(async () => {
    executed.push("create");
  });
  await orchestration.actions.removeOrganizationMember("m-1", async () => {
    executed.push("remove");
  });
  await orchestration.actions.resetOrganizationMemberPassword(
    "m-2",
    async () => {
      executed.push("reset");
    }
  );

  assert.deepEqual(executed, ["change", "create", "remove", "reset"]);
  assert.deepEqual(actionCalls, [
    {
      key: "change-password",
      reload: false
    },
    {
      key: "create-organization-member",
      reload: false
    },
    {
      key: "remove-organization-member-m-1",
      reload: false
    },
    {
      key: "reset-member-password-m-2",
      reload: false
    }
  ]);
});
