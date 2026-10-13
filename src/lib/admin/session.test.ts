import { describe, expect, it } from "vitest";

import { SESSION_MAX_AGE_SECONDS, isSessionExpired, safeNext, sessionStartedAt } from "./session";

const NOW = 1_800_000_000;

describe("safeNext", () => {
  it.each([
    ["//evil.com"],
    ["https://x"],
    ["/admin/../x"],
    ["/admin/%2e%2e/x"],
    ["/\\evil.com"],
    ["/admin\\..\\x"],
    ["/adminx"],
    ["admin"],
    ["/"],
    [""],
    [null],
    [undefined],
    ["javascript:alert(1)"],
    ["/admin\n/x"],
  ])("sends %j back to /admin", (input) => {
    expect(safeNext(input)).toBe("/admin");
  });

  it("keeps a console path with its query", () => {
    expect(safeNext("/admin/requests?view=attention")).toBe("/admin/requests?view=attention");
    expect(safeNext("/admin")).toBe("/admin");
    expect(safeNext("/admin/accounts/abc")).toBe("/admin/accounts/abc");
  });

  it("drops a fragment", () => {
    expect(safeNext("/admin/audit#top")).toBe("/admin/audit");
  });

  it("never loops back into the sign-in flow", () => {
    expect(safeNext("/admin/login?next=/admin")).toBe("/admin");
    expect(safeNext("/admin/mfa")).toBe("/admin");
    expect(safeNext("/admin/auth/callback?code=x")).toBe("/admin");
  });

  it("never lands on a POST-only export route (a GET there is 405)", () => {
    expect(safeNext("/admin/export/requests")).toBe("/admin");
    expect(safeNext("/admin/export")).toBe("/admin");
    expect(safeNext("/admin/exports")).toBe("/admin/exports");
  });
});

describe("session age", () => {
  it("is 12 hours", () => {
    expect(SESSION_MAX_AGE_SECONDS).toBe(43_200);
  });

  it("starts at the earliest amr timestamp", () => {
    const claims = {
      amr: [
        { method: "totp", timestamp: NOW - 100 },
        { method: "password", timestamp: NOW - 500 },
      ],
      iat: NOW - 10,
    };
    expect(sessionStartedAt(claims)).toBe(NOW - 500);
  });

  it("falls back to iat when amr is missing or empty", () => {
    expect(sessionStartedAt({ iat: NOW - 10 })).toBe(NOW - 10);
    expect(sessionStartedAt({ amr: [], iat: NOW - 20 })).toBe(NOW - 20);
  });

  it("ignores plain string amr entries (RFC 8176), which carry no time", () => {
    expect(sessionStartedAt({ amr: ["pwd"], iat: NOW - 30 })).toBe(NOW - 30);
  });

  it("is unknown without amr and iat", () => {
    expect(sessionStartedAt({})).toBeNull();
  });

  it("expires 12 h + 1 s after sign-in", () => {
    const signedIn = NOW - SESSION_MAX_AGE_SECONDS - 1;
    expect(isSessionExpired({ amr: [{ method: "password", timestamp: signedIn }], iat: NOW - 60 }, NOW)).toBe(true);
  });

  it("is still valid exactly 12 h after sign-in", () => {
    const signedIn = NOW - SESSION_MAX_AGE_SECONDS;
    expect(isSessionExpired({ amr: [{ method: "password", timestamp: signedIn }] }, NOW)).toBe(false);
  });

  it("uses iat when amr is missing", () => {
    expect(isSessionExpired({ iat: NOW - SESSION_MAX_AGE_SECONDS - 1 }, NOW)).toBe(true);
    expect(isSessionExpired({ iat: NOW - 60 }, NOW)).toBe(false);
  });

  it("treats a session of unknown age as expired", () => {
    expect(isSessionExpired({}, NOW)).toBe(true);
  });
});
