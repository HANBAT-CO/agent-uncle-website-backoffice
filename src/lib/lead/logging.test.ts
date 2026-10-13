import { describe, expect, it } from "vitest";

import { leadInsertFailureLog } from "./logging";

describe("lead insert logging", () => {
  it("keeps insert failure logs to code and category only", () => {
    const log = leadInsertFailureLog("23514", "insert-error");

    expect(log).toEqual({ code: "23514", category: "insert-error" });
    expect(Object.keys(log).sort()).toEqual(["category", "code"]);
    expect(JSON.stringify(log)).not.toContain("details");
    expect(JSON.stringify(log)).not.toContain("hint");
  });

  it("uses a non-sensitive unknown code for thrown exceptions", () => {
    expect(leadInsertFailureLog(undefined, "exception")).toEqual({ code: "unknown", category: "exception" });
  });
});
