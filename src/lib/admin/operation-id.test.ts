import { describe, expect, it } from "vitest";

import { isOperationId, newOperationId } from "./operation-id";

describe("operation ids", () => {
  it("are fresh UUIDs", () => {
    const a = newOperationId();
    const b = newOperationId();
    expect(a).not.toBe(b);
    expect(isOperationId(a)).toBe(true);
  });

  it("rejects anything that is not a UUID", () => {
    for (const value of ["", "abc", 42, null, undefined, "2a0f7f8e-7c55-4b8e-9a5a", "2a0f7f8e-7c55-4b8e-9a5a-3f2b7f0f8c11x"]) {
      expect(isOperationId(value)).toBe(false);
    }
    expect(isOperationId("2A0F7F8E-7C55-4B8E-9A5A-3F2B7F0F8C11")).toBe(true);
  });
});
