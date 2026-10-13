import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

vi.mock("server-only", () => ({}));

const gate = vi.fn();
vi.mock("./dal", () => ({
  getAdminGate: () => gate(),
  currentAdminPath: async () => "/admin/requests?view=attention",
  gateRedirectPath: (g: { state: string }) => `/admin/${g.state}`,
}));
const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: (...args: unknown[]) => revalidatePath(...args) }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  },
}));

import { runAdminAction } from "./actions";

const OP = "2a0f7f8e-7c55-4b8e-9a5a-3f2b7f0f8c11";
const session = (role: "viewer" | "operator" | "owner") => ({
  state: "ok",
  session: { userId: "u", email: "a@b", role, displayName: "운영 담당", aal: "aal1", mfaRequired: false, target: "local" },
});

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.append(key, value);
  return fd;
}

const schema = z.object({
  targetId: z.string().min(1),
  body: z.string().trim().min(1, "메모를 입력해 주세요."),
});

beforeEach(() => {
  gate.mockReset();
  revalidatePath.mockReset();
  gate.mockResolvedValue(session("operator"));
});

describe("runAdminAction", () => {
  it("refuses a missing operationId", async () => {
    const call = vi.fn();
    const state = await runAdminAction({ minRole: "operator", formData: form({ targetId: "r1", body: "메모" }), schema, call, success: "메모를 남겼어요" });
    expect(state).toMatchObject({ status: "error", kind: "validation" });
    expect(call).not.toHaveBeenCalled();
  });

  it("refuses an operationId that is not a UUID", async () => {
    const call = vi.fn();
    const state = await runAdminAction({
      minRole: "operator",
      formData: form({ targetId: "r1", body: "메모", operationId: "abc" }),
      schema,
      call,
      success: "메모를 남겼어요",
    });
    expect(state).toMatchObject({ status: "error", kind: "validation" });
    expect(call).not.toHaveBeenCalled();
  });

  it("returns field errors when the input does not parse", async () => {
    const call = vi.fn();
    const state = await runAdminAction({
      minRole: "operator",
      formData: form({ targetId: "r1", body: "   ", operationId: OP }),
      schema,
      call,
      success: "메모를 남겼어요",
    });
    expect(state).toMatchObject({ status: "error", kind: "validation", message: "메모를 입력해 주세요.", fieldErrors: { body: "메모를 입력해 주세요." } });
    expect(call).not.toHaveBeenCalled();
  });

  it("returns the forbidden state the database reports", async () => {
    const call = vi.fn().mockResolvedValue({ ok: false, error: { kind: "forbidden", message: "이 작업을 처리할 권한이 없어요.", code: "42501" } });
    const state = await runAdminAction({
      minRole: "operator",
      formData: form({ targetId: "r1", body: "메모", operationId: OP }),
      schema,
      call,
      success: "메모를 남겼어요",
    });
    expect(state).toEqual({ status: "error", kind: "forbidden", message: "이 작업을 처리할 권한이 없어요." });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("refuses a role below the minimum without calling the database", async () => {
    gate.mockResolvedValue(session("viewer"));
    const call = vi.fn();
    const state = await runAdminAction({
      minRole: "operator",
      formData: form({ targetId: "r1", body: "메모", operationId: OP }),
      schema,
      call,
      success: "메모를 남겼어요",
    });
    expect(state).toMatchObject({ status: "error", kind: "forbidden" });
    expect(call).not.toHaveBeenCalled();
  });

  it("calls with the parsed input and operation id, then revalidates", async () => {
    const call = vi.fn().mockResolvedValue({ ok: true, data: { noteId: 7 } });
    const state = await runAdminAction({
      minRole: "operator",
      formData: form({ targetId: "r1", body: "  확인 필요  ", operationId: OP, $ACTION_ID_abc: "" }),
      schema,
      call,
      success: (data: { noteId: number }) => `메모 ${data.noteId}번을 남겼어요`,
      revalidate: ["/admin/requests/r1", "/admin/requests"],
    });
    expect(call).toHaveBeenCalledWith({ targetId: "r1", body: "확인 필요" }, OP);
    expect(state).toEqual({ status: "success", message: "메모 7번을 남겼어요", data: { noteId: 7 } });
    expect(revalidatePath).toHaveBeenCalledWith("/admin/requests/r1");
    expect(revalidatePath).toHaveBeenCalledWith("/admin/requests");
  });

  it("never shows raw text for unknown failures and keeps the save copy", async () => {
    const call = vi.fn().mockResolvedValue({ ok: false, error: { kind: "unknown", message: "잠시 후 다시 시도해 주세요." } });
    const state = await runAdminAction({
      minRole: "operator",
      formData: form({ targetId: "r1", body: "메모", operationId: OP }),
      schema,
      call,
      success: "메모를 남겼어요",
    });
    expect(state).toEqual({ status: "error", kind: "unknown", message: "저장하지 못했어요. 입력은 그대로 있어요. 다시 시도해 주세요." });
  });

  it("reports an expired session with a login link instead of a generic error", async () => {
    gate.mockResolvedValue({ state: "signed_out" });
    const call = vi.fn();
    const state = await runAdminAction({
      minRole: "operator",
      formData: form({ targetId: "r1", body: "메모", operationId: OP }),
      schema,
      call,
      success: "메모를 남겼어요",
    });
    expect(state).toEqual({
      status: "error",
      kind: "unauthenticated",
      message: "로그인이 만료됐어요. 다시 로그인해 주세요.",
      loginHref: "/admin/login?next=%2Fadmin%2Frequests%3Fview%3Dattention",
    });
    expect(call).not.toHaveBeenCalled();
  });

  it("maps an unauthenticated database error to the same login state", async () => {
    const call = vi.fn().mockResolvedValue({ ok: false, error: { kind: "unauthenticated", message: "로그인이 만료됐어요. 다시 로그인해 주세요." } });
    const state = await runAdminAction({
      minRole: "operator",
      formData: form({ targetId: "r1", body: "메모", operationId: OP }),
      schema,
      call,
      success: "메모를 남겼어요",
    });
    expect(state).toMatchObject({ status: "error", kind: "unauthenticated", loginHref: expect.stringContaining("/admin/login?next=") });
  });
});
