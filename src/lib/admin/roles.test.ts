import { describe, expect, it } from "vitest";

import { ADMIN_ROLES, ROLE_LABEL, hasRole, isAdminRole, roleRank } from "./roles";

describe("roles", () => {
  it("ranks viewer < operator < owner", () => {
    expect(roleRank("viewer")).toBe(1);
    expect(roleRank("operator")).toBe(2);
    expect(roleRank("owner")).toBe(3);
  });

  it("lists the roles from lowest to highest", () => {
    expect(ADMIN_ROLES).toEqual(["viewer", "operator", "owner"]);
  });

  it("allows a role at or above the minimum only", () => {
    expect(hasRole("viewer", "viewer")).toBe(true);
    expect(hasRole("viewer", "operator")).toBe(false);
    expect(hasRole("operator", "viewer")).toBe(true);
    expect(hasRole("operator", "owner")).toBe(false);
    expect(hasRole("owner", "operator")).toBe(true);
    expect(hasRole("owner", "owner")).toBe(true);
  });

  it("labels roles with the spec names", () => {
    expect(ROLE_LABEL).toEqual({ viewer: "열람자", operator: "운영자", owner: "관리자" });
  });

  it("recognises only the three staff roles", () => {
    expect(isAdminRole("owner")).toBe(true);
    expect(isAdminRole("admin")).toBe(false);
    expect(isAdminRole(null)).toBe(false);
  });
});
