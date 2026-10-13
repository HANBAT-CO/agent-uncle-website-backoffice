import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import nextConfig, { adminHeaders, LANDING_CSS_EXCLUDES } from "../../../next.config";
import { pageCodePoints, pageSourceFiles } from "../../../scripts/fonts/page-chars.mjs";
import { woff2CodePoints } from "../../../scripts/fonts/woff2-cmap.mjs";
import { ADMIN_REDS, hueFamily } from "../../../scripts/qa/no-banned-colors.mjs";
import { cn } from "./utils";

/**
 * Admin theme contract (spec 9, screens appendix 9; WP-00):
 * - admin.css is its own Tailwind entry with explicit sources, so landing
 *   utilities and tokens never reach the console and the other way round;
 * - the spec 9 tokens, light theme only;
 * - colours stay inside the brand rules (green key colour; the app reds only
 *   as the attention tone; no other banned hue family);
 * - Paperlogy 400/500/600/700 as full KS X 1001 files;
 * - the landing stylesheet is byte-identical to the one before the move.
 */

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");
const adminCss = () => read("src/app/(admin)/admin.css");

/** sha256 of src/app/globals.css before the (site) move (WP-00 step 1). */
const LANDING_GLOBALS_SHA256 = "27f1ef968ed13136c4f147ac66f77f88e2195144ea77cdda6deea206a7a84b02";

/** `--name: value;` declarations of the first block whose selector matches. */
function declarations(css: string, selector: string): Map<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) return new Map();
  const end = css.indexOf("\n}", start);
  const block = css.slice(start, end);
  return new Map([...block.matchAll(/^\s*(--[a-z0-9-]+):\s*([^;]+);/gm)].map((match) => [match[1], match[2].trim().toLowerCase()]));
}

/** The 2,350 KS X 1001 Hangul syllables (EUC-KR rows 0xB0-0xC8). */
function ksx1001Syllables(): number[] {
  const decoder = new TextDecoder("euc-kr");
  const out: number[] = [];
  for (let lead = 0xb0; lead <= 0xc8; lead += 1) {
    for (let trail = 0xa1; trail <= 0xfe; trail += 1) {
      const code = decoder.decode(new Uint8Array([lead, trail])).codePointAt(0) ?? 0;
      if (code >= 0xac00 && code <= 0xd7a3) out.push(code);
    }
  }
  return out;
}

describe("admin.css entry", () => {
  it("starts with its own Tailwind import that scans nothing by default", () => {
    expect(adminCss().startsWith('@import "tailwindcss" source(none);')).toBe(true);
  });

  it("imports the animation and shadcn layers and lists its sources explicitly", () => {
    const css = adminCss();
    expect(css).toContain('@import "tw-animate-css";');
    expect(css).toContain('@import "shadcn/tailwind.css";');
    const sources = [...css.matchAll(/^@source\s+"([^"]+)";/gm)].map((match) => match[1]);
    expect(sources).toEqual(expect.arrayContaining(["../../components/admin", "../../lib/admin", "./"]));
    for (const source of sources) {
      expect(source, `@source ${source} must stay inside the admin folders`).toMatch(/^(\.\/|\.\.\/\.\.\/(components|lib|hooks)\/admin)$/);
    }
  });
});

describe("admin tokens (spec 9)", () => {
  const tokens = () => declarations(adminCss(), ":root");

  it("declares the surfaces, ink, hairline and the deep green key colour", () => {
    const vars = tokens();
    expect(vars.get("--background")).toBe("#edece3");
    expect(vars.get("--card")).toBe("#f5f4ee");
    expect(vars.get("--popover")).toBe("#f5f4ee");
    expect(vars.get("--foreground")).toBe("#101010");
    expect(vars.get("--border")).toBe("#d7d7d7");
    expect(vars.get("--primary")).toBe("#0c483e");
    expect(vars.get("--ring")).toBe("#0c483e");
  });

  it("declares the status tones: weak green, attention red tint with darker text, neutral", () => {
    const vars = tokens();
    expect(vars.get("--status-normal-bg")).toBe("color-mix(in oklab, #0c483e 12%, transparent)");
    expect(vars.get("--status-normal-fg")).toBe("#0c483e");
    expect(vars.get("--status-attention-bg")).toBe("color-mix(in oklab, #d22030 12%, transparent)");
    expect(vars.get("--status-attention-fg")).toBe("#b3192a");
    expect(vars.get("--status-neutral-bg")).toBe("#e4e3da");
    expect(vars.get("--status-neutral-fg")).toBe("#484848");
  });

  it("declares the validated ordinal chart ramp, light to dark", () => {
    const vars = tokens();
    expect([1, 2, 3, 4, 5].map((n) => vars.get(`--chart-${n}`))).toEqual(["#86bc9e", "#549e7e", "#2e8c6b", "#1c6a55", "#0c483e"]);
  });

  it("uses a 1rem card radius and 0.625rem controls", () => {
    expect(tokens().get("--radius")).toBe("1rem");
    expect(adminCss()).toMatch(/--radius-md:\s*calc\(var\(--radius\) \* 0\.625\);/);
  });

  it("ships the light theme only", () => {
    const css = adminCss();
    expect(css).not.toMatch(/\[data-theme="dark"\]\s*\{/);
    expect(css).not.toMatch(/(^|[\s,])\.dark\b/m);
    expect(css).not.toMatch(/prefers-color-scheme:\s*dark/);
    // Generated `dark:` classes only fire under data-theme="dark", never under a dark OS setting,
    // and the admin root layout pins data-theme="light".
    expect(css).toContain('@custom-variant dark (&:where([data-theme="dark"], [data-theme="dark"] *));');
    expect(read("src/app/(admin)/layout.tsx")).toContain('data-theme="light"');
  });

  it("sets Paperlogy from the runtime font variable, keep-all breaking", () => {
    const css = adminCss();
    expect(css).toMatch(/--font-sans:\s*var\(--font-paperlogy[,)]/);
    expect(css).toContain("word-break: keep-all;");
  });
});

describe("admin colours", () => {
  it("stays out of the banned hue families, with red only as the app attention reds", () => {
    const hexes = [...adminCss().matchAll(/#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3})(?![0-9a-z_-])/gi)].map((match) => match[0].toLowerCase());
    expect(hexes.length).toBeGreaterThan(10);
    for (const hex of hexes) {
      const family = hueFamily(hex);
      if (family === "red") expect(ADMIN_REDS.has(hex.slice(1)), `${hex} is not an app red`).toBe(true);
      else expect(family, hex).toBeNull();
    }
  });
});

describe("Paperlogy admin faces", () => {
  const syllables = ksx1001Syllables();
  const landingFull = woff2CodePoints(readFileSync(join(root, "src/app/fonts/paperlogy-400.woff2")));

  it("decodes the 2,350 KS X 1001 syllables", () => {
    expect(syllables).toHaveLength(2350);
  });

  for (const weight of [400, 500, 600, 700] as const) {
    it(`paperlogy-${weight}.woff2 holds the full KS X 1001 set`, () => {
      const cmap = woff2CodePoints(readFileSync(join(root, `src/app/(admin)/fonts/paperlogy-${weight}.woff2`)));
      expect(syllables.filter((code) => !cmap.has(code))).toEqual([]);
      expect([...landingFull].filter((code) => !cmap.has(code)).map((code) => code.toString(16))).toEqual([]);
    });
  }

  it("fonts.ts declares one family with all four weights on --font-paperlogy", () => {
    const loader = read("src/app/(admin)/fonts.ts");
    for (const weight of [400, 500, 600, 700]) {
      expect(loader).toContain(`path: "./fonts/paperlogy-${weight}.woff2", weight: "${weight}"`);
    }
    expect(loader).toContain('variable: "--font-paperlogy"');
    expect(loader).toContain('display: "swap"');
  });
});

describe("landing stylesheet", () => {
  it("is byte-identical after the move into (site)", () => {
    const hash = createHash("sha256").update(readFileSync(join(root, "src/app/(site)/globals.css"))).digest("hex");
    expect(hash).toBe(LANDING_GLOBALS_SHA256);
  });
});

describe("cn", () => {
  it("joins truthy classes and lets the later Tailwind utility win", () => {
    expect(cn("px-2 text-sm", false, undefined, "px-4")).toBe("text-sm px-4");
    expect(cn("bg-primary", { "bg-card": true })).toBe("bg-card");
  });
});

describe("next.config admin headers (spec 4)", () => {
  const byKey = (headers: { key: string; value: string }[]) => new Map(headers.map((header) => [header.key, header.value]));

  it("marks every /admin response noindex, no-store, unframeable and referrer-free", () => {
    const headers = byKey(adminHeaders({ nodeEnv: "development", supabaseUrl: "http://127.0.0.1:55321" }));
    expect(headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    expect(headers.get("Cache-Control")).toBe("private, no-store");
    expect(headers.get("X-Frame-Options")).toBe("DENY");
    expect(headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(headers.has("Content-Security-Policy")).toBe(false);
  });

  it("adds the spec 4 CSP in production, scoped to the Supabase origin", () => {
    const csp = byKey(adminHeaders({ nodeEnv: "production", supabaseUrl: "https://auicerytbhnqeakmkscs.supabase.co/rest/v1" })).get("Content-Security-Policy");
    expect(csp?.split("; ")).toEqual([
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://auicerytbhnqeakmkscs.supabase.co",
      "frame-src https://auicerytbhnqeakmkscs.supabase.co",
      "connect-src 'self'",
      "form-action 'self' https://auicerytbhnqeakmkscs.supabase.co https://accounts.google.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
    ]);
  });

  it("skips the CSP when the Supabase URL is unset or invalid", () => {
    for (const supabaseUrl of [undefined, "", "not a url"]) {
      expect(byKey(adminHeaders({ nodeEnv: "production", supabaseUrl })).has("Content-Security-Policy")).toBe(false);
    }
  });

  it("applies the admin rule after the global rule, for /admin and below only", async () => {
    const rules = await nextConfig.headers!();
    expect(rules.map((rule) => rule.source)).toEqual(["/:path*", "/admin/:path*"]);
  });
});

describe("landing Tailwind scan", () => {
  it("excludes every console folder from the landing stylesheet", () => {
    expect(LANDING_CSS_EXCLUDES).toEqual(
      expect.arrayContaining(['@source not "../(admin)";', '@source not "../../components/admin";', '@source not "../../lib/admin";', '@source not "../../hooks/admin";']),
    );
  });
});

describe("landing page font subsets", () => {
  it("ignore console text, so admin copy never changes the landing fonts", () => {
    const page = new Set(pageCodePoints(root));
    const landingText = pageSourceFiles(join(root, "src"))
      .map((file) => readFileSync(file, "utf8"))
      .join("");
    const landingChars = new Set([...landingText].map((char) => char.codePointAt(0) ?? 0));
    const adminOnly = [...read("src/app/(admin)/layout.tsx"), ...read("src/components/admin/ui/sidebar.tsx")]
      .map((char) => char.codePointAt(0) ?? 0)
      .filter((code) => code >= 0x80 && !landingChars.has(code));
    expect(adminOnly.length).toBeGreaterThan(0);
    expect(adminOnly.filter((code) => page.has(code)).map((code) => String.fromCodePoint(code))).toEqual([]);
    expect(pageSourceFiles(join(root, "src")).filter((file) => /\/(\(admin\)|admin)\//.test(file))).toEqual([]);
  });
});
