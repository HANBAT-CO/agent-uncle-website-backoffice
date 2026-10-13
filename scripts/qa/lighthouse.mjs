// Spec 13 and 15 budgets, measured with Lighthouse on the production server.
//
//   npx next build && npx next start -p 3200   (or: npm run qa)
//   node scripts/qa/lighthouse.mjs [--url=http://localhost:3200] [--runs=3] [--only=mobile,mobile-measured,desktop]
//
// Three profiles, each run `--runs` times (default 3); the median run by the
// profile's key metric is judged, since one run on a busy machine can swing.
// - mobile: Lighthouse's default mobile profile (Moto G Power emulation,
//   slow 4G, 4x CPU) with Lantern simulated throttling. Judges the category
//   scores, CLS and TBT.
// - mobile-measured: the same Moto G Power profile with real (devtools)
//   network and CPU throttling. Judges LCP and CLS. Lantern's simulated LCP
//   is reported but not judged: the hero H1 is server-rendered text that
//   paints about 90 ms into the unthrottled trace, and Lantern counts every
//   request that started before that paint (the async JS chunks and fonts)
//   as an LCP dependency, which the browser does not wait for. Measured
//   throttling observes when the H1 actually paints, which is what spec 13's
//   "LCP under 2.5s on a mid-range Android over 4G" asks for (and what the
//   WebPageTest Moto G Power check in docs/qa measures on a real network).
// - desktop: Lighthouse's desktop preset. Judges scores, LCP and CLS.
// Reports (JSON and HTML) go to test-results/lighthouse/, with summary.json.
//
// Budgets (fail = exit 1):
// - mobile: Performance >= 85, Accessibility >= 95, Best Practices >= 95,
//   SEO = 100, CLS < 0.05, TBT < 600 ms
// - mobile-measured: LCP < 2500 ms, CLS < 0.05
// - desktop: Performance >= 90, Accessibility >= 95, Best Practices >= 95,
//   SEO = 100, LCP < 1200 ms, CLS < 0.05

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import * as chromeLauncher from "chrome-launcher";
import lighthouse from "lighthouse";
import desktopConfig from "lighthouse/core/config/desktop-config.js";
import { chromium } from "playwright";

import { fail, pass, qaUrl, ROOT } from "./lib.mjs";

const TAG = "lighthouse";

const PROFILES = {
  mobile: {
    config: undefined,
    throttlingMethod: "simulate",
    judgeBy: "performance",
    scores: { performance: 85, accessibility: 95, "best-practices": 95, seo: 100 },
    metrics: { "cumulative-layout-shift": 0.05, "total-blocking-time": 600 },
  },
  "mobile-measured": {
    config: undefined,
    throttlingMethod: "devtools",
    judgeBy: "largest-contentful-paint",
    scores: {},
    metrics: { "largest-contentful-paint": 2500, "cumulative-layout-shift": 0.05 },
  },
  desktop: {
    config: desktopConfig,
    throttlingMethod: "simulate",
    judgeBy: "performance",
    scores: { performance: 90, accessibility: 95, "best-practices": 95, seo: 100 },
    metrics: { "largest-contentful-paint": 1200, "cumulative-layout-shift": 0.05 },
  },
};

const argValue = (name, fallback) => {
  const flag = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return flag ? flag.slice(name.length + 3) : fallback;
};

const url = `${qaUrl()}/`;
const runs = Math.max(1, Number(argValue("runs", "3")));
const only = argValue("only", "").split(",").filter(Boolean);
const profiles = Object.keys(PROFILES).filter((id) => only.length === 0 || only.includes(id));
const outDir = join(ROOT, "test-results", "lighthouse");
mkdirSync(outDir, { recursive: true });

// Prefer Playwright's Chromium (always installed for the e2e suites) over a system Chrome.
const chromePath = process.env.CHROME_PATH || chromium.executablePath();

async function runOnce(id, index) {
  const profile = PROFILES[id];
  const chrome = await chromeLauncher.launch({
    chromePath,
    chromeFlags: ["--headless=new", "--no-sandbox", "--disable-gpu", "--no-first-run"],
  });
  try {
    const flags = { port: chrome.port, output: ["json", "html"], logLevel: "error", throttlingMethod: profile.throttlingMethod };
    const result = await lighthouse(url, flags, profile.config);
    if (!result) throw new Error("Lighthouse returned no result");
    const [json, html] = result.report;
    writeFileSync(join(outDir, `${id}-${index + 1}.json`), json);
    writeFileSync(join(outDir, `${id}-${index + 1}.html`), html);
    return result.lhr;
  } finally {
    await chrome.kill();
  }
}

function summarize(lhr) {
  const scores = Object.fromEntries(Object.entries(lhr.categories).map(([id, category]) => [id, Math.round((category.score ?? 0) * 100)]));
  const metrics = Object.fromEntries(
    ["largest-contentful-paint", "cumulative-layout-shift", "total-blocking-time", "first-contentful-paint", "speed-index"].map((id) => [
      id,
      lhr.audits[id]?.numericValue ?? Number.NaN,
    ]),
  );
  const failedAudits = Object.values(lhr.audits)
    .filter((audit) => audit.score !== null && audit.score < 1 && audit.scoreDisplayMode === "binary")
    .map((audit) => audit.id);
  const lcpElement = lhr.audits["largest-contentful-paint-element"]?.details?.items?.[0]?.items?.[0]?.node?.snippet ?? null;
  return { scores, metrics, failedAudits, lcpElement };
}

const format = (id, value) => (id === "cumulative-layout-shift" ? value.toFixed(3) : `${Math.round(value)}ms`);

const summary = {};
for (const id of profiles) {
  const profile = PROFILES[id];
  const results = [];
  for (let index = 0; index < runs; index += 1) {
    const run = summarize(await runOnce(id, index));
    results.push(run);
    console.log(
      `[${TAG}] ${id} run ${index + 1}/${runs}: ${JSON.stringify(run.scores)} LCP ${format("largest-contentful-paint", run.metrics["largest-contentful-paint"])} CLS ${format("cumulative-layout-shift", run.metrics["cumulative-layout-shift"])} TBT ${format("total-blocking-time", run.metrics["total-blocking-time"])}`,
    );
  }
  // Median by the profile's key metric: higher is better for scores, lower for times.
  const key = (run) => (profile.judgeBy in run.scores ? -run.scores[profile.judgeBy] : run.metrics[profile.judgeBy]);
  const median = [...results].sort((a, b) => key(a) - key(b))[Math.floor(results.length / 2)];
  summary[id] = { throttlingMethod: profile.throttlingMethod, median, runs: results };

  for (const [category, min] of Object.entries(profile.scores)) {
    const value = median.scores[category];
    if (value >= min) pass(TAG, `${id} ${category} ${value} (budget ${min})`);
    else fail(TAG, `${id} ${category} ${value} is below ${min}`);
  }
  for (const [metric, max] of Object.entries(profile.metrics)) {
    const value = median.metrics[metric];
    if (value < max) pass(TAG, `${id} ${metric} ${format(metric, value)} (budget < ${max})`);
    else fail(TAG, `${id} ${metric} ${format(metric, value)} is over ${max}`);
  }
  if (id === "mobile") {
    console.log(`[${TAG}] mobile simulated LCP ${format("largest-contentful-paint", median.metrics["largest-contentful-paint"])} (reported; LCP is judged on mobile-measured)`);
  }
  if (median.failedAudits.length > 0) console.log(`[${TAG}] ${id} failing binary audits: ${median.failedAudits.join(", ")}`);
  if (median.lcpElement) console.log(`[${TAG}] ${id} LCP element: ${median.lcpElement}`);
}

writeFileSync(join(outDir, "summary.json"), JSON.stringify({ url, runs, date: new Date().toISOString(), summary }, null, 2));
console.log(`[${TAG}] reports in ${join("test-results", "lighthouse")}`);
