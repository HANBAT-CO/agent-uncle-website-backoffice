'use client';

/*
 * TearTicket (React Bits, TS + Tailwind variant: npx shadcn@latest add @react-bits/TearTicket-TS-TW).
 * Source: .context/scratch-toolkit/src/components/TearTicket.tsx, verified there with Korean
 * content (.context/research/toolkit/report.md). Used by the S6 receipt slip (spec S6, 9).
 *
 * Changes from the source, all opt-in through props so the default behaviour is the original:
 * - stubFocusable: false drops the stub's own role="button", tabIndex and key handler, for a
 *   stub that holds a real <button>; the stub turns inert once torn.
 * - Drag slop: a press on the stub starts the tear only after the pointer moves DRAG_SLOP px,
 *   so a tap on a button inside the stub stays a normal click.
 * - pullToTear: dragging the stub this share of its size away from the press point snaps every
 *   remaining bridge (spec S6: past 60% of its width).
 * - tearDuration: when a controlled `torn` turns true while nobody holds the stub (a button,
 *   a keyboard press, an auto-tear), the stub swings open and drops over this many ms instead
 *   of vanishing. Reduced motion keeps the instant swap.
 * - stubTouchAction: CSS touch-action of the stub (default none, as in the source); pan-y keeps
 *   vertical page scrolling over the stub while a horizontal swipe tears it.
 * - dimUsed, usedLabel, shadow: keep the torn body at full ink, localise the status text, and
 *   add a drop shadow that follows the cut shape (TearTicket.module.css).
 * - The 3D plane transform is skipped when tilt is off and rotate is 0, so text stays crisp.
 * - Lint fixes for React 19 rules: the config ref syncs in a layout effect, and data-instant is
 *   written to the DOM from events and effects instead of state.
 */

import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode
} from 'react';
import { motion, useMotionTemplate, useReducedMotion, useSpring, useTransform } from 'motion/react';

import styles from './TearTicket.module.css';

export type TearTicketOrientation = 'horizontal' | 'vertical';

export interface TearTicketProps {
  children?: ReactNode;
  stub?: ReactNode;
  image?: string;
  imageAlt?: string;
  scrim?: boolean;
  imageRadius?: number;
  orientation?: TearTicketOrientation;
  torn?: boolean;
  defaultTorn?: boolean;
  onTear?: () => void;
  width?: number;
  height?: number;
  stubSize?: number;
  radius?: number;
  holes?: number;
  holeSize?: number;
  notch?: number;
  roughness?: number;
  tearAngle?: number;
  stretch?: number;
  resistance?: number;
  rotate?: number;
  tilt?: boolean;
  tiltMax?: number;
  tiltReach?: number;
  parallax?: number;
  perspective?: number;
  background?: string;
  color?: string;
  border?: boolean;
  borderColor?: string;
  borderWidth?: number;
  stubBackground?: string;
  recenter?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
  /** False when the stub contains its own focusable control (a real button). */
  stubFocusable?: boolean;
  /** CSS touch-action of the stub's grab area. */
  stubTouchAction?: CSSProperties['touchAction'];
  /** Share of stubSize the pointer must travel from the press to tear every bridge (0 = off). */
  pullToTear?: number;
  /** Duration in ms of the tear played when a controlled `torn` turns true (0 = instant). */
  tearDuration?: number;
  /** Fade the body to 55% once torn (the source's used-ticket look). */
  dimUsed?: boolean;
  /** Status text announced once torn; empty renders no status region. */
  usedLabel?: string;
  /** CSS drop-shadow() list for the cut shape, e.g. 'drop-shadow(0 12px 20px rgb(0 0 0 / 0.1))'. */
  shadow?: string;
}

interface Point {
  x: number;
  y: number;
}

interface Bridge extends Point {
  y0: number;
  y1: number;
  mid: number;
  pts: number[][];
}

interface End extends Point {
  v: number;
}

interface Geometry {
  vertical: boolean;
  cross: number;
  body: string;
  stub: string;
  bridges: Bridge[];
  ends: End[];
  bodyOutline: string;
  stubOutline: string;
}

type Phase = 'idle' | 'held' | 'free' | 'drop' | 'return' | 'auto';

interface Pending extends Point {
  id: number;
}

interface Sim {
  raf: number;
  last: number;
  phase: Phase;
  id: number | null;
  pending: Pending | null;
  done: boolean;
  sign: number;
  hinge: Point;
  hingeV: number;
  grab: Point;
  start: Point;
  point: Point;
  a0: number;
  theta: number;
  thetaV: number;
  autoFrom: number;
  sx: number;
  sy: number;
  vx: number;
  vy: number;
  spin: number;
  pvx: number;
  pvy: number;
  pt: number;
  fade: number;
  age: number;
  bx: number;
  bv: number;
  snapped: boolean[];
  snapAt: number[];
  span: number[];
}

interface Cfg {
  geo: Geometry;
  tearAngle: number;
  stretch: number;
  resistance: number;
  height: number;
  notch: number;
  reduce: boolean | null;
  onTear?: () => void;
  controlled: boolean;
  used: boolean;
  pull: number;
  stubSize: number;
  tearDuration: number;
}

const TILT_SPRING = { stiffness: 220, damping: 24, mass: 0.6 };
const GRAVITY = 2400;
const ART_INSET = 8;
const ART_SPAN = 0.78;
const RETRACT = 0.17;
/** Pointer travel (ticket px) before a press on the stub becomes a drag. */
const DRAG_SLOP = 6;
/** Share of tearDuration the stub spends swinging open before it drops (the drop takes about 0.58s). */
const AUTO_SWING = 0.34;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const rad = (deg: number) => (deg * Math.PI) / 180;
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const noise = (seed: number) => {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
const f = (n: number) => n.toFixed(2);

const buildGeometry = (
  W: number,
  H: number,
  S: number,
  R: number,
  holes: number,
  hole: number,
  notch: number,
  rough: number,
  vertical: boolean
): Geometry => {
  const main = vertical ? H : W;
  const cross = vertical ? W : H;
  const x = main - S;
  const hr = hole / 2;
  const n = Math.max(1, Math.round(holes));
  const span = cross - 2 * notch;
  const bridge = Math.max(2, (span - n * hole) / (n + 1));
  const random = noise(n * 7919 + Math.round(cross));
  const at = (u: number, v: number): Point => (vertical ? { x: v, y: u } : { x: u, y: v });
  const pt = (u: number, v: number) => (vertical ? `${f(v)},${f(u)}` : `${f(u)},${f(v)}`);
  const arc = (r: number, sweep: number, u: number, v: number) =>
    `A${f(r)},${f(r)} 0 0 ${vertical ? 1 - sweep : sweep} ${pt(u, v)}`;
  const bridges: Bridge[] = [];
  for (let i = 0; i <= n; i += 1) {
    const y0 = notch + i * (bridge + hole);
    const y1 = y0 + bridge;
    const steps = Math.max(2, Math.round(bridge / 2.2));
    const pts: number[][] = [];
    for (let k = 1; k < steps; k += 1) pts.push([x + (random() - 0.5) * 2 * rough, y0 + (bridge * k) / steps]);
    bridges.push({ y0, y1, mid: (y0 + y1) / 2, pts, ...at(x, (y0 + y1) / 2) });
  }
  let body = `M${pt(R, 0)}L${pt(x - notch, 0)}${arc(notch, 0, x, notch)}`;
  bridges.forEach((b, i) => {
    b.pts.forEach(p => {
      body += `L${pt(p[0], p[1])}`;
    });
    body += `L${pt(x, b.y1)}`;
    if (i < n) body += arc(hr, 0, x, b.y1 + hole);
  });
  body += `${arc(notch, 0, x - notch, cross)}L${pt(R, cross)}${arc(R, 1, 0, cross - R)}L${pt(0, R)}${arc(R, 1, R, 0)}Z`;
  let stub = `M${pt(x + notch, 0)}L${pt(main - R, 0)}${arc(R, 1, main, R)}L${pt(main, cross - R)}${arc(R, 1, main - R, cross)}L${pt(x + notch, cross)}${arc(notch, 0, x, cross - notch)}`;
  for (let i = n; i >= 0; i -= 1) {
    const b = bridges[i];
    for (let k = b.pts.length - 1; k >= 0; k -= 1) stub += `L${pt(b.pts[k][0], b.pts[k][1])}`;
    stub += `L${pt(x, b.y0)}`;
    if (i > 0) stub += arc(hr, 0, x, b.y0 - hole);
  }
  stub += `${arc(notch, 0, x + notch, 0)}Z`;
  const ends = [
    { ...at(x, notch), v: notch },
    { ...at(x, cross - notch), v: cross - notch }
  ];
  const bodyOutline = `M${pt(x, cross - notch)}${arc(notch, 0, x - notch, cross)}L${pt(R, cross)}${arc(R, 1, 0, cross - R)}L${pt(0, R)}${arc(R, 1, R, 0)}L${pt(x - notch, 0)}${arc(notch, 0, x, notch)}`;
  const stubOutline = `M${pt(x, notch)}${arc(notch, 0, x + notch, 0)}L${pt(main - R, 0)}${arc(R, 1, main, R)}L${pt(main, cross - R)}${arc(R, 1, main - R, cross)}L${pt(x + notch, cross)}${arc(notch, 0, x, cross - notch)}`;
  return { vertical, cross, body, stub, bridges, ends, bodyOutline, stubOutline };
};

const TearTicket: React.FC<TearTicketProps> = ({
  children = null,
  stub = null,
  image = '',
  imageAlt = '',
  scrim = true,
  imageRadius = 8,
  orientation = 'horizontal',
  torn,
  defaultTorn = false,
  onTear,
  width = 460,
  height = 250,
  stubSize = 150,
  radius = 16,
  holes = 12,
  holeSize = 6,
  notch = 3,
  roughness = 0,
  tearAngle = 30,
  stretch = 30,
  resistance = 0.45,
  rotate = 4,
  tilt = true,
  tiltMax = 9,
  tiltReach = 260,
  parallax = 6,
  perspective = 1000,
  background = '#27272a',
  color = '#f5f5f5',
  border = true,
  borderColor = '',
  borderWidth = 1,
  stubBackground = '',
  recenter = true,
  disabled = false,
  ariaLabel = 'Tear off the stub',
  className = '',
  stubFocusable = true,
  stubTouchAction = 'none',
  pullToTear = 0,
  tearDuration = 0,
  dimUsed = true,
  usedLabel = 'Used',
  shadow = ''
}) => {
  const reduce = useReducedMotion();
  const controlled = torn !== undefined;
  const [inner, setInner] = useState(defaultTorn);
  const used = controlled ? torn : inner;
  const [grabbing, setGrabbing] = useState(false);
  const [fit, setFit] = useState(1);
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const stubRef = useRef<HTMLDivElement>(null);
  const fibres = useRef<(SVGPathElement | null)[]>([]);
  const usedBefore = useRef(used);
  const vertical = orientation === 'vertical';
  const geo = useMemo(
    () => buildGeometry(width, height, stubSize, radius, holes, holeSize, notch, roughness, vertical),
    [width, height, stubSize, radius, holes, holeSize, notch, roughness, vertical]
  );
  const cfg = useRef<Cfg>({
    geo,
    tearAngle,
    stretch,
    resistance,
    height,
    notch,
    reduce,
    onTear,
    controlled,
    used,
    pull: pullToTear,
    stubSize,
    tearDuration
  });
  useLayoutEffect(() => {
    cfg.current = {
      geo,
      tearAngle,
      stretch,
      resistance,
      height,
      notch,
      reduce,
      onTear,
      controlled,
      used,
      pull: pullToTear,
      stubSize,
      tearDuration
    };
  });
  const sim = useRef<Sim>({
    raf: 0,
    last: 0,
    phase: 'idle',
    id: null,
    pending: null,
    done: false,
    sign: 1,
    hinge: { x: 0, y: 0 },
    hingeV: 0,
    grab: { x: 0, y: 0 },
    start: { x: 0, y: 0 },
    point: { x: 0, y: 0 },
    a0: 0,
    theta: 0,
    thetaV: 0,
    autoFrom: 0,
    sx: 0,
    sy: 0,
    vx: 0,
    vy: 0,
    spin: 0,
    pvx: 0,
    pvy: 0,
    pt: 0,
    fade: 1,
    age: 0,
    bx: 0,
    bv: 0,
    snapped: [],
    snapAt: [],
    span: []
  });

  const tiltX = useSpring(0, TILT_SPRING);
  const tiltY = useSpring(0, TILT_SPRING);
  const plane = useMotionTemplate`perspective(${perspective}px) rotate(${rotate}deg) rotateX(${tiltX}deg) rotateY(${tiltY}deg)`;
  const flat = !tilt && rotate === 0;
  const depth = tiltMax > 0 ? parallax / tiltMax : 0;
  const artX = useTransform(tiltY, v => -v * depth);
  const artY = useTransform(tiltX, v => v * depth);
  const art = useMotionTemplate`translate(${artX}px, ${artY}px)`;
  const inkX = useTransform(tiltY, v => v * depth * 0.22);
  const inkY = useTransform(tiltX, v => -v * depth * 0.22);
  const ink = useMotionTemplate`translate(${inkX}px, ${inkY}px)`;

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return undefined;
    const measure = () => setFit(Math.min(1, el.clientWidth / width) || 1);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [width]);

  /** data-instant switches the stage and ink transitions off (written outside render). */
  const markInstant = (on: boolean) => {
    rootRef.current?.toggleAttribute('data-instant', on);
  };

  const paint = (now: number): boolean => {
    const s = sim.current;
    const c = cfg.current;
    const stubEl = stubRef.current;
    const bodyEl = bodyRef.current;
    if (stubEl) {
      stubEl.style.transform = `translate(${s.sx.toFixed(2)}px, ${s.sy.toFixed(2)}px) rotate(${((s.theta * s.sign * 180) / Math.PI).toFixed(3)}deg)`;
      stubEl.style.opacity = s.fade.toFixed(3);
    }
    const up = c.geo.vertical;
    if (bodyEl) bodyEl.style.transform = `translate${up ? 'Y' : 'X'}(${s.bx.toFixed(2)}px)`;
    const cos = Math.cos(s.theta * s.sign);
    const sin = Math.sin(s.theta * s.sign);
    const lx = up ? 1.6 : 0;
    const ly = up ? 0 : 1.6;
    let busy = false;
    c.geo.bridges.forEach((b, i) => {
      const dx = b.x - s.hinge.x;
      const dy = b.y - s.hinge.y;
      const tx = s.hinge.x + dx * cos - dy * sin + s.sx;
      const ty = s.hinge.y + dx * sin + dy * cos + s.sy;
      const ox = b.x + (up ? 0 : s.bx);
      const oy = b.y + (up ? s.bx : 0);
      const gx = tx - ox;
      const gy = ty - oy;
      const gap = Math.hypot(gx, gy);
      const near = fibres.current[i * 2];
      const far = fibres.current[i * 2 + 1];
      if (!near || !far) return;
      const live = s.phase !== 'idle' && !c.reduce;
      if (!s.snapped[i]) {
        if (!live || gap < 0.35) {
          near.style.opacity = '0';
          far.style.opacity = '0';
          return;
        }
        const k = clamp(gap / c.stretch, 0, 1);
        const sag = gap * 0.18;
        const w = (1.7 - 1.15 * k).toFixed(2);
        const sx = (up ? sag : 0) + gx / 2;
        const sy = (up ? 0 : sag) + gy / 2;
        near.setAttribute(
          'd',
          `M${f(ox - lx)},${f(oy - ly)}Q${f(ox - lx + sx)},${f(oy - ly + sy)} ${f(tx - lx)},${f(ty - ly)}`
        );
        far.setAttribute(
          'd',
          `M${f(ox + lx)},${f(oy + ly)}Q${f(ox + lx + gx - sx)},${f(oy + ly + gy - sy)} ${f(tx + lx)},${f(ty + ly)}`
        );
        near.style.strokeWidth = w;
        far.style.strokeWidth = w;
        near.style.opacity = '1';
        far.style.opacity = '1';
        s.span[i] = gap;
        return;
      }
      const t = (now - s.snapAt[i]) / 1000 / RETRACT;
      if (!live || t >= 1 || !s.snapAt[i]) {
        near.style.opacity = '0';
        far.style.opacity = '0';
        return;
      }
      busy = true;
      const left = (1 - t) * (1 - t);
      const len = (s.span[i] || c.stretch) * 0.5 * left;
      const ux = gap > 0.01 ? gx / gap : 1;
      const uy = gap > 0.01 ? gy / gap : 0;
      near.setAttribute('d', `M${f(ox)},${f(oy)}L${f(ox + ux * len)},${f(oy + uy * len)}`);
      far.setAttribute('d', `M${f(tx)},${f(ty)}L${f(tx - ux * len)},${f(ty - uy * len)}`);
      near.style.strokeWidth = '0.9';
      far.style.strokeWidth = '0.9';
      near.style.opacity = left.toFixed(2);
      far.style.opacity = left.toFixed(2);
    });
    return busy;
  };

  const finish = () => {
    const c = cfg.current;
    const s = sim.current;
    s.done = true;
    if (stubRef.current) stubRef.current.style.visibility = 'hidden';
    if (!c.controlled) setInner(true);
    c.onTear?.();
  };

  /** Snap bridge i now (the body recoils a little per bridge, as in the source). */
  const snap = (i: number, now: number) => {
    const s = sim.current;
    s.snapped[i] = true;
    s.snapAt[i] = now;
    s.bv -= 560 / cfg.current.geo.bridges.length;
  };

  /** Snap the bridges the current swing has stretched past their limit; returns how many hold. */
  const snapStretched = (now: number, slack: number, limit: number): number => {
    const s = sim.current;
    const c = cfg.current;
    let left = 0;
    c.geo.bridges.forEach((b, i) => {
      if (s.snapped[i]) return;
      const d = Math.abs(b.mid - s.hingeV);
      if (2 * d * Math.sin(s.theta / 2) + slack > c.stretch || s.theta >= limit) snap(i, now);
      else left += 1;
    });
    return left;
  };

  const step = (now: number) => {
    const s = sim.current;
    const c = cfg.current;
    const dt = clamp((now - s.last) / 1000, 0.001, 0.034);
    s.last = now;
    const limit = rad(c.tearAngle);
    if (s.phase === 'held') {
      const count = c.geo.bridges.length;
      let intact = 0;
      for (let i = 0; i < count; i += 1) if (!s.snapped[i]) intact += 1;
      const hold = count ? intact / count : 0;
      const follow = 0.92 * (1 - clamp(c.resistance, 0, 0.95) * hold);
      const a = Math.atan2(s.point.y - s.hinge.y, s.point.x - s.hinge.x);
      const want = clamp(wrap(a - s.a0) * s.sign * follow, 0, limit + 0.1);
      s.theta += (want - s.theta) * (1 - Math.exp(-dt / 0.035));
      const up = c.geo.vertical;
      const away = clamp(((up ? s.point.y - s.start.y : s.point.x - s.start.x) || 0) * 0.05, -2, 4);
      const side = clamp(((up ? s.point.x - s.start.x : s.point.y - s.start.y) || 0) * 0.05, -3, 3);
      const px = up ? side : away;
      const py = up ? away : side;
      s.sx += (px - s.sx) * (1 - Math.exp(-dt / 0.05));
      s.sy += (py - s.sy) * (1 - Math.exp(-dt / 0.05));
      let left = snapStretched(now, Math.hypot(s.sx, s.sy), limit);
      if (left > 0 && c.pull > 0) {
        const pulled = Math.hypot(s.point.x - s.start.x, s.point.y - s.start.y);
        if (pulled >= c.pull * c.stubSize) {
          c.geo.bridges.forEach((_, i) => {
            if (!s.snapped[i]) snap(i, now);
          });
          left = 0;
        }
      }
      if (left === 0) {
        s.phase = 'free';
        s.bv -= 150;
      }
    } else if (s.phase === 'free') {
      const cos = Math.cos(s.theta * s.sign);
      const sin = Math.sin(s.theta * s.sign);
      const gx = s.grab.x - s.hinge.x;
      const gy = s.grab.y - s.hinge.y;
      const wx = s.point.x - s.hinge.x - (gx * cos - gy * sin);
      const wy = s.point.y - s.hinge.y - (gx * sin + gy * cos);
      s.sx += (wx - s.sx) * (1 - Math.exp(-dt / 0.045));
      s.sy += (wy - s.sy) * (1 - Math.exp(-dt / 0.045));
      const hang = limit * 0.55 + clamp(s.pvx * 0.0009 * s.sign, -0.3, 0.3);
      s.theta += (hang - s.theta) * (1 - Math.exp(-dt / 0.12));
    } else if (s.phase === 'auto') {
      s.age += dt;
      const swing = Math.max(0.05, (c.tearDuration / 1000) * AUTO_SWING);
      const k = clamp(s.age / swing, 0, 1);
      s.theta = s.autoFrom + (limit - s.autoFrom) * k * k;
      snapStretched(now, 0, limit);
      if (k >= 1) {
        c.geo.bridges.forEach((_, i) => {
          if (!s.snapped[i]) snap(i, now);
        });
        const up = c.geo.vertical;
        s.vx = up ? 40 : 110;
        s.vy = up ? 140 : 20;
        s.spin = 1.1;
        s.age = 0;
        s.bv -= 150;
        s.phase = 'drop';
      }
    } else if (s.phase === 'drop') {
      s.age += dt;
      s.vy += GRAVITY * dt;
      s.sx += s.vx * dt;
      s.sy += s.vy * dt;
      s.theta += s.spin * dt;
      if (s.age > 0.16) s.fade = clamp(1 - (s.age - 0.16) / 0.42, 0, 1);
      if (s.fade <= 0) {
        s.phase = 'idle';
        finish();
      }
    } else if (s.phase === 'return') {
      s.thetaV += (-300 * s.theta - 24 * s.thetaV) * dt;
      s.theta += s.thetaV * dt;
      s.sx += (0 - s.sx) * (1 - Math.exp(-dt / 0.07));
      s.sy += (0 - s.sy) * (1 - Math.exp(-dt / 0.07));
      if (Math.abs(s.theta) < 0.0008 && Math.abs(s.thetaV) < 0.01 && Math.hypot(s.sx, s.sy) < 0.05) {
        s.theta = 0;
        s.thetaV = 0;
        s.sx = 0;
        s.sy = 0;
        s.phase = 'idle';
      }
    }
    s.bv += (-520 * s.bx - 30 * s.bv) * dt;
    s.bx += s.bv * dt;
    const busy = paint(now);
    const moving = Math.abs(s.bx) > 0.02 || Math.abs(s.bv) > 0.5;
    if (s.phase !== 'idle' || moving || busy) s.raf = requestAnimationFrame(step);
    else {
      s.bx = 0;
      s.bv = 0;
      paint(now);
      s.raf = 0;
    }
  };
  const run = () => {
    const s = sim.current;
    if (s.raf) return;
    s.last = performance.now();
    s.raf = requestAnimationFrame(step);
  };

  const reset = () => {
    const s = sim.current;
    cancelAnimationFrame(s.raf);
    Object.assign(s, {
      raf: 0,
      phase: 'idle',
      id: null,
      pending: null,
      done: false,
      theta: 0,
      thetaV: 0,
      sx: 0,
      sy: 0,
      fade: 1,
      age: 0,
      bx: 0,
      bv: 0
    });
    s.snapped = [];
    s.snapAt = [];
    s.span = [];
    if (stubRef.current) stubRef.current.style.visibility = '';
    paint(performance.now());
  };

  /** Hide the stub at once (reduced motion, a ticket mounted torn). */
  const hideNow = () => {
    const s = sim.current;
    cancelAnimationFrame(s.raf);
    s.raf = 0;
    s.phase = 'idle';
    s.id = null;
    s.pending = null;
    s.done = true;
    markInstant(true);
    if (stubRef.current) stubRef.current.style.visibility = 'hidden';
  };

  /** Swing the stub open around its far hinge, then drop it (a tear nobody is dragging). */
  const tearAuto = () => {
    const s = sim.current;
    const c = cfg.current;
    if (s.phase === 'drop' || s.phase === 'auto') return;
    if (s.id !== null) {
      s.id = null;
      setGrabbing(false);
    }
    s.pending = null;
    if (s.theta < 0.01) {
      const end = c.geo.ends[1];
      s.sign = c.geo.vertical ? -1 : 1;
      s.hinge = { x: end.x, y: end.y };
      s.hingeV = end.v;
      if (stubRef.current) stubRef.current.style.transformOrigin = `${s.hinge.x}px ${s.hinge.y}px`;
    }
    s.autoFrom = s.theta;
    s.thetaV = 0;
    s.age = 0;
    s.phase = 'auto';
    markInstant(false);
    run();
  };

  useEffect(() => {
    const was = usedBefore.current;
    usedBefore.current = used;
    const s = sim.current;
    if (used) {
      if (s.done) return;
      if (!was && !reduce && tearDuration > 0) {
        tearAuto();
        return;
      }
      if (s.phase === 'drop') return;
      hideNow();
      return;
    }
    markInstant(false);
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [used]);
  useEffect(() => {
    if (cfg.current.used && sim.current.done) {
      paint(performance.now());
      return;
    }
    if (cfg.current.used) {
      hideNow();
      return;
    }
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geo]);
  useEffect(() => {
    const s = sim.current;
    return () => cancelAnimationFrame(s.raf);
  }, []);

  const local = (e: PointerEvent<HTMLDivElement>): Point => {
    const r = stageRef.current!.getBoundingClientRect();
    const k = r.width / width || 1;
    return { x: (e.clientX - r.left) / k, y: (e.clientY - r.top) / k };
  };
  const tearNow = () => {
    const s = sim.current;
    cancelAnimationFrame(s.raf);
    s.raf = 0;
    s.phase = 'idle';
    markInstant(true);
    finish();
  };
  const begin = (e: PointerEvent<HTMLDivElement>, p: Point) => {
    const s = sim.current;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
    s.id = e.pointerId;
    s.start = p;
    s.point = p;
    s.pt = performance.now();
    s.pvx = 0;
    s.pvy = 0;
    if (s.theta < 0.01) {
      const far = (geo.vertical ? p.x : p.y) < geo.cross / 2;
      const end = geo.ends[far ? 1 : 0];
      s.sign = (far ? 1 : -1) * (geo.vertical ? -1 : 1);
      s.hinge = { x: end.x, y: end.y };
      s.hingeV = end.v;
      if (stubRef.current) stubRef.current.style.transformOrigin = `${s.hinge.x}px ${s.hinge.y}px`;
    }
    const cos = Math.cos(-s.theta * s.sign);
    const sin = Math.sin(-s.theta * s.sign);
    const ux = p.x - s.sx - s.hinge.x;
    const uy = p.y - s.sy - s.hinge.y;
    s.grab = { x: s.hinge.x + ux * cos - uy * sin, y: s.hinge.y + ux * sin + uy * cos };
    s.a0 = Math.atan2(s.grab.y - s.hinge.y, s.grab.x - s.hinge.x) - (s.theta * s.sign) / 0.92;
    s.phase = 'held';
    s.thetaV = 0;
    tiltX.set(0);
    tiltY.set(0);
    setGrabbing(true);
    run();
  };
  const onStubDown = (e: PointerEvent<HTMLDivElement>) => {
    const s = sim.current;
    if (disabled || used || e.button !== 0 || s.id !== null || s.pending !== null) return;
    if (s.phase === 'drop' || s.phase === 'auto') return;
    s.pending = { id: e.pointerId, ...local(e) };
  };
  const onStubMove = (e: PointerEvent<HTMLDivElement>) => {
    const s = sim.current;
    const pending = s.pending;
    if (pending && pending.id === e.pointerId) {
      if (e.buttons === 0) {
        s.pending = null;
        return;
      }
      const p = local(e);
      if (Math.hypot(p.x - pending.x, p.y - pending.y) < DRAG_SLOP) return;
      s.pending = null;
      begin(e, { x: pending.x, y: pending.y });
    }
    if (s.id !== e.pointerId) return;
    const p = local(e);
    const now = performance.now();
    const dt = Math.max(0.004, (now - s.pt) / 1000);
    s.pvx += ((p.x - s.point.x) / dt - s.pvx) * 0.35;
    s.pvy += ((p.y - s.point.y) / dt - s.pvy) * 0.35;
    s.pt = now;
    s.point = p;
    if (cfg.current.reduce && Math.hypot(p.x - s.start.x, p.y - s.start.y) > 28) {
      s.id = null;
      setGrabbing(false);
      tearNow();
    }
  };
  const onStubUp = (e: PointerEvent<HTMLDivElement>) => {
    const s = sim.current;
    if (s.pending && s.pending.id === e.pointerId) {
      s.pending = null;
      return;
    }
    if (s.id !== e.pointerId) {
      // A reset (new geometry, a controlled untear) dropped the drag mid-gesture.
      if (s.id === null && grabbing) setGrabbing(false);
      return;
    }
    s.id = null;
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
    setGrabbing(false);
    if (s.phase === 'free') {
      const still = performance.now() - s.pt > 80;
      s.vx = still ? 0 : clamp(s.pvx, -1600, 1600);
      s.vy = still ? 0 : clamp(s.pvy, -1600, 1200);
      s.spin = clamp(s.vx * 0.004, -6, 6) + 1.2 * s.sign;
      s.age = 0;
      s.phase = 'drop';
    } else if (s.phase === 'held') {
      s.phase = 'return';
    }
    run();
  };
  const onStubKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (disabled || used || (e.key !== 'Enter' && e.key !== ' ')) return;
    e.preventDefault();
    if (!e.repeat) tearNow();
  };

  useEffect(() => {
    if (!tilt || reduce || disabled) return undefined;
    const move = (e: globalThis.PointerEvent) => {
      const el = rootRef.current;
      if (!el || e.pointerType === 'touch' || sim.current.id !== null) return;
      const r = el.getBoundingClientRect();
      const nx = clamp((e.clientX - (r.left + r.width / 2)) / (r.width / 2 + tiltReach), -1, 1);
      const ny = clamp((e.clientY - (r.top + r.height / 2)) / (r.height / 2 + tiltReach), -1, 1);
      tiltY.set(nx * tiltMax);
      tiltX.set(-ny * tiltMax);
    };
    window.addEventListener('pointermove', move);
    return () => window.removeEventListener('pointermove', move);
  }, [tilt, reduce, disabled, tiltMax, tiltReach, tiltX, tiltY]);

  const stubA11y = stubFocusable
    ? {
        role: 'button',
        tabIndex: disabled || used ? -1 : 0,
        'aria-label': ariaLabel,
        'aria-disabled': disabled || undefined,
        onKeyDown: onStubKey
      }
    : {};

  return (
    <div
      ref={rootRef}
      className={`group relative select-none [width:min(var(--tt-w),100%)] [color:var(--tt-ink)] [-webkit-tap-highlight-color:transparent] [-webkit-touch-callout:none] data-[disabled]:opacity-60 ${styles.root}${className ? ` ${className}` : ''}`}
      data-used={used ? '' : undefined}
      data-dim={dimUsed ? '' : undefined}
      data-orientation={orientation}
      data-shift={used && recenter ? (vertical ? 'y' : 'x') : undefined}
      data-grabbing={grabbing ? '' : undefined}
      data-disabled={disabled ? '' : undefined}
      style={
        {
          '--tt-w': `${width}px`,
          '--tt-h': `${height}px`,
          '--tt-stub': `${stubSize}px`,
          '--tt-bg': background,
          '--tt-stub-bg': stubBackground || background,
          '--tt-ink': color,
          '--tt-edge': borderColor || `color-mix(in srgb, ${color} 16%, transparent)`,
          '--tt-edge-w': borderWidth,
          '--tt-parallax': `${parallax}px`,
          '--tt-body-w': `${vertical ? width : width - stubSize}px`,
          '--tt-body-h': `${vertical ? height - stubSize : height}px`,
          '--tt-inset': `${ART_INSET}px`,
          '--tt-span': ART_SPAN,
          '--tt-art-radius': `${imageRadius}px`,
          '--tt-fit': fit,
          '--tt-shadow': shadow || 'none',
          '--tt-touch': stubTouchAction,
          height: `${height * fit}px`
        } as CSSProperties
      }
    >
      <div
        ref={stageRef}
        className="absolute top-0 left-0 origin-top-left [width:var(--tt-w)] [height:var(--tt-h)] [transform:scale(var(--tt-fit))] [transition:transform_650ms_cubic-bezier(0.22,1,0.36,1)] group-data-[shift=x]:[transform:translateX(calc(var(--tt-stub)*var(--tt-fit)/2))_scale(var(--tt-fit))] group-data-[shift=y]:[transform:translateY(calc(var(--tt-stub)*var(--tt-fit)/2))_scale(var(--tt-fit))] group-data-[instant]:[transition-duration:0ms] motion-reduce:[transition:none]"
      >
        <motion.div className="absolute inset-0" style={flat ? undefined : { transform: plane }}>
          <div ref={bodyRef} className="pointer-events-none absolute inset-0">
            {border ? (
              <svg
                className="pointer-events-none absolute inset-0 h-full w-full overflow-visible [&>path]:fill-none [&>path]:[stroke:var(--tt-edge)] [&>path]:[stroke-width:var(--tt-edge-w)]"
                viewBox={`0 0 ${width} ${height}`}
                aria-hidden="true"
              >
                <path d={geo.bodyOutline} />
              </svg>
            ) : null}
            <div
              className="pointer-events-auto absolute inset-0 [background:var(--tt-bg)]"
              style={{ clipPath: `path('${geo.body}')` }}
            >
              {image ? (
                <div className="absolute overflow-hidden [top:var(--tt-inset)] [left:var(--tt-inset)] [width:calc(var(--tt-body-w)_-_var(--tt-inset)*2)] [height:calc(var(--tt-body-h)*var(--tt-span)_-_var(--tt-inset)*2)] [border-radius:var(--tt-art-radius)]">
                  <motion.img
                    className="absolute max-w-none object-cover [top:calc(var(--tt-parallax)*-1)] [left:calc(var(--tt-parallax)*-1)] [width:calc(100%_+_var(--tt-parallax)*2)] [height:calc(100%_+_var(--tt-parallax)*2)] [-webkit-user-drag:none] [transition:filter_700ms_ease] group-data-[used]:[filter:grayscale(1)_brightness(0.75)] group-data-[instant]:[transition-duration:0ms]"
                    src={image}
                    alt={imageAlt}
                    draggable={false}
                    style={reduce ? undefined : { transform: art }}
                  />
                  {scrim ? (
                    <div className="absolute inset-0 [background:linear-gradient(to_top,var(--tt-bg)_0%,color-mix(in_srgb,var(--tt-bg)_72%,transparent)_30%,color-mix(in_srgb,var(--tt-bg)_18%,transparent)_58%,transparent_80%)]" />
                  ) : null}
                </div>
              ) : null}
              <motion.div
                className={`absolute inset-y-0 left-0 [width:calc(var(--tt-w)_-_var(--tt-stub))] group-data-[orientation=vertical]:bottom-auto group-data-[orientation=vertical]:w-full group-data-[orientation=vertical]:[height:calc(var(--tt-h)_-_var(--tt-stub))] ${styles.ink}`}
                style={reduce || flat ? undefined : { transform: ink }}
              >
                {children}
              </motion.div>
            </div>
          </div>
          <svg
            className="pointer-events-none absolute inset-0 h-full w-full overflow-visible [&_path]:fill-none [&_path]:opacity-0 [&_path]:[stroke:var(--tt-bg)] [&_path]:[stroke-linecap:round]"
            aria-hidden="true"
          >
            {geo.bridges.map((b, i) => (
              <g key={i}>
                <path
                  ref={el => {
                    fibres.current[i * 2] = el;
                  }}
                />
                <path
                  ref={el => {
                    fibres.current[i * 2 + 1] = el;
                  }}
                />
              </g>
            ))}
          </svg>
          <div
            ref={stubRef}
            className="pointer-events-none absolute inset-0 outline-none will-change-transform"
            {...stubA11y}
            aria-hidden={used || undefined}
            inert={(!stubFocusable && used) || undefined}
            onPointerDown={onStubDown}
            onPointerMove={onStubMove}
            onPointerUp={onStubUp}
            onPointerCancel={onStubUp}
            onLostPointerCapture={onStubUp}
            onDragStart={e => e.preventDefault()}
          >
            {border ? (
              <svg
                className="pointer-events-none absolute inset-0 h-full w-full overflow-visible [&>path]:fill-none [&>path]:[stroke:var(--tt-edge)] [&>path]:[stroke-width:var(--tt-edge-w)]"
                viewBox={`0 0 ${width} ${height}`}
                aria-hidden="true"
              >
                <path d={geo.stubOutline} />
              </svg>
            ) : null}
            <div
              className={`pointer-events-auto absolute inset-0 cursor-grab [background:var(--tt-stub-bg)] group-data-[grabbing]:cursor-grabbing group-data-[disabled]:cursor-default ${styles.grab}`}
              style={{ clipPath: `path('${geo.stub}')` }}
            >
              <div className="absolute inset-y-0 right-0 [width:var(--tt-stub)] group-data-[orientation=vertical]:top-auto group-data-[orientation=vertical]:left-0 group-data-[orientation=vertical]:w-auto group-data-[orientation=vertical]:[height:var(--tt-stub)]">
                {stub}
              </div>
            </div>
          </div>
        </motion.div>
      </div>
      {usedLabel ? (
        <span className="absolute h-px w-px overflow-hidden whitespace-nowrap [clip-path:inset(50%)]" role="status">
          {used ? usedLabel : ''}
        </span>
      ) : null}
    </div>
  );
};

export default TearTicket;
