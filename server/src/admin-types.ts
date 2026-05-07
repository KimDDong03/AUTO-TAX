export type OpsWorkspaceSummary = {
  organizationId: string;
  organizationName: string;
  organizationPlanCode: string;
  organizationStatus: "trial" | "active" | "suspended" | "churned";
  monthlyIssueLimit: number;
  managedCustomerCount: number;
  ownerLoginId: string | null;
  ownerDisplayName: string | null;
  memberCount: number;
  issuedDraftCount: number;
  currentMonthIssuedDraftCount: number;
  lastIssuedAt: string | null;
  createdAt: string;
};

export type OrganizationMemberSummary = {
  membershipId: string;
  userId: string;
  loginId: string | null;
  displayName: string | null;
  role: "owner" | "member";
  createdAt: string;
};

export type AuthUserSummary = {
  id: string;
  email: string | null;
  loginId: string | null;
  displayName: string | null;
};
