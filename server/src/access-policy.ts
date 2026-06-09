import type { OrganizationMemberRole } from "./supabase.js";

export function isOrganizationOwnerRole(
  role: OrganizationMemberRole | null | undefined
): role is "owner" {
  return role === "owner";
}

export function isOrganizationAdminRole(
  role: OrganizationMemberRole | null | undefined
): role is "owner" | "admin" {
  return role === "owner" || role === "admin";
}

export function isWorkspaceEditorRole(
  role: OrganizationMemberRole | null | undefined
): role is "owner" | "admin" | "operator" {
  return role === "owner" || role === "admin" || role === "operator";
}
