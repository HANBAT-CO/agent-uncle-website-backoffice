import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getSiteUrl } from "./site";

describe("public site origin", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("prefers the configured origin over the Vercel production domain", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://shop.example.com/guide?from=share#faq");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "project.vercel.app");
    expect(getSiteUrl().href).toBe("https://shop.example.com/");
  });

  it("keeps the confirmed canonical origin instead of deployment hostnames", () => {
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "project.vercel.app");
    vi.stubEnv("VERCEL_URL", "preview-123.vercel.app");
    expect(getSiteUrl().href).toBe("https://www.the-saena.ai/");
  });

  it.each(["not a URL", "javascript:alert(1)", "file:///tmp/site", "https://user:secret@example.com"])(
    "ignores an invalid or credential-bearing URL: %s", (value) => {
      vi.stubEnv("NEXT_PUBLIC_SITE_URL", value);
      vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "project.vercel.app");
      expect(getSiteUrl().href).toBe("https://www.the-saena.ai/");
    },
  );

  it("keeps localhost and its explicit port for local metadata checks", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3100/guide");
    expect(getSiteUrl().href).toBe("http://localhost:3100/");
  });

  it("uses the confirmed production origin when no override is configured", () => {
    expect(getSiteUrl().href).toBe("https://www.the-saena.ai/");
  });
});
