import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { RECORD_COLLECTIONS } from "./enums";
import { RPC_RESULT_SCHEMAS, recordListSchemas, type RpcName } from "./schemas";

/*
 * Every fixture captured from the local stack (scripts/admin/capture-rpc-fixtures.mjs)
 * must parse with the schema of the RPC that produced it. File names are
 * <rpc>[.<variant>].<role>.json.
 */

const DIR = path.join(__dirname, "__fixtures__");
const files = readdirSync(DIR).filter((file) => file.endsWith(".json"));

type Fixture = { file: string; rpc: string; variant: string | null; role: string; data: unknown };

const fixtures: Fixture[] = files.map((file) => {
  const parts = file.replace(/\.json$/, "").split(".");
  const role = parts.pop() as string;
  const [rpc, variant = null] = parts;
  return { file, rpc, variant, role, data: JSON.parse(readFileSync(path.join(DIR, file), "utf8")) as unknown };
});

function schemaOf(fixture: Fixture) {
  if (fixture.rpc === "list_records") return recordListSchemas[fixture.variant as keyof typeof recordListSchemas];
  return RPC_RESULT_SCHEMAS[`backoffice_${fixture.rpc}` as RpcName];
}

/** Spec 8: every backoffice RPC the console calls (identity helpers are policy-side, whoami lives in auth/whoami.ts). */
const SPEC_RPCS: RpcName[] = [
  "backoffice_whoami",
  "backoffice_overview",
  "backoffice_ledger_anomalies",
  "backoffice_list_accounts",
  "backoffice_get_account",
  "backoffice_list_requests",
  "backoffice_get_request",
  "backoffice_list_records",
  "backoffice_list_conversations",
  "backoffice_get_conversation",
  "backoffice_attachment_access",
  "backoffice_search",
  "backoffice_list_leads",
  "backoffice_list_config",
  "backoffice_list_notices",
  "backoffice_list_audit",
  "backoffice_list_operations",
  "backoffice_list_admins",
  "backoffice_lookup_user",
  "backoffice_export",
  "backoffice_verify_audit_chain",
  "backoffice_review_document",
  "backoffice_set_account_status",
  "backoffice_add_note",
  "backoffice_open_case",
  "backoffice_update_case",
  "backoffice_save_notice",
  "backoffice_set_config",
  "backoffice_grant_admin",
  "backoffice_revoke_admin",
  "backoffice_set_lead_status",
];

const WRITE_RPCS = new Set<RpcName>([
  "backoffice_review_document",
  "backoffice_set_account_status",
  "backoffice_add_note",
  "backoffice_open_case",
  "backoffice_update_case",
  "backoffice_save_notice",
  "backoffice_set_config",
  "backoffice_grant_admin",
  "backoffice_revoke_admin",
  "backoffice_set_lead_status",
]);

describe("RPC fixtures", () => {
  it("were captured", () => {
    expect(fixtures.length).toBeGreaterThan(50);
  });

  it.each(fixtures.map((fixture) => [fixture.file, fixture] as const))("%s parses with its schema", (_file, fixture) => {
    const schema = schemaOf(fixture);
    expect(schema, `no schema for ${fixture.file}`).toBeDefined();
    const parsed = schema.safeParse(fixture.data);
    if (!parsed.success) throw new Error(`${fixture.file}: ${parsed.error.message}`);
  });

  it("covers every read RPC of spec 8 with at least one fixture", () => {
    const captured = new Set(fixtures.map((fixture) => `backoffice_${fixture.rpc}`));
    for (const name of SPEC_RPCS.filter((rpc) => !WRITE_RPCS.has(rpc))) {
      expect(captured.has(name), `${name} has no fixture`).toBe(true);
    }
  });

  it("covers every record collection", () => {
    const captured = new Set(fixtures.filter((fixture) => fixture.rpc === "list_records").map((fixture) => fixture.variant));
    for (const collection of RECORD_COLLECTIONS) expect(captured.has(collection), collection).toBe(true);
  });

  it("has a schema for every RPC of spec 8", () => {
    for (const name of SPEC_RPCS) expect(RPC_RESULT_SCHEMAS[name], name).toBeDefined();
  });
});

describe("masking per role", () => {
  const dossiers = fixtures.filter((fixture) => fixture.rpc === "get_account");

  it("viewer account dossiers are masked", () => {
    const viewer = dossiers.filter((fixture) => fixture.role === "viewer");
    expect(viewer.length).toBeGreaterThan(0);
    for (const fixture of viewer) {
      const parsed = RPC_RESULT_SCHEMAS.backoffice_get_account.parse(fixture.data);
      expect(parsed.account?.masked, fixture.file).toBe(true);
    }
  });

  it("operator and owner account dossiers are not masked", () => {
    for (const fixture of dossiers.filter((item) => item.role !== "viewer")) {
      const parsed = RPC_RESULT_SCHEMAS.backoffice_get_account.parse(fixture.data);
      expect(parsed.account?.masked ?? false, fixture.file).toBe(false);
    }
  });

  it("viewer request dossiers are masked and carry no event snapshots", () => {
    for (const fixture of fixtures.filter((item) => item.rpc === "get_request" && item.role === "viewer")) {
      const parsed = RPC_RESULT_SCHEMAS.backoffice_get_request.parse(fixture.data);
      expect(parsed.request.masked, fixture.file).toBe(true);
      for (const event of parsed.events) expect(event.before ?? null).toBeNull();
    }
  });
});

describe("snake_case rows become camelCase", () => {
  it("notes and cases on a request", () => {
    const noted = fixtures.find((item) => item.rpc === "get_request" && item.variant === "noted" && item.role === "owner");
    expect(noted).toBeDefined();
    const parsed = RPC_RESULT_SCHEMAS.backoffice_get_request.parse(noted!.data);
    expect(parsed.notes.length).toBeGreaterThan(0);
    expect(parsed.notes[0]).toMatchObject({ targetType: "request", authorId: expect.any(String), createdAt: expect.any(String) });
  });

  it("config rows", () => {
    const config = fixtures.find((item) => item.rpc === "list_config" && item.role === "owner");
    const parsed = RPC_RESULT_SCHEMAS.backoffice_list_config.parse(config!.data);
    expect(parsed.find((row) => row.key === "maintenance")).toMatchObject({ isPublic: true, writeRole: "owner" });
  });
});

describe("write results", () => {
  const samples: Record<string, unknown> = {
    backoffice_review_document: { accountId: "8c1d6a3e-0d3c-4a64-9a37-1b51a47c1c11", verificationStatus: "verified", reviewId: 4 },
    backoffice_set_account_status: { accountId: "8c1d6a3e-0d3c-4a64-9a37-1b51a47c1c11", status: "suspended", loginBanned: true },
    backoffice_add_note: { noteId: 12 },
    backoffice_open_case: { caseId: "0b8f0a53-2f43-4a49-a7ce-23bd4b8f0a11" },
    backoffice_update_case: { caseId: "0b8f0a53-2f43-4a49-a7ce-23bd4b8f0a11", version: 2, status: "resolved" },
    backoffice_save_notice: { noticeId: "2e8c6b1c-6a55-4d3e-9b1d-0c483e2e8c6b", version: 1, active: true },
    backoffice_set_config: { key: "feature_flags", version: 3 },
    backoffice_grant_admin: { userId: "8c1d6a3e-0d3c-4a64-9a37-1b51a47c1c11", role: "viewer" },
    backoffice_revoke_admin: { userId: "8c1d6a3e-0d3c-4a64-9a37-1b51a47c1c11", revoked: true },
    backoffice_set_lead_status: { leadId: "8c1d6a3e-0d3c-4a64-9a37-1b51a47c1c11", status: "contacted" },
  };

  it.each(Object.entries(samples))("%s parses its result", (name, sample) => {
    expect(RPC_RESULT_SCHEMAS[name as RpcName].safeParse(sample).success).toBe(true);
  });
});
