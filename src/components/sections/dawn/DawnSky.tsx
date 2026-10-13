"use client";

import { Mesh, Program, Renderer, Triangle } from "ogl";
import { useEffect } from "react";

import type { SkyLink } from "./sky-link";
import { SKY_FRAGMENT, SKY_VERTEX } from "./sky-shader";

/**
 * The S5 sky in WebGL (spec S5, 6.6, 13): one ogl full-frame triangle whose
 * fragment shader draws the dithered dawn ramp at the pin's progress.
 *
 * Loaded lazily by DawnMotion (next/dynamic, ssr false) only on desktop
 * motion, never on low-power devices, once the cart section has entered.
 * Renders nothing in React: it appends its own canvas to `host` (the sky
 * layer, which also holds the CSS gradient fallback underneath).
 *
 * - DPR capped at 1.5; alpha false; low-power GPU preference.
 * - Init waits for an idle moment (the reader is usually still scrolling
 *   out of the route pin), and the shaders compile off the main thread first
 *   where KHR_parallel_shader_compile exists, so ogl's synchronous compile
 *   then hits the warm program cache instead of stalling a frame.
 * - requestAnimationFrame only while the pin is active or its scrub is still
 *   settling (link.running()), and only while the progress keeps changing:
 *   parked inside the pin, the loop stops after a few unchanged frames. Every
 *   pin toggle, refresh and timeline update wakes it. Off-screen it is stopped.
 * - No WebGL, a failed init or compile, no first frame within 1.5s of the
 *   build, or a lost context: the canvas is removed and the CSS gradient
 *   stays (host[data-sky=css]).
 *
 * host data attributes (read by CSS and the e2e suite):
 * - data-sky: "webgl" once the first frame is drawn, "css" otherwise
 * - data-sky-state: "running" while the loop runs, "idle" when stopped
 * - data-sky-frames: frames drawn so far, written whenever the loop stops
 * - data-sky-fallback: why the CSS gradient took over (unavailable, init, timeout, lost)
 */

export const SKY_INIT_TIMEOUT_MS = 1500;
/** The parallel compile may take this long before the gradient takes over for good. */
const SKY_COMPILE_TIMEOUT_MS = 6000;
/** Unchanged frames before a parked loop stops. */
const IDLE_AFTER_FRAMES = 8;
const MAX_DPR = 1.5;

export type SkyFailure = "unavailable" | "init" | "timeout" | "lost";

type DawnSkyProps = {
  host: HTMLElement;
  link: SkyLink;
  onFallback: (reason: SkyFailure) => void;
};

const CONTEXT_ATTRIBUTES: WebGLContextAttributes = {
  alpha: false,
  depth: false,
  stencil: false,
  antialias: false,
  premultipliedAlpha: false,
  preserveDrawingBuffer: false,
  powerPreference: "low-power",
};

type Warmup = { done(): boolean; dispose(): void };

/**
 * Compile and link the sky program on the driver's worker threads
 * (KHR_parallel_shader_compile) and report when it is ready, without a
 * blocking status query. Without the extension it is ready at once.
 */
function warmShaders(gl: WebGLRenderingContext | WebGL2RenderingContext): Warmup {
  const parallel = gl.getExtension("KHR_parallel_shader_compile") as { COMPLETION_STATUS_KHR: number } | null;
  if (!parallel) return { done: () => true, dispose: () => {} };
  const vertex = gl.createShader(gl.VERTEX_SHADER);
  const fragment = gl.createShader(gl.FRAGMENT_SHADER);
  const program = gl.createProgram();
  if (!vertex || !fragment || !program) return { done: () => true, dispose: () => {} };
  gl.shaderSource(vertex, SKY_VERTEX);
  gl.shaderSource(fragment, SKY_FRAGMENT);
  gl.compileShader(vertex);
  gl.compileShader(fragment);
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  return {
    done: () => gl.isContextLost() || gl.getProgramParameter(program, parallel.COMPLETION_STATUS_KHR) === true,
    dispose: () => {
      gl.deleteProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
    },
  };
}

export default function DawnSky({ host, link, onFallback }: DawnSkyProps) {
  useEffect(() => {
    let disposed = false;
    let ready = false;
    let raf = 0;
    let pollRaf = 0;
    let idle = 0;
    let frames = 0;
    let still = 0;
    let timer = 0;
    let warmup: Warmup | null = null;
    let context: WebGLRenderingContext | WebGL2RenderingContext | null = null;
    let lastProgress = Number.NaN;
    let renderer: Renderer | null = null;
    let program: Program | null = null;
    let mesh: Mesh | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let unlisten = () => {};

    const canvas = document.createElement("canvas");
    canvas.className = "dawn-sky-canvas";
    canvas.setAttribute("aria-hidden", "true");

    const setState = (state: "running" | "idle") => {
      if (state === "idle") host.dataset.skyFrames = String(frames);
      if (host.dataset.skyState !== state) host.dataset.skyState = state;
    };

    const onLost = () => fail("lost");

    const teardown = () => {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(pollRaf);
      raf = 0;
      pollRaf = 0;
      warmup?.dispose();
      warmup = null;
      resizeObserver?.disconnect();
      unlisten();
      canvas.removeEventListener("webglcontextlost", onLost);
      const gl = renderer?.gl ?? context;
      if (gl && !gl.isContextLost()) gl.getExtension("WEBGL_lose_context")?.loseContext();
      canvas.remove();
      setState("idle");
    };

    const startTimer = (ms: number) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (!ready) fail("timeout");
      }, ms);
    };

    function fail(reason: SkyFailure) {
      if (disposed) return;
      disposed = true;
      window.clearTimeout(timer);
      // Show the gradient before the canvas leaves, so no frame is empty.
      host.dataset.sky = "css";
      host.dataset.skyFallback = reason;
      teardown();
      onFallback(reason);
    }

    /** Draws when the progress changed; false when there was nothing new to draw. */
    const draw = (): boolean => {
      if (!renderer || !program || !mesh) return false;
      const progress = link.progress();
      if (progress === lastProgress) return false;
      lastProgress = progress;
      program.uniforms.uProgress.value = progress;
      renderer.render({ scene: mesh });
      frames += 1;
      if (!ready) {
        ready = true;
        window.clearTimeout(timer);
        host.dataset.sky = "webgl";
      }
      return true;
    };

    const tick = () => {
      raf = 0;
      if (disposed) return;
      still = draw() ? 0 : still + 1;
      if (link.running() && still < IDLE_AFTER_FRAMES) {
        setState("running");
        raf = requestAnimationFrame(tick);
      } else {
        setState("idle");
      }
    };

    // Off-screen refreshes and updates that change nothing never schedule a frame.
    const wake = () => {
      if (disposed || raf !== 0 || !program) return;
      if (!link.running() && link.progress() === lastProgress) return;
      still = 0;
      raf = requestAnimationFrame(tick);
    };

    const resize = () => {
      if (!renderer || !program) return;
      const width = host.clientWidth;
      const height = host.clientHeight;
      if (width === 0 || height === 0) return;
      renderer.setSize(width, height);
      program.uniforms.uResolution.value = [renderer.gl.drawingBufferWidth, renderer.gl.drawingBufferHeight];
      lastProgress = Number.NaN;
      draw();
    };

    const build = (webgl2: boolean) => {
      startTimer(SKY_INIT_TIMEOUT_MS);
      try {
        renderer = new Renderer({
          canvas,
          dpr: Math.min(window.devicePixelRatio || 1, MAX_DPR),
          alpha: false,
          depth: false,
          antialias: false,
          premultipliedAlpha: false,
          powerPreference: "low-power",
          webgl: webgl2 ? 2 : 1,
        });
        const gl = renderer.gl;
        program = new Program(gl, {
          vertex: SKY_VERTEX,
          fragment: SKY_FRAGMENT,
          uniforms: { uProgress: { value: link.progress() }, uResolution: { value: [1, 1] } },
          depthTest: false,
          depthWrite: false,
          cullFace: null,
        });
        // ogl has already read the link status (it leaves no uniform map on failure).
        if (!(program.uniformLocations as Program["uniformLocations"] | undefined)) throw new Error("Sky shader failed to link");
        mesh = new Mesh(gl, { geometry: new Triangle(gl), program });
        warmup?.dispose();
        warmup = null;

        canvas.addEventListener("webglcontextlost", onLost);
        host.append(canvas);
        resize();
        resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(host);
        unlisten = link.listen(wake);
        wake();
      } catch {
        fail("init");
      }
    };

    const start = () => {
      idle = 0;
      if (disposed) return;
      // Probe first: ogl logs an error and throws when no context exists.
      const webgl2 = canvas.getContext("webgl2", CONTEXT_ATTRIBUTES);
      context = webgl2 ?? canvas.getContext("webgl", CONTEXT_ATTRIBUTES);
      if (!context) {
        fail("unavailable");
        return;
      }
      startTimer(SKY_COMPILE_TIMEOUT_MS);
      warmup = warmShaders(context);
      const poll = () => {
        pollRaf = 0;
        if (disposed) return;
        if (warmup?.done() === false) {
          pollRaf = requestAnimationFrame(poll);
          return;
        }
        build(webgl2 !== null);
      };
      poll();
    };

    const hasIdle = typeof window.requestIdleCallback === "function";
    idle = hasIdle ? window.requestIdleCallback(start, { timeout: 700 }) : window.setTimeout(start, 50);

    return () => {
      window.clearTimeout(timer);
      if (idle !== 0) {
        if (hasIdle) window.cancelIdleCallback(idle);
        else window.clearTimeout(idle);
      }
      if (disposed) return;
      disposed = true;
      host.dataset.sky = "css";
      teardown();
    };
  }, [host, link, onFallback]);

  return null;
}
