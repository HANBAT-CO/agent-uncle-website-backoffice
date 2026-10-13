import { describe, expect, it } from "vitest";

import { isLowPower } from "./device";

describe("isLowPower (spec 6.6)", () => {
  it("is false on a capable device", () => {
    expect(isLowPower({ hardwareConcurrency: 8, deviceMemory: 8, connection: { saveData: false } })).toBe(false);
  });

  it("is true with Save-Data on", () => {
    expect(isLowPower({ hardwareConcurrency: 12, deviceMemory: 16, connection: { saveData: true } })).toBe(true);
  });

  it("is true with 4 or fewer cores", () => {
    expect(isLowPower({ hardwareConcurrency: 4 })).toBe(true);
    expect(isLowPower({ hardwareConcurrency: 5 })).toBe(false);
  });

  it("is true with 4 GB or less memory", () => {
    expect(isLowPower({ hardwareConcurrency: 8, deviceMemory: 4 })).toBe(true);
    expect(isLowPower({ hardwareConcurrency: 8, deviceMemory: 2 })).toBe(true);
  });

  /*
   * WebKit clamps hardwareConcurrency to 4 below 8 logical cores and 8 above,
   * and every iOS / iPadOS browser is WebKit: a 6-core iPhone reads 4, so the
   * 4 says nothing there. Playwright's WebKit on a 10-core Mac reads 8, which
   * is why the e2e mobile project never saw the low-power path.
   */
  const IPHONE_UA =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
  const CHROME_IOS_UA =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1";
  const IPADOS_UA =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
  const ANDROID_UA =
    "Mozilla/5.0 (Linux; Android 14; SM-A256N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";

  it("treats WebKit's clamped 4 cores on iOS and iPadOS as unknown", () => {
    expect(isLowPower({ hardwareConcurrency: 4, userAgent: IPHONE_UA, maxTouchPoints: 5 })).toBe(false);
    expect(isLowPower({ hardwareConcurrency: 4, userAgent: CHROME_IOS_UA, maxTouchPoints: 5 })).toBe(false);
    // iPadOS asks for the desktop site: a Mac user agent with touch points.
    expect(isLowPower({ hardwareConcurrency: 4, userAgent: IPADOS_UA, maxTouchPoints: 5 })).toBe(false);
  });

  it("still honours Save-Data on iOS, and real low core counts elsewhere", () => {
    expect(isLowPower({ hardwareConcurrency: 4, userAgent: IPHONE_UA, maxTouchPoints: 5, connection: { saveData: true } })).toBe(true);
    // A Mac (no touch) reading 4 has fewer than 8 logical cores.
    expect(isLowPower({ hardwareConcurrency: 4, userAgent: IPADOS_UA, maxTouchPoints: 0 })).toBe(true);
    expect(isLowPower({ hardwareConcurrency: 4, deviceMemory: 8, userAgent: ANDROID_UA, maxTouchPoints: 5 })).toBe(true);
  });

  it("does not guess when a browser hides the numbers (Safari, Firefox)", () => {
    expect(isLowPower({})).toBe(false);
    expect(isLowPower({ hardwareConcurrency: 0 })).toBe(false);
  });
});
