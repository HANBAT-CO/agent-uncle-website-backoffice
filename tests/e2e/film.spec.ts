import { expect, test, type Page } from "@playwright/test";

import { openPage, settle } from "./chrome-helpers";

/**
 * S9 film (WP-18): the cinema reveal from the dot, the muted brand loop, the
 * film with sound and chapter seeking, the 9:16 cut on phones.
 *
 * desktop: the frame grows out of a 16px dot (the reveal starts before the
 *   pin) and settles into the double-bezel card with no layout shift;
 *   nothing has sound before a click; 영상 보기 plays with sound; the 확보
 *   tick seeks to its chapter start; the end hands back to the loop; the
 *   film pauses when scrolled away; a jump to #film lands on the settled
 *   card, and so does a deep link on load (no layout shift, no record
 *   chrome); keyboard focus never sits under the frame; the timeline is one
 *   Tab stop with arrow keys; the muted loop has its own pause (WCAG 2.2.2);
 *   the logo keeps its plate while green sits under the nav; 영상 내용 opens
 *   on the first mouse press; a scroll refresh past the pin shifts nothing;
 *   the heading, controls and ticks are never left at a partial opacity
 *   (AA contrast in every scrolled state); the loop's poster never ghosts
 *   over the loop's own first frame.
 * mobile: a green slot around the dot until it opens with rounded corners;
 *   the loop's first frame (green, never the light outro card) with a play
 *   mark; the 9:16 cut plays in a 9:16 frame with a full-screen button; a
 *   requested film keeps its open frame when the reader scrolls back up and
 *   pauses only below a quarter in view.
 * reduced-motion: no pin, no mask, no autoplay; the loop's first frame with
 *   its play mark and button, and the film's text open by default.
 *
 * Film hooks: [data-film-pin-spacer] > [data-film-scene] (pinned on
 * desktop), [data-film-core] (the card's paper core),
 * [data-film-media][data-display=field|poster|loop|master] [data-master]
 * [data-loop] (the frame), [data-film-video=loop|master],
 * [data-film-tick=<index>], [data-film-details-note].
 */

const CHAPTER_START = { 확보: 17 } as const;
/** FilmMotion: the reveal scrubs from the spacer's top at 55% of the viewport over 0.55 + 0.8 viewports. */
const REVEAL_LEAD = 0.55;
const REVEAL_LENGTH = 1.35;
/** reveal.ts REVEAL.settle and the shell's ring at rest. */
const SETTLE = 0.75;
const RING_REST = 0.3;

/** A tick's accessible name: its label and what pressing it does. */
const tickName = (label: string) => `${label} 구간부터 보기`;

function onlyIn(project: string) {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== project, `${project} project only`);
  });
}

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}

type VideoState = { muted: boolean; paused: boolean; time: number; src: string };

async function video(page: Page, which: "loop" | "master"): Promise<VideoState> {
  return page.locator(`[data-film-video="${which}"]`).evaluate((element) => {
    const media = element as HTMLVideoElement;
    return { muted: media.muted, paused: media.paused, time: media.currentTime, src: media.currentSrc };
  });
}

/**
 * Open the page and let the sections above the film finish their lazy islands
 * (they can grow after a jump and move every pin below): jump next to the film,
 * wait for the network to go quiet and for the film's position to hold.
 */
async function openFilm(page: Page): Promise<void> {
  await openPage(page);
  const filmTop = () => page.evaluate(() => Math.round(document.getElementById("film")?.getBoundingClientRect().top ?? 0) + Math.round(window.scrollY));
  await page.evaluate(() => {
    const film = document.getElementById("film");
    if (film) window.scrollTo({ top: film.getBoundingClientRect().top + window.scrollY - window.innerHeight, behavior: "instant" });
  });
  await settle(page);
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);
  let last = await filmTop();
  for (let check = 0; check < 10; check += 1) {
    await page.waitForTimeout(500);
    const next = await filmTop();
    if (Math.abs(next - last) <= 1) return;
    last = next;
  }
}

/** True once the film really runs: play() was not just called, frames advance and the duration is known. */
async function filmRunning(page: Page): Promise<boolean> {
  return page.locator('[data-film-video="master"]').evaluate((element) => {
    const media = element as HTMLVideoElement;
    return (
      !media.paused &&
      media.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
      media.currentTime > 0 &&
      Number.isFinite(media.duration)
    );
  });
}

/**
 * Scroll the desktop film reveal to `progress` (0..1) and wait for scroll and the scrub to rest.
 * Lazy sections above can grow after a jump (pins refresh and move down), so the target is
 * measured again until it holds.
 */
async function toReveal(page: Page, progress: number): Promise<void> {
  const target = () =>
    page.evaluate(
      ({ p, lead, length }) => {
        const spacer = document.querySelector<HTMLElement>("[data-film-pin-spacer]");
        if (!spacer?.classList.contains("pin-spacer")) throw new Error("the film scene is not pinned");
        const start = spacer.getBoundingClientRect().top + window.scrollY - lead * window.innerHeight;
        return Math.round(start + p * length * window.innerHeight);
      },
      { p: progress, lead: REVEAL_LEAD, length: REVEAL_LENGTH },
    );
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const top = await target();
    await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), top);
    await settle(page);
    // scrub 0.6: let the reveal catch up with the scroll position.
    await page.waitForTimeout(900);
    if (Math.abs((await target()) - top) <= 2) return;
  }
  throw new Error("the film pin kept moving");
}

/** True when the element's centre is on screen and nothing covers it there. */
async function shownAtCentre(page: Page, selector: string): Promise<boolean> {
  return page.locator(selector).first().evaluate((element) => {
    const box = element.getBoundingClientRect();
    const x = box.left + box.width / 2;
    const y = box.top + box.height / 2;
    if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) return false;
    const top = document.elementFromPoint(x, y);
    return top !== null && (top === element || element.contains(top));
  });
}

/** Bring the card's core into the middle of the viewport (unpinned layouts). */
async function toCard(page: Page): Promise<void> {
  await page.locator("[data-film-core]").evaluate((core) => core.scrollIntoView({ block: "center", behavior: "instant" }));
  await settle(page);
}

/** Put the frame's centre (the dot) at `share` of the viewport height. */
async function centreFrameAt(page: Page, share: number): Promise<void> {
  await page.locator("[data-film-core]").evaluate((element, at) => {
    const box = element.getBoundingClientRect();
    window.scrollTo({ top: box.top + window.scrollY + box.height / 2 - at * window.innerHeight, behavior: "instant" });
  }, share);
  await settle(page);
}

async function leaveFilm(page: Page): Promise<void> {
  await page.evaluate(() => document.getElementById("signup")?.scrollIntoView({ block: "start", behavior: "instant" }));
  await settle(page);
}

function filmRequests(page: Page): string[] {
  const urls: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/media/film/")) urls.push(new URL(request.url()).pathname);
  });
  return urls;
}

test.describe("film on desktop", () => {
  onlyIn("desktop");

  test("grows out of the dot and settles into the double-bezel card without layout shift", async ({ page }) => {
    const errors = collectErrors(page);
    await openFilm(page);

    await toReveal(page, 0);
    const media = page.locator("[data-film-media]");
    const atDot = await media.evaluate((element) => {
      const style = (element as HTMLElement).style;
      const radius = Number(/circle\(([\d.]+)px/.exec(style.clipPath)?.[1] ?? Number.NaN);
      const scale = Number(/scale\(([\d.]+)\)/.exec(style.transform)?.[1] ?? Number.NaN);
      return { clipPath: style.clipPath, display: element.getAttribute("data-display"), onScreen: radius * scale };
    });
    expect(atDot.clipPath).toMatch(/^circle\(/);
    expect(atDot.display).toBe("field");
    // A 16px circle on screen: the page's dot.
    expect(atDot.onScreen).toBeGreaterThan(7.5);
    expect(atDot.onScreen).toBeLessThan(8.5);
    // The dot is the plain #0C483E field, never a crop of the loop's poster (a mint cube face).
    await expect(page.locator("[data-film-loop-poster]")).toHaveCSS("opacity", "0");
    await toReveal(page, 0.08);
    await expect(page.locator("[data-film-loop-poster]")).toHaveCSS("opacity", "0");
    // The shell's ring already shows faintly: a slot for the film before it opens.
    expect(await page.locator("[data-film-scene]").evaluate((scene) => Number((scene as HTMLElement).style.getPropertyValue("--film-ring")))).toBeCloseTo(
      RING_REST,
      2,
    );

    // Past the pin's start, the circle covers the scene.
    await toReveal(page, 0.5);
    const coreBefore = await page.locator("[data-film-core]").boundingBox();
    const covered = await media.boundingBox();
    expect(covered?.x).toBeLessThanOrEqual(0);
    expect(covered?.y).toBeLessThanOrEqual(0);
    expect((covered?.x ?? 0) + (covered?.width ?? 0)).toBeGreaterThanOrEqual(1440);
    expect((covered?.y ?? 0) + (covered?.height ?? 0)).toBeGreaterThanOrEqual(900);

    await toReveal(page, 0.9);
    await expect(media).toHaveCSS("clip-path", "inset(0px round 24px)");
    const settled = await media.boundingBox();
    const coreAfter = await page.locator("[data-film-core]").boundingBox();
    // The frame sits exactly in the core, and the core never moved: no layout shift.
    for (const key of ["x", "y", "width", "height"] as const) {
      expect(Math.abs((settled?.[key] ?? 0) - (coreAfter?.[key] ?? 0))).toBeLessThanOrEqual(1);
      expect(Math.abs((coreBefore?.[key] ?? 0) - (coreAfter?.[key] ?? 0))).toBeLessThanOrEqual(1);
    }
    const ratio = (coreAfter?.width ?? 0) / (coreAfter?.height ?? 1);
    expect(ratio).toBeCloseTo(16 / 9, 1);
    expect(errors).toEqual([]);
  });

  test("starts the muted loop only once the dot has opened, and only when autoplay is allowed", async ({ page }) => {
    await openFilm(page);
    // Mirrors isLowPower() in src/lib/device.ts, including WebKit's clamped core count of 4 on iOS / iPadOS.
    const lowPower = await page.evaluate(() => {
      const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
      const ios = /iPhone|iPad|iPod/.test(nav.userAgent) || (/Macintosh/.test(nav.userAgent) && nav.maxTouchPoints > 1);
      const cores = ios && nav.hardwareConcurrency === 4 ? 0 : (nav.hardwareConcurrency ?? 0);
      const memory = nav.deviceMemory ?? 0;
      return Boolean(nav.connection?.saveData) || (cores > 0 && cores <= 4) || (memory > 0 && memory <= 4);
    });

    await toReveal(page, 0.1);
    expect((await video(page, "loop")).paused).toBe(true);
    await expect(page.locator("[data-film-media]")).toHaveAttribute("data-display", "field");

    await toReveal(page, 0.6);
    const loop = await video(page, "loop");
    expect(loop.muted).toBe(true);
    if (lowPower) {
      expect(loop.paused).toBe(true);
      // The loop's first frame as the poster: green, never the light outro card.
      await expect(page.locator("[data-film-media]")).toHaveAttribute("data-display", /^(loop|field)$/);
    } else {
      await expect.poll(async () => (await video(page, "loop")).paused).toBe(false);
      await expect(page.locator("[data-film-media]")).toHaveAttribute("data-display", "loop");
    }
  });

  test("the muted loop has its own pause (WCAG 2.2.2) that holds until the reader plays it again", async ({ page }) => {
    await openFilm(page);
    await toReveal(page, 0.9);
    const loopRuns = await page.locator('[data-film-video="loop"]').evaluate((element) => !(element as HTMLVideoElement).paused);
    test.skip(!loopRuns, "the loop does not autoplay here (low power)");
    const media = page.locator("[data-film-media]");

    const pause = page.getByRole("button", { name: "미리보기 멈춤", exact: true });
    await expect(pause).toBeVisible();
    expect(await shownAtCentre(page, "[data-film-loop-toggle]")).toBe(true);
    await pause.click();
    await expect.poll(async () => (await video(page, "loop")).paused).toBe(true);
    // The paused loop keeps its frame: no flash to another layer.
    await expect(media).toHaveAttribute("data-display", "loop");
    const resume = page.getByRole("button", { name: "미리보기 재생", exact: true });
    await expect(resume).toBeVisible();

    // Leaving and coming back does not restart it.
    await leaveFilm(page);
    await toReveal(page, 0.9);
    await page.waitForTimeout(800);
    expect((await video(page, "loop")).paused).toBe(true);
    await expect(resume).toBeVisible();

    await resume.click();
    await expect.poll(async () => (await video(page, "loop")).paused).toBe(false);
    await expect(pause).toBeVisible();

    // While the film itself runs, its own controls take over.
    await page.getByRole("button", { name: "영상 보기", exact: true }).click();
    await expect.poll(() => filmRunning(page), { timeout: 15_000 }).toBe(true);
    await expect(page.locator("[data-film-loop-toggle]")).toBeHidden();
  });

  test("has no sound before a click; 영상 보기 plays the film with sound and the toggle stays visible", async ({ page }) => {
    const requests = filmRequests(page);
    await openFilm(page);
    await toReveal(page, 0.9);

    for (const which of ["loop", "master"] as const) {
      expect((await video(page, which)).muted).toBe(true);
    }
    expect((await video(page, "master")).paused).toBe(true);
    const sound = page.locator("[data-film-sound]");
    await expect(sound).toBeHidden();

    await page.getByRole("button", { name: "영상 보기", exact: true }).click();
    await expect.poll(() => filmRunning(page), { timeout: 15_000 }).toBe(true);
    const playing = await video(page, "master");
    expect(playing.muted).toBe(false);
    expect(playing.src).toMatch(/\/media\/film\/promo-16x9-1080\.mp4$/);
    await expect(page.locator("[data-film-media]")).toHaveAttribute("data-display", "master");
    await expect(page.getByRole("button", { name: "멈춤", exact: true })).toBeVisible();

    await expect(sound).toBeVisible();
    await expect(sound).toHaveAccessibleName("소리 끄기");
    await sound.click();
    expect((await video(page, "master")).muted).toBe(true);
    await expect(sound).toHaveAccessibleName("소리 켜기");

    await page.getByRole("button", { name: "멈춤", exact: true }).click();
    await expect.poll(async () => (await video(page, "master")).paused).toBe(true);
    await expect(page.getByRole("button", { name: "영상 보기", exact: true })).toBeVisible();

    // Only audited release files: never the dev fixture.
    expect(requests.some((url) => url.includes("dev-fixture"))).toBe(false);
  });

  test("the 확보 tick seeks the film to its chapter start and plays", async ({ page }) => {
    await openFilm(page);
    await toReveal(page, 0.9);
    await page.locator('[data-film-video="master"]').evaluate((element) => {
      const media = element as HTMLVideoElement;
      const seeks: number[] = [];
      (window as unknown as { __filmSeeks: number[] }).__filmSeeks = seeks;
      media.addEventListener("seeked", () => seeks.push(media.currentTime));
    });

    const tick = page.getByRole("list", { name: "영상 구간" }).getByRole("button", { name: tickName("확보") });
    await tick.click();
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __filmSeeks: number[] }).__filmSeeks.find((t) => t > 1) ?? -1), {
        timeout: 15_000,
      })
      .toBeGreaterThan(0);
    const landed = await page.evaluate(() => (window as unknown as { __filmSeeks: number[] }).__filmSeeks.find((t) => t > 1) ?? -1);
    expect(Math.abs(landed - CHAPTER_START.확보)).toBeLessThan(0.5);
    await expect.poll(() => filmRunning(page), { timeout: 15_000 }).toBe(true);
    expect((await video(page, "master")).muted).toBe(false);
    await expect(tick).toHaveAttribute("aria-current", "true");
  });

  test("at the end the frame holds the end poster, then returns to the loop, and the button reads 영상 보기", async ({ page }) => {
    await openFilm(page);
    await toReveal(page, 0.9);
    await page.getByRole("list", { name: "영상 구간" }).getByRole("button", { name: tickName("기록") }).click();
    await expect.poll(() => filmRunning(page), { timeout: 15_000 }).toBe(true);
    // Skip to the last second of the film.
    await page.locator('[data-film-video="master"]').evaluate((element) => {
      const media = element as HTMLVideoElement;
      media.currentTime = Math.max(0, media.duration - 0.8);
    });
    await expect.poll(() => page.locator('[data-film-video="master"]').evaluate((element) => (element as HTMLVideoElement).ended), {
      timeout: 15_000,
    }).toBe(true);
    const media = page.locator("[data-film-media]");
    await expect(media).toHaveAttribute("data-display", "poster");
    await expect(media).toHaveAttribute("data-master", "idle");
    await expect(page.getByRole("button", { name: "영상 보기", exact: true })).toBeVisible();
    await expect(page.locator("[data-film-sound]")).toBeHidden();
    await expect(page.locator("[data-film-tick][aria-current]")).toHaveCount(0);
    // Spec S9: then the frame returns to the loop (playing again where muted autoplay is allowed).
    await expect(media).toHaveAttribute("data-display", "loop", { timeout: 8_000 });
  });

  test("a jump to #film (the hero's 영상 보기) lands on the settled card with its play button in view", async ({ page }) => {
    await openFilm(page);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await settle(page);
    await page.locator('[data-section="hero"] a[href="#film"]').click();
    await settle(page);
    await page.waitForTimeout(1200);
    await expect(page.locator("[data-film-media]")).toHaveCSS("clip-path", "inset(0px round 24px)");
    expect(await shownAtCentre(page, ".film-play")).toBe(true);
    await expect(page.locator("[data-film-media]")).not.toHaveAttribute("data-display", "field");
  });

  test("a deep link to #film loads onto the settled card: no layout shift, no record chrome sliding over it", async ({ page }) => {
    const errors = collectErrors(page);
    await page.addInitScript(() => {
      const probe = { cls: 0, rail: [] as string[] };
      (window as unknown as { __filmLoad: typeof probe }).__filmLoad = probe;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) {
          if (!entry.hadRecentInput) probe.cls += entry.value;
        }
      }).observe({ type: "layout-shift", buffered: true });
      const sample = () => {
        const mode = document.querySelector<HTMLElement>("[data-record-column]")?.dataset.railMode;
        if (mode && probe.rail.at(-1) !== mode) probe.rail.push(mode);
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    await page.goto("/#film");
    await page.locator("[data-chrome-root][data-hydrated]").waitFor({ state: "attached" });
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);
    await page.waitForTimeout(1500);

    const load = await page.evaluate(() => (window as unknown as { __filmLoad: { cls: number; rail: string[] } }).__filmLoad);
    expect(load.cls).toBeLessThan(0.01);
    // The rail and the plate never showed over the card (film hides them).
    expect(load.rail.filter((mode) => mode !== "hidden")).toEqual([]);
    await expect(page.locator("[data-film-media]")).toHaveCSS("clip-path", "inset(0px round 24px)");
    expect(await shownAtCentre(page, ".film-play")).toBe(true);
    expect(errors).toEqual([]);
  });

  test("while green sits under the nav, the ㅅㅊ symbol keeps its paper plate", async ({ page }) => {
    await openFilm(page);
    await toReveal(page, 0.45);
    await expect(page.locator("[data-film-scene]")).toHaveAttribute("data-film-under-nav", "");
    const plate = page.locator(".au-logo-plate");
    await expect(plate).toHaveCSS("background-color", "rgb(245, 244, 238)");
    // Back on the day ground once the card has landed below the nav.
    await toReveal(page, 0.9);
    await expect(page.locator("[data-film-scene]")).not.toHaveAttribute("data-film-under-nav");
    await expect(plate).toHaveCSS("background-color", "rgba(245, 244, 238, 0)");
  });

  test("영상 내용 opens on the first mouse press, wherever it sits on screen", async ({ page }) => {
    await openFilm(page);
    await toReveal(page, 1);
    const details = page.locator("[data-film-details]");
    const summary = page.locator(".film-details-summary");
    for (const at of [0.9, 0.5]) {
      await details.evaluate((element) => {
        (element as HTMLDetailsElement).open = false;
      });
      await summary.evaluate((element, share) => {
        const box = element.getBoundingClientRect();
        window.scrollTo({ top: box.top + window.scrollY - share * window.innerHeight, behavior: "instant" });
      }, at);
      await settle(page);
      const before = await summary.boundingBox();
      await page.mouse.click((before?.x ?? 0) + 24, (before?.y ?? 0) + (before?.height ?? 0) / 2);
      await expect(details).toHaveJSProperty("open", true);
      // A mouse press never scrolls the page under the pointer.
      const after = await summary.boundingBox();
      expect(Math.abs((after?.y ?? 0) - (before?.y ?? 0))).toBeLessThanOrEqual(1);
    }
  });

  test("keyboard focus on a control mid-reveal lands the card first, so the focus is never under the frame", async ({ page }) => {
    await openFilm(page);
    await toReveal(page, 0.35);
    // Keyboard modality, then focus the play button as Tab would.
    await page.keyboard.press("Shift");
    await page.locator(".film-play").focus();
    await expect(page.locator("[data-film-media]")).toHaveCSS("clip-path", "inset(0px round 24px)", { timeout: 8_000 });
    await expect.poll(() => shownAtCentre(page, ".film-play")).toBe(true);
    const progress = await page.evaluate(
      ({ lead, length }) => {
        const spacer = document.querySelector<HTMLElement>("[data-film-pin-spacer]");
        const start = (spacer?.getBoundingClientRect().top ?? 0) + window.scrollY - lead * window.innerHeight;
        return (window.scrollY - start) / (length * window.innerHeight);
      },
      { lead: REVEAL_LEAD, length: REVEAL_LENGTH },
    );
    expect(progress).toBeGreaterThanOrEqual(SETTLE);
  });

  test("the chapter timeline is one Tab stop; arrow keys, Home and End move along it", async ({ page }) => {
    await openFilm(page);
    await toReveal(page, 0.9);
    const ticks = page.locator("[data-film-tick]");
    await expect(ticks).toHaveCount(8);
    await expect(page.locator('[data-film-tick][tabindex="0"]')).toHaveCount(1);
    await expect(ticks.nth(0)).toHaveAttribute("tabindex", "0");

    await page.keyboard.press("Shift");
    await ticks.nth(0).focus();
    await page.keyboard.press("ArrowRight");
    await expect(ticks.nth(1)).toBeFocused();
    await expect(ticks.nth(1)).toHaveAttribute("tabindex", "0");
    await expect(page.locator('[data-film-tick][tabindex="0"]')).toHaveCount(1);
    await page.keyboard.press("End");
    await expect(ticks.nth(7)).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(ticks.nth(0)).toBeFocused();
    await page.keyboard.press("ArrowLeft");
    await expect(ticks.nth(7)).toBeFocused();
    await page.keyboard.press("Home");
    await expect(ticks.nth(0)).toBeFocused();
    // The next Tab leaves the timeline for 영상 보기.
    await page.keyboard.press("Tab");
    await expect(page.locator(".film-play")).toBeFocused();
    // Nothing played: arrows only move focus.
    expect((await video(page, "master")).paused).toBe(true);
  });

  test("scrolling away pauses the film", async ({ page }) => {
    await openFilm(page);
    await toReveal(page, 0.9);
    await page.getByRole("button", { name: "영상 보기", exact: true }).click();
    await expect.poll(() => filmRunning(page), { timeout: 15_000 }).toBe(true);

    await leaveFilm(page);
    await expect.poll(async () => (await video(page, "master")).paused).toBe(true);
    await expect.poll(async () => (await video(page, "loop")).paused).toBe(true);
  });

  test("a scroll refresh with the film's tail on screen records no layout shift", async ({ page }) => {
    await page.addInitScript(() => {
      const shifts: number[] = [];
      (window as unknown as { __filmShifts: number[] }).__filmShifts = shifts;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) {
          if (!entry.hadRecentInput) shifts.push(entry.value);
        }
      }).observe({ type: "layout-shift" });
    });
    await openFilm(page);
    // The ticks, the controls and the details on screen, past the pin (where a lazy island mounting
    // below used to cost 0.15 to 0.8 per refresh).
    await page.evaluate(() => {
      const signup = document.getElementById("signup");
      if (signup) window.scrollTo({ top: signup.getBoundingClientRect().top + window.scrollY - 0.8 * window.innerHeight, behavior: "instant" });
    });
    await settle(page);
    await page.waitForTimeout(2500);
    await page.evaluate(() => {
      (window as unknown as { __filmShifts: number[] }).__filmShifts.length = 0;
      // ScrollTrigger refreshes every trigger (and reverts and rebuilds every pin) after a resize.
      window.dispatchEvent(new Event("resize"));
    });
    await page.waitForTimeout(1500);
    const shifts = await page.evaluate(() => (window as unknown as { __filmShifts: number[] }).__filmShifts);
    expect(shifts.reduce((sum, value) => sum + value, 0)).toBeLessThan(0.01);
  });

  test("the heading, the controls and the ticks are fully in or fully out at every reveal step (AA contrast)", async ({ page }) => {
    await openFilm(page);
    const opacity = (selector: string) => page.locator(selector).evaluate((element) => getComputedStyle(element).opacity);
    const expected: [number, { chrome: string; ticks: string }][] = [
      [0, { chrome: "1", ticks: "0" }],
      [0.3, { chrome: "0", ticks: "0" }],
      [0.6, { chrome: "0", ticks: "0" }],
      [0.7, { chrome: "0", ticks: "0" }],
      [0.9, { chrome: "1", ticks: "1" }],
    ];
    for (const [progress, want] of expected) {
      await toReveal(page, progress);
      expect(await opacity(".film-title"), `heading at ${progress}`).toBe(want.chrome);
      expect(await opacity(".film-bar"), `controls at ${progress}`).toBe(want.chrome);
      expect(await opacity("[data-film-chapters]"), `ticks at ${progress}`).toBe(want.ticks);
    }
    // At rest the tick labels read at their own colour (grey 600 on paper, 5:1).
    await expect(page.locator("[data-film-tick] .film-tick-label").first()).toHaveCSS("color", "rgb(99, 99, 99)");
  });

  test("the loop's poster never fades in over the loop's own first frame (no double exposure)", async ({ page }) => {
    await openFilm(page);
    await toReveal(page, 0.1);
    // The loop's first frame is decoded ahead of the reveal (one viewport early).
    await expect
      .poll(() => page.locator('[data-film-video="loop"]').evaluate((element) => (element as HTMLVideoElement).readyState), { timeout: 15_000 })
      .toBeGreaterThanOrEqual(2);
    await page.evaluate(() => {
      const media = document.querySelector<HTMLElement>("[data-film-media]");
      const poster = media?.querySelector<HTMLElement>("[data-film-loop-poster]");
      const samples: number[] = [];
      (window as unknown as { __posterOpacity: number[] }).__posterOpacity = samples;
      if (!media || !poster) return;
      const started = performance.now();
      const sample = () => {
        samples.push(Number(getComputedStyle(poster).opacity));
        if (performance.now() - started < 1500) requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    await toReveal(page, 0.4);
    await expect(page.locator("[data-film-media]")).toHaveAttribute("data-display", "loop");
    const samples = await page.evaluate(() => (window as unknown as { __posterOpacity: number[] }).__posterOpacity);
    expect(samples.length).toBeGreaterThan(10);
    expect(Math.max(...samples)).toBe(0);
  });
});

test.describe("film on mobile", () => {
  onlyIn("mobile");

  test("plays the 9:16 cut with sound in a 9:16 frame after a tap", async ({ page }) => {
    const errors = collectErrors(page);
    const requests = filmRequests(page);
    await openFilm(page);
    await toCard(page);

    const core = await page.locator("[data-film-core]").boundingBox();
    expect((core?.width ?? 0) / (core?.height ?? 1)).toBeCloseTo(9 / 16, 1);
    expect(core?.width ?? 0).toBeLessThanOrEqual(390 * 0.86 + 1);
    // No pin and no chapter ticks for the 9:16 cut.
    expect(await page.evaluate(() => document.querySelector("[data-film-scene]")?.parentElement?.classList.contains("pin-spacer"))).toBe(false);
    await expect(page.locator("[data-film-chapters]")).toBeHidden();
    // The dot has opened onto the loop's first frame (green, never the light outro card) with its play mark:
    // nothing plays, nothing has sound.
    await expect(page.locator("[data-film-media]")).toHaveAttribute("data-display", /^(loop|field)$/);
    await expect(page.locator(".film-mark-disc")).toHaveCSS("opacity", "1");
    expect((await video(page, "master")).muted).toBe(true);
    expect((await video(page, "loop")).paused).toBe(true);
    // The loop never plays in the 9:16 frame, so there is no loop pause either.
    await expect(page.locator("[data-film-loop-toggle]")).toBeHidden();

    await page.getByRole("button", { name: "영상 보기", exact: true }).tap();
    await expect.poll(() => filmRunning(page), { timeout: 15_000 }).toBe(true);
    const playing = await video(page, "master");
    expect(playing.src).toMatch(/\/media\/film\/promo-9x16-720\.mp4$/);
    expect(playing.muted).toBe(false);
    await expect(page.locator("[data-film-fullscreen]")).toBeVisible();
    await expect(page.locator("[data-film-fullscreen]")).toHaveAccessibleName("전체 화면으로 보기");

    // Only the 9:16 pre-play poster, the 720 loop's first frame fallback and the 9:16 cut: no 1080 video loop, no 16:9 master.
    expect(requests.some((url) => url.includes("poster-9x16-loop"))).toBe(true);
    expect(requests.some((url) => url.includes("/loop-1080.mp4") || url.includes("promo-16x9"))).toBe(false);
    expect(errors).toEqual([]);
  });

  test("waits as a green slot around the dot, then opens with the card's rounded corners", async ({ page }) => {
    await openFilm(page);
    const core = page.locator("[data-film-core]");
    const media = page.locator("[data-film-media]");
    const centreAt = (share: number) => centreFrameAt(page, share);

    // The shell is on screen but the dot is not yet: a faint green slot, the frame still the dot.
    await centreAt(1.15);
    await expect.poll(() => media.evaluate((element) => (element as HTMLElement).style.clipPath)).toMatch(/^circle\(8(\.0+)?px at 50% 50%\)$/);
    await expect(core).toHaveCSS("background-color", "rgba(12, 72, 62, 0.12)");
    await expect(media).toHaveCSS("border-radius", "24px");

    // The dot clears the bottom edge: it opens, and the frame keeps the core's corners all the way.
    await centreAt(0.84);
    await expect.poll(() => media.evaluate((element) => (element as HTMLElement).style.clipPath), { timeout: 5_000 }).toBe("");
    await expect(media).toHaveAttribute("data-display", /^(loop|field)$/);
  });

  test("scrolling away pauses the film", async ({ page }) => {
    await openFilm(page);
    await toCard(page);
    await page.getByRole("button", { name: "영상 보기", exact: true }).tap();
    await expect.poll(() => filmRunning(page), { timeout: 15_000 }).toBe(true);
    await leaveFilm(page);
    await expect.poll(async () => (await video(page, "master")).paused).toBe(true);
  });

  test("a requested film keeps its open frame when the reader scrolls back up, and pauses only below a quarter in view", async ({ page }) => {
    await openFilm(page);
    await toCard(page);
    const media = page.locator("[data-film-media]");
    await expect.poll(() => media.evaluate((element) => (element as HTMLElement).style.clipPath), { timeout: 5_000 }).toBe("");
    await page.getByRole("button", { name: "영상 보기", exact: true }).tap();
    await expect.poll(() => filmRunning(page), { timeout: 15_000 }).toBe(true);

    // Back above the open line (the frame's centre below 90% of the viewport), with most of the frame
    // still on screen: the film keeps playing in its open frame, never shrunk back to the dot.
    await centreFrameAt(page, 0.92);
    await page.waitForTimeout(600);
    expect(await media.evaluate((element) => (element as HTMLElement).style.clipPath)).toBe("");
    expect(await filmRunning(page)).toBe(true);
    await expect(media).toHaveAttribute("data-display", "master");

    // Under a quarter in view: the media manager pauses it (spec S9), and the frame stays open.
    await centreFrameAt(page, 1.3);
    await expect.poll(async () => (await video(page, "master")).paused).toBe(true);
    expect(await media.evaluate((element) => (element as HTMLElement).style.clipPath)).toBe("");

    // Back in view: the paused film's frame, ready for 영상 보기.
    await toCard(page);
    await expect(media).toHaveAttribute("data-display", "master");
    expect(await media.evaluate((element) => (element as HTMLElement).style.clipPath)).toBe("");
    await expect(page.getByRole("button", { name: "영상 보기", exact: true })).toBeVisible();
  });
});

test.describe("film under reduced motion", () => {
  onlyIn("reduced-motion");

  test("has no pin, no mask and no autoplay: the loop's first frame with its play mark and button, and the text open", async ({ page }) => {
    const errors = collectErrors(page);
    await openFilm(page);
    await toCard(page);
    await page.waitForTimeout(1500);

    expect(await page.evaluate(() => document.querySelector("[data-film-scene]")?.parentElement?.classList.contains("pin-spacer"))).toBe(false);
    const media = page.locator("[data-film-media]");
    expect(await media.evaluate((element) => (element as HTMLElement).style.clipPath)).toBe("");
    await expect(media).toHaveAttribute("data-display", /^(loop|field)$/);
    await expect(page.locator(".film-mark-disc")).toHaveCSS("opacity", "1");
    for (const which of ["loop", "master"] as const) {
      const state = await video(page, which);
      expect(state.paused).toBe(true);
      expect(state.muted).toBe(true);
    }
    await expect(page.getByRole("button", { name: "영상 보기", exact: true })).toBeVisible();
    // Nothing moves on its own, so there is nothing to pause.
    await expect(page.locator("[data-film-loop-toggle]")).toBeHidden();

    const note = page.locator("[data-film-details-note]");
    await expect(note).toBeVisible();
    await expect(note).toContainText("망원 셀렉트샵이 오버핏 셔츠 10장을 요청하고");
    // No speech in the film: the text says so (nothing to caption).
    await expect(note).toContainText("대사 없이 음악과 효과음만 나와요");
    expect(errors).toEqual([]);
  });

  test("still plays the film with sound on demand", async ({ page }) => {
    await openFilm(page);
    await toCard(page);
    await page.getByRole("button", { name: "영상 보기", exact: true }).click();
    await expect.poll(() => filmRunning(page), { timeout: 15_000 }).toBe(true);
    expect((await video(page, "master")).muted).toBe(false);
  });
});
