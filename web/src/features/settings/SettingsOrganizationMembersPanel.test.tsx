import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import type { OrganizationMemberSummary } from "../../types";
import {
  SettingsOrganizationMembersPanel
} from "./SettingsOrganizationMembersPanel";
import type { SettingsFeatureActionAdapters, SettingsFeatureRevealAdapters } from "./createSettingsActionAdapters";
import {
  createEmptyOrganizationMemberForm,
  createEmptyPasswordResetForm,
  type SettingsAccountState
} from "./settingsAccountTypes";

type TestElement = React.ReactElement<
  Record<string, unknown> & {
    children?: React.ReactNode;
  }
>;

function readElementNode(element: TestElement): React.ReactNode {
  if (typeof element.type === "function") {
    const renderElement = element.type as (
      props: typeof element.props
    ) => React.ReactNode;
    return renderElement(element.props);
  }

  return element.props.children;
}

function collectText(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }

  if (!node) {
    return "";
  }

  if (Array.isArray(node)) {
    return node.map((child) => collectText(child)).join(" ");
  }

  if (React.isValidElement(node)) {
    const element = node as TestElement;
    return collectText(readElementNode(element));
  }

  return "";
}

function findElement(
  node: React.ReactNode,
  predicate: (element: TestElement) => boolean
): TestElement | null {
  if (!node) {
    return null;
  }

  if (Array.isArray(node)) {
    for (const child of node) {
      const match = findElement(child, predicate);
      if (match) {
        return match;
      }
    }
    return null;
  }

  if (!React.isValidElement(node)) {
    return null;
  }

  const element = node as TestElement;

  if (predicate(element)) {
    return element;
  }

  return findElement(readElementNode(element), predicate);
}

function findButtonByText(tree: React.ReactNode, text: string): TestElement | null {
  return findElement(
    tree,
    (element) => element.type === "button" && collectText(element).includes(text)
  );
}

function findInputByPlaceholder(tree: React.ReactNode, placeholder: string): TestElement | null {
  return findElement(
    tree,
    (element) =>
      element.type === "input" && element.props.placeholder === placeholder
  );
}

function createMember(overrides: Partial<OrganizationMemberSummary> = {}): OrganizationMemberSummary {
  return {
    membershipId: overrides.membershipId ?? "member-1",
    userId: overrides.userId ?? "user-1",
    loginId: overrides.loginId ?? "member01",
    displayName: overrides.displayName ?? "담당자",
    role: overrides.role ?? "member",
    createdAt: overrides.createdAt ?? "2026-04-15T00:00:00.000Z"
  };
}

function createAccount(
  overrides: Partial<SettingsAccountState> = {}
): SettingsAccountState {
  return {
    canManageOrganizationMembers: true,
    organizationMembers: [],
    organizationMemberItems: [],
    passwordChangeForm: {
      nextPassword: "",
      confirmPassword: ""
    },
    passwordResetForm: createEmptyPasswordResetForm(),
    passwordResetTarget: null,
    organizationMemberForm: createEmptyOrganizationMemberForm(),
    setPasswordChangeForm: () => {
      throw new Error("unused");
    },
    setPasswordResetForm: () => {
      throw new Error("unused");
    },
    setOrganizationMemberForm: () => {
      throw new Error("unused");
    },
    changePassword: async () => {},
    createOrganizationMember: async () => {},
    openMemberPasswordReset: () => {},
    removeOrganizationMember: async () => {},
    submitMemberPasswordReset: async () => {},
    cancelPasswordReset: () => {},
    ...overrides
  };
}

function createReveals(): Pick<
  SettingsFeatureRevealAdapters,
  "organizationMemberPassword" | "memberResetPassword"
> {
  return {
    organizationMemberPassword: {
      visible: false,
      toggle: () => {}
    },
    memberResetPassword: {
      nextPassword: {
        visible: false,
        toggle: () => {}
      },
      confirmPassword: {
        visible: false,
        toggle: () => {}
      }
    }
  };
}

function createActions(
  overrides: Partial<
    Pick<
      SettingsFeatureActionAdapters,
      "createOrganizationMember" | "removeOrganizationMember" | "resetOrganizationMemberPassword"
    >
  > = {}
): Pick<
  SettingsFeatureActionAdapters,
  "createOrganizationMember" | "removeOrganizationMember" | "resetOrganizationMemberPassword"
> {
  return {
    createOrganizationMember: async () => {},
    removeOrganizationMember: async () => {},
    resetOrganizationMemberPassword: async () => {},
    ...overrides
  };
}

function renderPanel({
  account = createAccount(),
  actions = createActions()
}: {
  account?: SettingsAccountState;
  actions?: Pick<
    SettingsFeatureActionAdapters,
    "createOrganizationMember" | "removeOrganizationMember" | "resetOrganizationMemberPassword"
  >;
} = {}) {
  return SettingsOrganizationMembersPanel({
    account,
    actions,
    reveals: createReveals(),
    busyKey: null,
    formatDateTime: (value) => value ?? "-"
  });
}

test("SettingsOrganizationMembersPanel hides member controls without owner permission", () => {
  const tree = renderPanel({
    account: createAccount({
      canManageOrganizationMembers: false
    })
  });
  const createButton = findButtonByText(tree, "사용자 추가");

  assert.match(collectText(tree), /사용자 관리 권한 없음/);
  assert.match(collectText(tree), /owner만 내부 사용자를 관리할 수 있습니다\./);
  assert.equal(createButton, null);
});

test("SettingsOrganizationMembersPanel keeps owner restriction text and reset action wiring", async () => {
  const ownerMember = createMember({
    membershipId: "owner-1",
    userId: "owner-user",
    loginId: "owner01",
    displayName: "Owner",
    role: "owner"
  });
  const workspaceMember = createMember({
    membershipId: "member-2",
    userId: "user-2",
    loginId: "member02",
    displayName: "팀원"
  });
  const resetTargets: OrganizationMemberSummary[] = [];
  const removeCalls: string[] = [];
  const tree = renderPanel({
    account: createAccount({
      organizationMembers: [ownerMember, workspaceMember],
      organizationMemberItems: [
        {
          member: ownerMember,
          roleLabel: "owner",
          isCurrentUser: false,
          isOwner: true,
          canRemove: false,
          canResetPassword: false,
          isResetTarget: false
        },
        {
          member: workspaceMember,
          roleLabel: "member",
          isCurrentUser: false,
          isOwner: false,
          canRemove: true,
          canResetPassword: true,
          isResetTarget: false
        }
      ],
      openMemberPasswordReset: (member) => {
        resetTargets.push(member);
      }
    }),
    actions: createActions({
      removeOrganizationMember: async (membershipId, action) => {
        removeCalls.push(membershipId);
        await action();
      }
    })
  });
  const resetButton = findButtonByText(tree, "임시 비밀번호 재설정");

  assert.match(collectText(tree), /owner는 제거할 수 없습니다\./);
  assert.match(
    collectText(tree),
    /owner 계정 비밀번호는 플랫폼 관리자 탭에서 재설정합니다\./
  );
  assert.ok(resetButton);

  (resetButton.props.onClick as () => void)();

  assert.deepEqual(resetTargets, [workspaceMember]);
  const removeButton = findElement(
    tree,
    (element) =>
      element.type === "button" &&
      collectText(element) === "제거"
  );
  assert.ok(removeButton);

  await (removeButton.props.onClick as () => Promise<void>)();

  assert.deepEqual(removeCalls, ["member-2"]);
});

test("SettingsOrganizationMembersPanel wires create form updates and inline reset save", async () => {
  const member = createMember({
    membershipId: "member-3",
    loginId: "member03",
    displayName: "리셋 대상"
  });
  const created: Array<() => Promise<void>> = [];
  const resetCalls: Array<{
    membershipId: string;
    action: () => Promise<void>;
  }> = [];
  let submittedReset = false;
  let updatedCreateForm:
    | ReturnType<typeof createEmptyOrganizationMemberForm>
    | null = null;
  let updatedResetForm:
    | ReturnType<typeof createEmptyPasswordResetForm>
    | null = null;
  const tree = renderPanel({
    account: createAccount({
      organizationMembers: [member],
      organizationMemberItems: [
        {
          member,
          roleLabel: "member",
          isCurrentUser: false,
          isOwner: false,
          canRemove: true,
          canResetPassword: true,
          isResetTarget: true
        }
      ],
      organizationMemberForm: {
        loginId: "",
        displayName: "",
        password: ""
      },
      passwordResetForm: {
        nextPassword: "",
        confirmPassword: ""
      },
      setOrganizationMemberForm: (nextState) => {
        updatedCreateForm =
          typeof nextState === "function"
            ? nextState(createEmptyOrganizationMemberForm())
            : nextState;
      },
      setPasswordResetForm: (nextState) => {
        updatedResetForm =
          typeof nextState === "function"
            ? nextState(createEmptyPasswordResetForm())
            : nextState;
      },
      submitMemberPasswordReset: async () => {
        submittedReset = true;
      }
    }),
    actions: createActions({
      createOrganizationMember: async (action) => {
        created.push(action);
      },
      resetOrganizationMemberPassword: async (membershipId, action) => {
        resetCalls.push({ membershipId, action });
      }
    })
  });
  const loginIdInput = findInputByPlaceholder(tree, "예: team01");
  const createButton = findButtonByText(tree, "사용자 추가");
  const nextPasswordInput = findInputByPlaceholder(tree, "8자 이상 입력");
  const saveResetButton = findButtonByText(tree, "임시 비밀번호 저장");

  assert.ok(loginIdInput);
  assert.ok(createButton);
  assert.ok(nextPasswordInput);
  assert.ok(saveResetButton);

  (
    loginIdInput.props.onChange as (event: { target: { value: string } }) => void
  )({
    target: { value: "team02" }
  });
  (
    nextPasswordInput.props.onChange as (
      event: { target: { value: string } }
    ) => void
  )({
    target: { value: "temp-pass-01" }
  });
  await (createButton.props.onClick as () => Promise<void>)();
  await (saveResetButton.props.onClick as () => Promise<void>)();

  assert.deepEqual(updatedCreateForm, {
    loginId: "team02",
    displayName: "",
    password: ""
  });
  assert.deepEqual(updatedResetForm, {
    nextPassword: "temp-pass-01",
    confirmPassword: ""
  });
  assert.equal(created.length, 1);
  await created[0]();
  assert.deepEqual(
    resetCalls.map(({ membershipId }) => membershipId),
    ["member-3"]
  );
  await resetCalls[0]!.action();
  assert.equal(submittedReset, true);
});
