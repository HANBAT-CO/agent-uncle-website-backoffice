/**
 * Cart: a two-wheel market hand truck, tipped back on its wheels, carrying six
 * tied bags. The pointer's height sets the cut: bags below it settle on the
 * toe plate as secured stock, bags above it lift off and hang as dashed ghosts
 * on tethers rising out of the frame. The top tether carries a hang-tag with
 * three punched dots: the date the owed bags are checked again. The slider is
 * the hanging gap, in world units.
 *
 * The pattern: discrete items on a continuous cut. A spring carries the cut
 * (the strap and the ghosts' fan ride it), a 700ms tween per bag carries its
 * state, staggered by distance from the cut, and the hit test is a set of
 * fixed screen bands: n = clamp(round((288 - y) / 36), 0, 6).
 * A live mouse waits LEAVE_GRACE (on the loop) before the cut drops into the
 * bottom band: a hand leaving downwards must not lift the secured bags.
 */
const {
  Cam, circ, clamp, facing, fade, fillet, fit, hull, mk, open, place, pointer, poly, prism, proj, rad, register,
  rings, rrect, run, seg, spring, stepS, tdone, tset, tval, tween, disposer,
} = HL;

const N = 6, REST = 2, HB = 17.5, BW = 34, BD = 22, BH = 17, FW = 19, TR = 1.7, HT = 125, TIP = 8, RW = 10;
const AX = [-9, RW]; // the axle (w, z): the pivot the cart tips back on
const KZ = BH + 3.4; // the knot's height in a bag
const TAG_Z = 18, LEAVE_GRACE = 120; // the tag's height above its knot; ms before a mouse's cut lands in band 0
/** Cart space (u across, w forward, z up) to world, tipped back on the axle. */
const tip = (u, w, z) => {
  const s = Math.sin(rad(TIP)), c = Math.cos(rad(TIP)), dw = w - AX[0], dz = z - AX[1];
  return [u, AX[0] + dw * c - dz * s, AX[1] + dw * s + dz * c];
};
/** A bag's rings, in its own space: a sack wider at the belly, gathered to a neck, a knot on top. */
const sack = (du, dv, r) => rrect(-BW / 2 + du, -BD / 2 + dv, BW / 2 - du, BD / 2 - dv, r, 6);
const PROFILE = [[sack(3, 2, 7), 0], [sack(0.5, 0.4, 10), BH * 0.36], [sack(0, 0, 10.5), BH * 0.52], [sack(2.5, 1.8, 9), BH * 0.74], [sack(8, 5.5, 5), BH * 0.94], [circ(2.4, 14), BH + 1.4]];
/** Folds gathered from the neck onto the front of the shoulder, and the knot: a loop with two ears in the plane facing the viewer. */
const FOLDS = [-12, 42, 98].map((a) => [Math.cos(rad(a)) * (BW / 2 - 2.5), Math.sin(rad(a)) * (BD / 2 - 1.8)]);
const KNOT = circ(1.9, 14), EAR = fillet([[0.4, 0], [5, 3.2], [3.4, 5.4], [0.4, 1.6]], [0.5, 1.2, 1.2, 0.5]);
/** Where bag i sits on the toe plate: its bottom centre, in world space. */
const slot = (i) => tip(0, 12.5, 2 + i * HB);
/** Where bag i hangs for a cut at c: lifted by the gap and fanned to the back left, further the further it is from the cut. */
const hang = (i, c, g) => {
  const f = Math.max(0, i - c), b = slot(i), L = 30 + g * (0.5 + 0.35 * f);
  return { o: [b[0] - L * 0.824, b[1] + L * 0.567, b[2] + g * (0.2 + 0.1 * f)], r: -(2 + 2.2 * f) };
};
/** Bag i's world transform at state t (0 on the cart, 1 hanging): its bottom centre, leaning back with the cart and sideways in the fan. */
const pose = (i, t, c, g) => {
  const h = hang(i, c, g), s = slot(i), o = s.map((v, k) => v + (h.o[k] - v) * t);
  const sp = Math.sin(rad(TIP * (1 - t))), cp = Math.cos(rad(TIP * (1 - t))), sr = Math.sin(rad(h.r * t)), cr = Math.cos(rad(h.r * t));
  return (u, v, z) => { const v1 = v * cp - z * sp, z1 = v * sp + z * cp; return [o[0] + u * cr - z1 * sr, o[1] + v1, o[2] + u * sr + z1 * cr]; };
};
/** The pointer's height, as the number of bags secured. */
const cutAt = (y) => clamp(Math.round((288 - y) / 36), 0, N);

function mount({ stage, svg, read }, value) {
  const bag = disposer();
  let gap = value;

  // The camera is fitted to the cart with all six bags hanging at the widest gap and the tag above them.
  const C = Cam(45, 0.5, 2), far = [];
  for (let i = 0; i < N; i++) {
    const W = pose(i, 1, 0, 22);
    for (const z of [0, KZ]) far.push(W(-BW / 2 - 2, -BD / 2, z), W(BW / 2 + 2, BD / 2, z), W(-BW / 2 - 2, BD / 2, z), W(BW / 2 + 2, -BD / 2, z));
  }
  far.push(pose(N - 1, 1, 0, 22)(0, 0, KZ + TAG_Z));
  fit(C, [tip(-FW - 9, -20, 0), tip(-FW - 2, 26, 0), tip(FW + 2, 26, 0), tip(-FW - 2, -2, HT), tip(FW + 2, -2, HT), [FW + 9, AX[0] - RW, AX[1]], ...far], 200, 166);
  const P = proj(C), front = facing(C);
  const on = (W) => (u, v, z) => P(...W(u, v, z));
  const ringAt = (Q, ring, z) => ring.map((q) => Q(q.u, q.v, z));
  const ear = (Q, s) => poly(EAR.map(([a, b]) => Q(s * a * 0.707, -s * a * 0.707, KZ + b)));
  const bagPaths = (Q) => ({
    sil: poly(hull(PROFILE.flatMap(([ring, z]) => ringAt(Q, ring, z)))),
    cr: FOLDS.map(([u, v]) => open([Q(0, 0, BH + 1), Q(u * 0.5, v * 0.5, BH * 0.9), Q(u, v, BH * 0.64)])).join(""),
    knot: poly(ringAt(Q, KNOT, KZ)) + ear(Q, 1) + ear(Q, -1),
    top: Q(0, 0, KZ + 1.9),
  });

  const g = mk("g", {}, svg), ghosts = mk("g", {}, g), solids = mk("g", {}, g);
  const fd = fade(svg, 110, 0, 1);

  // the cart, which never moves: far wheel, axle, frame, near wheel, toe plate
  const WR = circ(RW, 28), HUB = circ(3.2, 14), Pw = (x, q, r = 1) => P(x, AX[0] + q.u * r, AX[1] + q.v * r);
  function wheel(x0, x1) {
    const el = mk("g", {}, solids), face = Math.max(x0, x1);
    mk("path", { d: poly(hull([...WR.map((q) => Pw(x0, q)), ...WR.map((q) => Pw(x1, q))])), class: "sil" }, el);
    mk("path", { d: poly(WR.map((q) => Pw(face, q, 0.82))), class: "nf lo" }, el);
    mk("path", { d: poly(HUB.map((q) => Pw(face, q))), class: "nf" }, el);
  }
  wheel(-FW - 8.5, -FW - 3.5);
  const ax = [P(-FW - 4, AX[0], AX[1]), P(FW + 4, AX[0], AX[1])], ar = 1.4 * C.S;
  mk("path", { d: poly(hull(ax.flatMap((p) => [0, 1, 2, 3, 4, 5, 6, 7].map((k) => [p[0] + ar * Math.cos(k * 0.785), p[1] + ar * Math.sin(k * 0.785)])))), class: "sil" }, solids);
  const band = (ring) => ring.map((q) => P(...tip(q.u, -2, q.v)));
  const outer = band(rrect(-FW - TR, 0, FW + TR, HT, 12, 6));
  const low = band(rrect(-FW + TR, 3, FW - TR, HT - 18 - TR, 3, 4)).reverse(), loop = band(rrect(-FW + TR, HT - 18 + TR, FW - TR, HT - 2 * TR, 10, 6)).reverse();
  mk("path", { d: poly(outer) + poly(low) + poly(loop), class: "sil" }, solids);
  wheel(FW + 3.5, FW + 8.5);
  const [tr, ti] = rings(-FW - 2, -3, FW + 2, 26, 3, 1.4);
  const toe = prism(on(tip), front, tr, ti, 0, 2);
  mk("path", { d: toe.sil, class: "sil" }, solids);
  const toeEdge = mk("path", { d: toe.crease, class: "nf lo" }, solids);

  // the six bags: a solid on the cart, or a dashed ghost on its tether, never both
  const bags = [];
  for (let i = 0; i < N; i++) {
    const gh = mk("g", {}, ghosts), so = mk("g", {}, solids);
    bags.push({
      tw: tween(i < REST ? 0 : 1), drawn: "",
      tether: mk("path", { class: "nf dash", mask: fd }, gh), occ: mk("path", { class: "fo" }, gh), dash: mk("path", { class: "nf dash" }, gh),
      sil: mk("path", { class: "sil" }, so), cr: mk("path", { class: "nf lo" }, so), knot: mk("path", { class: "nf" }, so),
    });
  }
  // the hang-tag on the top tether, three punched dots across its head
  const tag = mk("g", {}, ghosts), tagPlate = mk("path", { class: "sil" }, tag);
  const punch = [0, 1, 2].map(() => mk("circle", { r: 1.6, class: "dot m" }, tag));
  const TAG = fillet([[-5.4, 0], [5.4, 0], [5.4, -15], [-5.4, -15]], [2.4, 2.4, 2.4, 2.4]);
  // the strap across the secured stack, in front of it
  const strap = mk("path", {}, solids);

  const cut = spring(REST);
  let want = REST, lastStrap = NaN;
  let pend = null; // a mouse's move into band 0, waiting out LEAVE_GRACE: { n, at }

  function drawBag(i, t, c) {
    const b = bags[i], key = t === 0 ? "0" : `${t}|${c}|${gap}`; // on the cart a bag ignores the cut and the gap
    if (key === b.drawn) return;
    b.drawn = key;
    const W = pose(i, t, c, gap), q = bagPaths(on(W)), ghost = t >= 0.5;
    b.sil.setAttribute("d", ghost ? "" : q.sil); b.cr.setAttribute("d", ghost ? "" : q.cr); b.knot.setAttribute("d", ghost ? "" : q.knot);
    b.occ.setAttribute("d", ghost ? q.sil : ""); b.dash.setAttribute("d", ghost ? q.sil : "");
    b.tether.setAttribute("d", ghost ? seg(q.top, [q.top[0], 0]) : "");
    if (i !== N - 1) return;
    tag.setAttribute("display", ghost ? "inline" : "none");
    const k = W(0, 0, KZ), T = (u, v) => P(k[0] + u, k[1], k[2] + TAG_Z + v);
    tagPlate.setAttribute("d", poly(TAG.map(([u, v]) => T(u, v))));
    punch.forEach((el, j) => place(el, T((j - 1) * 3.2, -3.6)));
  }
  function drawStrap(c) {
    const s = Math.round(c * 1000) / 1000;
    if (s === lastStrap) return;
    lastStrap = s;
    // it hugs the top secured bag at its belly; with nothing on the cart it lies flat on the rails
    const k = clamp(s, 0, 1), z = 2 + Math.max(s - 0.5, 0.25) * HB + BH * 0.02, lp = (a, b) => a + (b - a) * k;
    const ring = run(rrect(-BW / 2 + 0.5, lp(-2.6, 12.5 - BD / 2 + 0.5), BW / 2 - 0.5, lp(-1.4, 12.5 + BD / 2 - 0.5), lp(0.5, 10), 6), front), Q = on(tip);
    strap.setAttribute("d", poly([...ringAt(Q, ring, z + 1.1), ...ringAt(Q, ring, z - 1.1).reverse()]));
  }
  function accent() {
    bags.forEach((b, i) => b.knot.setAttribute("class", i === want - 1 ? "nf hi" : "nf"));
    toeEdge.setAttribute("class", want === 0 ? "nf hi" : "nf lo");
  }

  const B = register(stage, (dt, now) => {
    if (pend && now >= pend.at) { const { n } = pend; pend = null; setCut(n, true); }
    let moving = stepS(cut, dt) || pend !== null;
    bags.forEach((b, i) => { drawBag(i, tval(b.tw, now), cut.x); if (!tdone(b.tw, now)) moving = true; });
    drawStrap(cut.x);
    return moving;
  });
  bag.add(B.unregister);

  /** Moves the cut to n bags secured; the bags change state outwards from it. */
  function setCut(n, live) {
    const text = live ? `${n}·${N - n}` : "rest";
    if (read.textContent !== text) read.textContent = text;
    if (n === want) return;
    const now = performance.now();
    want = n;
    cut.t = n;
    bags.forEach((b, i) => tset(b.tw, i < n ? 0 : 1, now, Math.abs(i - n) * 40));
    accent();
    B.wake();
  }
  accent();
  read.textContent = "rest";

  function move(p, e) {
    const n = cutAt(p[1]);
    if (n !== 0 || want === 0 || e?.pointerType !== "mouse") { pend = null; setCut(n, true); return; }
    if (!pend) { pend = { n, at: performance.now() + LEAVE_GRACE }; B.wake(); }
  }
  bag.add(pointer(stage, { move, leave: () => { pend = null; setCut(REST, false); } }));
  bag.add(() => svg.replaceChildren());

  return {
    set: (v) => { gap = v; B.wake(); },
    destroy: bag.dispose,
  };
}

hairline({
  name: "cart",
  means: "A market hand truck: bags under the pointer settle on the cart as secured stock; bags above hang as dashed ghosts, still owed.",
  rules: [1, 3, 5, 6, 8],
  range: [8, 14, 22],
  tour: [[200, 252], [200, 180], [200, 112], null],
  mount,
});
