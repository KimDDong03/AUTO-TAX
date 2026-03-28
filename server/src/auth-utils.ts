export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizeLoginId(value: string): string {
  return value.trim().toLowerCase();
}

export function createWorkspaceLoginEmail(loginId: string): string {
  return `${normalizeLoginId(loginId)}@workspace.auto-tax.local`;
}

export function isEmailLikeAccount(value: string): boolean {
  return value.includes("@");
}
