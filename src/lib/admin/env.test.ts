import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { readBackofficeEnv } from "./env";

const LOCAL_URL = "http://127.0.0.1:55321";
const LIVE_URL = "https://auicerytbhnqeakmkscs.supabase.co";
const KEY = "sb_publishable_test_key_value";

function env(vars: Record<string, string | undefined>) {
  return readBackofficeEnv(vars);
}

describe("readBackofficeEnv", () => {
  it("is disabled when the target is unset", () => {
    expect(env({})).toMatchObject({ enabled: false, reason: "disabled" });
    expect(env({ BACKOFFICE_SUPABASE_TARGET: "  " })).toMatchObject({ enabled: false, reason: "disabled" });
  });

  it("is enabled for a local target on 127.0.0.1 with a key", () => {
    expect(
      env({ BACKOFFICE_SUPABASE_TARGET: "local", BACKOFFICE_SUPABASE_URL: LOCAL_URL, BACKOFFICE_SUPABASE_PUBLISHABLE_KEY: KEY }),
    ).toEqual({ enabled: true, target: "local", url: LOCAL_URL, publishableKey: KEY });
  });

  it("accepts localhost for the local target and strips a trailing slash", () => {
    expect(
      env({ BACKOFFICE_SUPABASE_TARGET: "local", BACKOFFICE_SUPABASE_URL: "http://localhost:55321/", BACKOFFICE_SUPABASE_PUBLISHABLE_KEY: KEY }),
    ).toMatchObject({ enabled: true, url: "http://localhost:55321" });
  });

  it("is enabled for a live target on a hosted https URL", () => {
    expect(
      env({ BACKOFFICE_SUPABASE_TARGET: "live", BACKOFFICE_SUPABASE_URL: LIVE_URL, BACKOFFICE_SUPABASE_PUBLISHABLE_KEY: KEY }),
    ).toEqual({ enabled: true, target: "live", url: LIVE_URL, publishableKey: KEY });
  });

  it("refuses a local target that points at a hosted project", () => {
    expect(
      env({ BACKOFFICE_SUPABASE_TARGET: "local", BACKOFFICE_SUPABASE_URL: "https://x.supabase.co", BACKOFFICE_SUPABASE_PUBLISHABLE_KEY: KEY }),
    ).toMatchObject({ enabled: false, reason: "misconfigured" });
  });

  it("refuses a live target that points at localhost", () => {
    expect(
      env({ BACKOFFICE_SUPABASE_TARGET: "live", BACKOFFICE_SUPABASE_URL: LOCAL_URL, BACKOFFICE_SUPABASE_PUBLISHABLE_KEY: KEY }),
    ).toMatchObject({ enabled: false, reason: "misconfigured" });
    expect(
      env({ BACKOFFICE_SUPABASE_TARGET: "live", BACKOFFICE_SUPABASE_URL: "https://localhost:55321", BACKOFFICE_SUPABASE_PUBLISHABLE_KEY: KEY }),
    ).toMatchObject({ enabled: false, reason: "misconfigured" });
  });

  it("refuses a live target over plain http", () => {
    expect(
      env({ BACKOFFICE_SUPABASE_TARGET: "live", BACKOFFICE_SUPABASE_URL: "http://x.supabase.co", BACKOFFICE_SUPABASE_PUBLISHABLE_KEY: KEY }),
    ).toMatchObject({ enabled: false, reason: "misconfigured" });
  });

  it("is misconfigured when the key is missing", () => {
    expect(env({ BACKOFFICE_SUPABASE_TARGET: "local", BACKOFFICE_SUPABASE_URL: LOCAL_URL })).toMatchObject({
      enabled: false,
      reason: "misconfigured",
    });
  });

  it("is misconfigured when the URL is missing or not http(s)", () => {
    expect(env({ BACKOFFICE_SUPABASE_TARGET: "local", BACKOFFICE_SUPABASE_PUBLISHABLE_KEY: KEY })).toMatchObject({
      enabled: false,
      reason: "misconfigured",
    });
    expect(
      env({ BACKOFFICE_SUPABASE_TARGET: "local", BACKOFFICE_SUPABASE_URL: "ftp://127.0.0.1", BACKOFFICE_SUPABASE_PUBLISHABLE_KEY: KEY }),
    ).toMatchObject({ enabled: false, reason: "misconfigured" });
  });

  it("is misconfigured for an unknown target", () => {
    expect(
      env({ BACKOFFICE_SUPABASE_TARGET: "staging", BACKOFFICE_SUPABASE_URL: LOCAL_URL, BACKOFFICE_SUPABASE_PUBLISHABLE_KEY: KEY }),
    ).toMatchObject({ enabled: false, reason: "misconfigured" });
  });

  it("accepts only a publishable key: sb_publishable_ or a legacy anon JWT", () => {
    const jwt = (role: string) =>
      `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role })).toString("base64url")}.sig`;
    const withKey = (key: string) =>
      env({ BACKOFFICE_SUPABASE_TARGET: "local", BACKOFFICE_SUPABASE_URL: LOCAL_URL, BACKOFFICE_SUPABASE_PUBLISHABLE_KEY: key });
    expect(withKey(jwt("anon"))).toMatchObject({ enabled: true });
    expect(withKey(jwt("authenticated"))).toMatchObject({ enabled: false, reason: "misconfigured" });
    expect(withKey("sb_other_abc")).toMatchObject({ enabled: false, reason: "misconfigured" });
    expect(withKey("not-a-key")).toMatchObject({ enabled: false, reason: "misconfigured" });
  });
});
