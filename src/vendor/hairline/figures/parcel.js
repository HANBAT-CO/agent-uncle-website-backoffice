/** A parcel settles from an open inspection into a closed delivery; a nearby hand lifts its layers. */
const {
  Cam, clamp, disposer, facing, fit, mk, open, pointer, poly, prism, proj,
  register, rings, rrect, seg, solid, spring, stepS, tdone, tset, tval, tween, put,
} = HL;

function mount({ stage, svg, read }, value) {
  const bag = disposer();
  const C = Cam(45, 0.5, 1.88);
  fit(C, [[-46, -32, 0], [46, 32, 0], [-46, 32, 0], [46, -32, 0], [-40, -40, 115], [55, 26, 115]], 200, 150);
  const P = proj(C), front = facing(C);
  const [baseRing, baseInner] = rings(-46, -32, 46, 32, 4.5, 1.6);
  const [lidRing, lidInner] = rings(-47, -33, 47, 33, 4.5, 1.6);
  const [foldRing, foldInner] = rings(-37, -24, 37, 24, 5, 1.1);
  const g = mk("g", {}, svg);
  const guides = mk("path", { class: "nf dash" }, g);
  const base = solid(g);
  put(base, prism(P, front, baseRing, baseInner, 0, 48));
  const mouth = mk("path", { class: "nf lo", d: poly(rrect(-40, -26, 40, 26, 4, 6).map(q => P(q.u, q.v, 48.2))) }, g);
  // Packing bands wrap the visible faces, with a small rounded address sleeve on the right face.
  mk("path", { class: "nf lo", d: [-18, 18].map(x => open([P(x - 2, 32, 1.5), P(x - 2, 32, 46), P(x + 2, 32, 46), P(x + 2, 32, 1.5)])).join("") }, g);
  mk("path", { class: "nf lo", d: poly(rrect(-15, 16, 12, 33, 2, 5).map(q => P(46.1, q.u, q.v))) }, g);
  const folds = [solid(g), solid(g)];
  const foldSeam = mk("path", { class: "nf lo" }, g);
  const lid = solid(g);
  const tape = mk("path", { class: "nf hi" }, g);
  const seam = mk("path", { class: "nf lo" }, g);
  const opening = spring(0);
  const phase = tween(clamp(value, 0, 3));
  const target = P(0, 0, 65);
  let last = "";

  function draw(now) {
    const gap = (3 - tval(phase, now)) * 10 + opening.x;
    const key = gap.toFixed(3);
    if (key === last) return;
    last = key;
    const z = 49 + gap;
    const shift = gap * .12;
    const Q = (x, y, h) => P(x + shift, y - shift, h);
    guides.setAttribute("d", gap > 4 ? [[-42, -28], [42, -28], [-42, 28]].map(([x, y]) => seg(P(x, y, 48), Q(x, y, z))).join("") : "");
    mouth.setAttribute("class", gap > 4 ? "nf" : "nf lo");
    folds.forEach((fold, i) => {
      const h = 43 + i * 3 + gap * (.2 + i * .12);
      put(fold, prism(P, front, foldRing, foldInner, h, h + 2.5));
    });
    foldSeam.setAttribute("d", seg(P(-22, 0, 48.5 + gap * .32), P(27, 0, 48.5 + gap * .32)));
    put(lid, prism(Q, front, lidRing, lidInner, z, z + 5));
    tape.setAttribute("d", [-18, 18].map(x => open([Q(x - 2, -32, z + 5.1), Q(x - 2, 32, z + 5.1), Q(x + 2, 32, z + 5.1), Q(x + 2, -32, z + 5.1)])).join(""));
    seam.setAttribute("d", seg(Q(-43, 0, z + 5.1), Q(43, 0, z + 5.1)));
  }

  const loop = register(stage, (dt, now) => {
    const moving = stepS(opening, dt);
    draw(now);
    return moving || !tdone(phase, now);
  });
  bag.add(loop.unregister);
  bag.add(pointer(stage, {
    move(p) {
      const reach = clamp(1 - Math.hypot(p[0] - target[0], p[1] - target[1]) / 155, 0, 1);
      opening.t = 30 * reach * reach;
      read.textContent = reach > 0 ? "open" : "rest";
      loop.wake();
    },
    leave() { opening.t = 0; read.textContent = "rest"; loop.wake(); },
  }));
  read.textContent = "rest";
  draw(performance.now());
  bag.add(() => g.remove());
  return {
    set(next) { tset(phase, clamp(next, 0, 3), performance.now(), 0); loop.wake(); },
    destroy: bag.dispose,
  };
}

hairline({
  name: "parcel",
  means: "A parcel's lid and folded contents lift toward a hand, then settle into a delivery.",
  rules: [1, 3, 5, 6, 7, 8, 9],
  range: [0, 1.5, 3],
  tour: [[200, 135], [260, 170], [165, 95], null],
  mount,
});
