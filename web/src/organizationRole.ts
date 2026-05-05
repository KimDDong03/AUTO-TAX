import type { OrganizationMemberRole } from "./types";

export function getOrganizationRoleLabel(role: OrganizationMemberRole | null): string {
  switch (role) {
    case "owner":
      return "소유자";
    case "admin":
    case "operator":
      return "멤버";
    case "viewer":
      return "조회전용";
    case null:
      return "플랫폼 관리자";
    default:
      return role ?? "플랫폼 관리자";
  }
}
