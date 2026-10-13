/*
 * Staff roles (backoffice spec D3, 6). Client-safe: navigation and buttons use
 * these to hide what a role cannot do, while Postgres (require_admin) stays
 * the authority on every call.
 */

export type AdminRole = "viewer" | "operator" | "owner";

/** Lowest to highest. */
export const ADMIN_ROLES = ["viewer", "operator", "owner"] as const satisfies readonly AdminRole[];

export const ROLE_LABEL: Record<AdminRole, "열람자" | "운영자" | "관리자"> = {
  viewer: "열람자",
  operator: "운영자",
  owner: "관리자",
};

const RANK: Record<AdminRole, 1 | 2 | 3> = { viewer: 1, operator: 2, owner: 3 };

export function roleRank(role: AdminRole): 1 | 2 | 3 {
  return RANK[role];
}

/** True when `actual` is at least `min`. */
export function hasRole(actual: AdminRole, min: AdminRole): boolean {
  return RANK[actual] >= RANK[min];
}

export function isAdminRole(value: unknown): value is AdminRole {
  return value === "viewer" || value === "operator" || value === "owner";
}
