import { describe, expect, it } from "vitest";

import { gateFromWhoami, parseWhoami, type Whoami } from "./whoami";

const USER_ID = "6f1c2a8e-3b7d-4c55-9a10-2f0e8b1d4c77";

const notStaff: Whoami = {
  userId: USER_ID,
  email: null,
  admin: false,
  role: null,
  displayName: null,
  mfaRequired: false,
  aal: "aal1",
  mfaEnrolled: false,
  ready: false,
  hasAppAccount: true,
};

const owner: Whoami = {
  userId: USER_ID,
  email: "admin@agentuncle.local",
  admin: true,
  role: "owner",
  displayName: "대표",
  mfaRequired: false,
  aal: "aal1",
  mfaEnrolled: false,
  ready: true,
  hasAppAccount: false,
};

describe("parseWhoami", () => {
  it("parses the non-staff fixture", () => {
    expect(parseWhoami(notStaff)).toEqual(notStaff);
  });

  it("parses a ready owner", () => {
    expect(parseWhoami(owner)).toEqual(owner);
  });

  it("rejects an unknown role and a malformed payload", () => {
    expect(parseWhoami({ ...owner, role: "admin" })).toBeNull();
    expect(parseWhoami({ ...owner, admin: "yes" })).toBeNull();
    expect(parseWhoami(null)).toBeNull();
    expect(parseWhoami("owner")).toBeNull();
  });

  it("reads an unexpected assurance level as aal1", () => {
    expect(parseWhoami({ ...owner, aal: "aal3" })?.aal).toBe("aal1");
  });
});

describe("gateFromWhoami", () => {
  it("routes a non-staff user to no_access with the email and app account flag", () => {
    expect(gateFromWhoami({ ...notStaff, email: "spare@agentuncle.local" }, "local")).toEqual({
      state: "no_access",
      email: "spare@agentuncle.local",
      hasAppAccount: true,
    });
  });

  it("routes a revoked or role-less row to no_access", () => {
    expect(gateFromWhoami({ ...owner, admin: true, role: null, ready: false }, "local")).toMatchObject({ state: "no_access" });
  });

  it("asks for MFA when the staff member must use it and is at aal1", () => {
    expect(
      gateFromWhoami({ ...owner, mfaRequired: true, ready: false, mfaEnrolled: true }, "live"),
    ).toEqual({ state: "mfa_required", enrolled: true });
    expect(
      gateFromWhoami({ ...owner, mfaRequired: true, ready: false, mfaEnrolled: false }, "live"),
    ).toEqual({ state: "mfa_required", enrolled: false });
  });

  it("lets a ready staff member in with their session", () => {
    expect(gateFromWhoami(owner, "local")).toEqual({
      state: "ok",
      session: {
        userId: USER_ID,
        email: "admin@agentuncle.local",
        role: "owner",
        displayName: "대표",
        aal: "aal1",
        mfaRequired: false,
        target: "local",
      },
    });
  });

  it("falls back to the email when there is no display name", () => {
    const gate = gateFromWhoami({ ...owner, displayName: null }, "local");
    expect(gate.state === "ok" && gate.session.displayName).toBe("admin@agentuncle.local");
  });

  it("never lets a signed-out payload in", () => {
    expect(gateFromWhoami({ ...owner, userId: null }, "local")).toEqual({ state: "signed_out" });
  });
});
