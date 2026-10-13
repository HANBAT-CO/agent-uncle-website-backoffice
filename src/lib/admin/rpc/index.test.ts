import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const callRpc = vi.fn();
vi.mock("./core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./core")>();
  return { ...actual, callRpc: (...args: unknown[]) => callRpc(...args) };
});
vi.mock("../supabase/server", () => ({ createAdminServerClient: async () => ({}) }));

import { rpc } from "./index";

const OP = "2a0f7f8e-7c55-4b8e-9a5a-3f2b7f0f8c11";

beforeEach(() => {
  callRpc.mockReset();
  callRpc.mockResolvedValue({ ok: true, data: {} });
});

function lastCall() {
  const [fn, args] = callRpc.mock.calls.at(-1) as [string, Record<string, unknown>];
  return { fn, args };
}

describe("rpc wrappers map camelCase arguments to p_snake", () => {
  it("listRequests", async () => {
    await rpc.listRequests({
      labels: ["답변 필요", "문제 확인 중"],
      attention: "recheck_due",
      accountId: "acc",
      search: "니트",
      from: "2026-10-12T15:00:00.000Z",
      to: "2026-10-13T15:00:00.000Z",
      includeDemo: false,
      sort: "recheck_asc",
      limit: 50,
      offset: 100,
    });
    expect(lastCall()).toEqual({
      fn: "backoffice_list_requests",
      args: {
        p_labels: ["답변 필요", "문제 확인 중"],
        p_attention: "recheck_due",
        p_account_id: "acc",
        p_search: "니트",
        p_from: "2026-10-12T15:00:00.000Z",
        p_to: "2026-10-13T15:00:00.000Z",
        p_include_demo: false,
        p_sort: "recheck_asc",
        p_limit: 50,
        p_offset: 100,
      },
    });
  });

  it("omits undefined optional arguments so SQL defaults apply", async () => {
    await rpc.listAccounts({ includeDemo: true, limit: 50, offset: 0 });
    expect(lastCall().args).toEqual({ p_include_demo: true, p_limit: 50, p_offset: 0 });
  });

  it("listRecords passes the collection and filter", async () => {
    await rpc.listRecords({ collection: "deliveries", filter: "awaiting_receipt_48h", includeDemo: false, limit: 50, offset: 0 });
    expect(lastCall()).toEqual({
      fn: "backoffice_list_records",
      args: { p_collection: "deliveries", p_filter: "awaiting_receipt_48h", p_include_demo: false, p_limit: 50, p_offset: 0 },
    });
  });

  it("getConversation", async () => {
    await rpc.getConversation({ a: "a-id", b: "b-id", reason: "분쟁 확인 요청", before: "2026-10-13T00:00:00.000Z", limit: 100 });
    expect(lastCall()).toEqual({
      fn: "backoffice_get_conversation",
      args: { p_account_a: "a-id", p_account_b: "b-id", p_reason: "분쟁 확인 요청", p_before: "2026-10-13T00:00:00.000Z", p_limit: 100 },
    });
  });

  it("saveNotice", async () => {
    await rpc.saveNotice({
      noticeId: "n-1",
      version: 2,
      title: "점검 안내",
      body: "내일 점검해요.",
      audience: "retailer",
      severity: "important",
      linkUrl: null,
      startsAt: "2026-10-13T00:00:00.000Z",
      endsAt: null,
      active: true,
      dismissible: false,
      operationId: OP,
    });
    expect(lastCall()).toEqual({
      fn: "backoffice_save_notice",
      args: {
        p_notice_id: "n-1",
        p_version: 2,
        p_title: "점검 안내",
        p_body: "내일 점검해요.",
        p_audience: "retailer",
        p_severity: "important",
        p_link_url: null,
        p_starts_at: "2026-10-13T00:00:00.000Z",
        p_ends_at: null,
        p_active: true,
        p_dismissible: false,
        p_operation_id: OP,
      },
    });
  });

  it("setConfig sends the JSON value as is", async () => {
    await rpc.setConfig({ key: "feature_flags", value: { newRequest: true }, reason: "신규 요청 켜기", version: 3, operationId: OP });
    expect(lastCall()).toEqual({
      fn: "backoffice_set_config",
      args: { p_key: "feature_flags", p_value: { newRequest: true }, p_reason: "신규 요청 켜기", p_version: 3, p_operation_id: OP },
    });
  });

  it("updateCase", async () => {
    await rpc.updateCase({ caseId: "c-1", version: 1, status: "resolved", clearAssignee: true, note: "해결", operationId: OP });
    expect(lastCall()).toEqual({
      fn: "backoffice_update_case",
      args: { p_case_id: "c-1", p_version: 1, p_status: "resolved", p_clear_assignee: true, p_note: "해결", p_operation_id: OP },
    });
  });

  it("grantAdmin", async () => {
    await rpc.grantAdmin({ userId: "u-1", role: "viewer", displayName: "조회 담당", requireMfa: true, operationId: OP });
    expect(lastCall()).toEqual({
      fn: "backoffice_grant_admin",
      args: { p_user_id: "u-1", p_role: "viewer", p_display_name: "조회 담당", p_require_mfa: true, p_operation_id: OP },
    });
  });

  it("exportRows", async () => {
    await rpc.exportRows({ kind: "requests", reason: "월간 정산 확인", from: "2026-10-12T15:00:00.000Z", includeDemo: false });
    expect(lastCall()).toEqual({
      fn: "backoffice_export",
      args: { p_kind: "requests", p_reason: "월간 정산 확인", p_from: "2026-10-12T15:00:00.000Z", p_include_demo: false },
    });
  });
});
