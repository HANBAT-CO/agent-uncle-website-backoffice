import { describe, expect, it } from "vitest";

import { staffEmailFromId, staffIdFromEmail } from "./staff-id";

describe("staffEmailFromId", () => {
  it("maps a live staff ID onto the staff domain", () => {
    expect(staffEmailFromId("s.h.putrats", "live")).toBe("s.h.putrats@staff.agentuncle.invalid");
    expect(staffEmailFromId("  KangYisoo828 ", "live")).toBe("kangyisoo828@staff.agentuncle.invalid");
  });

  it("maps a local staff ID onto the seeded local domain", () => {
    expect(staffEmailFromId("admin", "local")).toBe("admin@agentuncle.local");
    expect(staffEmailFromId("operator@agentuncle.local", "local")).toBe("operator@agentuncle.local");
  });

  it("refuses addresses on any other domain, so app accounts cannot sign in", () => {
    expect(staffEmailFromId("kangyisoo828@gmail.com", "live")).toBeNull();
    expect(staffEmailFromId("admin@agentuncle.local", "live")).toBeNull();
    expect(staffEmailFromId("mangwon.select@demo.agentuncle.local", "local")).toBeNull();
  });

  it("refuses malformed IDs", () => {
    expect(staffEmailFromId("", "live")).toBeNull();
    expect(staffEmailFromId("a", "live")).toBeNull();
    expect(staffEmailFromId("-abc", "live")).toBeNull();
    expect(staffEmailFromId("has space", "live")).toBeNull();
    expect(staffEmailFromId("관리자", "live")).toBeNull();
  });
});

describe("staffIdFromEmail", () => {
  it("drops the domain", () => {
    expect(staffIdFromEmail("s.h.putrats@staff.agentuncle.invalid")).toBe("s.h.putrats");
  });
});
