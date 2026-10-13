import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

vi.mock("server-only", () => ({}));

const rpcMock = vi.fn();
vi.mock("../supabase/server", () => ({
  createAdminServerClient: async () => ({ rpc: rpcMock }),
}));

import { callRpc, mapRpcError, RPC_MESSAGES } from "./core";

describe("mapRpcError", () => {
  it("maps 42501 to forbidden with the database message", () => {
    expect(mapRpcError({ code: "42501", message: "이 작업을 처리할 권한이 없어요." })).toEqual({
      kind: "forbidden",
      message: "이 작업을 처리할 권한이 없어요.",
      code: "42501",
    });
  });

  it("falls back to a generic forbidden message when 42501 has no text", () => {
    expect(mapRpcError({ code: "42501", message: "" })).toMatchObject({ kind: "forbidden", message: RPC_MESSAGES.forbidden });
  });

  it("maps P0001 to invalid with the database message", () => {
    expect(mapRpcError({ code: "P0001", message: "메모는 1~4,000자로 입력해 주세요." })).toEqual({
      kind: "invalid",
      message: "메모는 1~4,000자로 입력해 주세요.",
      code: "P0001",
    });
  });

  it("maps a concurrent edit (다른 운영자가) to conflict and keeps the database message", () => {
    const message = "다른 운영자가 공지를 변경했어요. 최신 내용을 확인해 주세요.";
    expect(mapRpcError({ code: "P0001", message })).toEqual({ kind: "conflict", message, code: "P0001" });
  });

  it("maps a reused operation id (같은 작업 번호로) to conflict with the rotation message", () => {
    expect(mapRpcError({ code: "P0001", message: "같은 작업 번호로 다른 내용을 전송할 수 없어요." })).toEqual({
      kind: "conflict",
      message: "이미 처리된 작업이에요. 화면을 새로고침한 뒤 다시 시도해 주세요.",
      code: "P0001",
    });
  });

  it("maps PGRST202 to not_installed", () => {
    expect(mapRpcError({ code: "PGRST202", message: "Could not find the function public.backoffice_overview" })).toEqual({
      kind: "not_installed",
      message: RPC_MESSAGES.not_installed,
      code: "PGRST202",
    });
  });

  it("maps PGRST301, PGRST302 and HTTP 401 to unauthenticated", () => {
    for (const error of [{ code: "PGRST301", message: "JWT expired" }, { code: "PGRST302", message: "Anonymous access is disabled" }]) {
      expect(mapRpcError(error)).toMatchObject({ kind: "unauthenticated", message: "로그인이 만료됐어요. 다시 로그인해 주세요." });
    }
    expect(mapRpcError({ code: "", message: "Unauthorized" }, 401)).toMatchObject({ kind: "unauthenticated" });
  });

  it("maps fetch failures to network", () => {
    expect(mapRpcError(new TypeError("fetch failed"))).toEqual({
      kind: "network",
      message: "서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.",
    });
    // postgrest-js turns a thrown fetch into { code: '', message: 'TypeError: fetch failed' } with status 0
    expect(mapRpcError({ code: "", message: "TypeError: fetch failed" }, 0)).toMatchObject({ kind: "network" });
  });

  it("never echoes the raw text of an unknown error", () => {
    const raw = 'relation "secret_table" does not exist';
    const mapped = mapRpcError({ code: "42P01", message: raw });
    expect(mapped).toEqual({ kind: "unknown", message: "잠시 후 다시 시도해 주세요.", code: "42P01" });
    expect(JSON.stringify(mapped)).not.toContain("secret_table");
  });

  it("treats a missing error object as unknown", () => {
    expect(mapRpcError(null)).toEqual({ kind: "unknown", message: "잠시 후 다시 시도해 주세요." });
  });
});

describe("callRpc", () => {
  beforeEach(() => {
    rpcMock.mockReset();
  });

  const schema = z.object({ total: z.number() });

  it("returns the parsed data on success", async () => {
    rpcMock.mockResolvedValue({ data: { total: 3, extra: true }, error: null, status: 200 });
    await expect(callRpc("backoffice_overview", { p_days: 1 }, schema)).resolves.toEqual({ ok: true, data: { total: 3 } });
    expect(rpcMock).toHaveBeenCalledWith("backoffice_overview", { p_days: 1 });
  });

  it("maps database errors", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { code: "42501", message: "이 작업을 처리할 권한이 없어요." }, status: 403 });
    await expect(callRpc("backoffice_list_audit", {}, schema)).resolves.toEqual({
      ok: false,
      error: { kind: "forbidden", message: "이 작업을 처리할 권한이 없어요.", code: "42501" },
    });
  });

  it("turns a contract mismatch into unknown and logs only the function name", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    rpcMock.mockResolvedValue({ data: { total: "three", phone: "010-1234-5678" }, error: null, status: 200 });
    const result = await callRpc("backoffice_overview", {}, schema);
    expect(result).toEqual({ ok: false, error: { kind: "unknown", message: "잠시 후 다시 시도해 주세요." } });
    expect(log).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(log.mock.calls)).toContain("backoffice_overview");
    expect(JSON.stringify(log.mock.calls)).not.toContain("010-1234-5678");
    log.mockRestore();
  });

  it("maps a thrown fetch error to network", async () => {
    rpcMock.mockRejectedValue(new TypeError("fetch failed"));
    await expect(callRpc("backoffice_overview", {}, schema)).resolves.toMatchObject({ ok: false, error: { kind: "network" } });
  });
});
