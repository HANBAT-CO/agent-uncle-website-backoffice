import { Place } from "./components/Phone";

/** 16:9 master layout (EDL §1.5, adapted so captions always sit in the left column). */
export const L = {
  SINGLE: { cx: 1160, cy: 540, h: 930 } as Place,
  TWO_L: { cx: 1000, cy: 580, h: 760 } as Place,
  TWO_R: { cx: 1460, cy: 580, h: 760 } as Place,
  OFF_R: { cx: 2320, cy: 590, h: 760, o: 1 } as Place,
  OFF_L: { cx: -420, cy: 590, h: 760, o: 1 } as Place,
  /** caption column: x 150, big captions 64 px */
  capX: 150,
  capY: 300,
  capSize: 64,
  /** second element under the caption (kinetic values, secondary lines) */
  subY: 480,
  /** record chips land here, under the caption */
  chipX: 150,
  chipY: 700,
};

/** Riser: start a phone 80 px lower and transparent, for an overshoot rise. */
export const below = (p: Place, dy = 80): Place => ({ ...p, cy: p.cy + dy, o: 0 });

/** Exit in place: sink 40 px and fade, so a leaving phone never sweeps through the caption column. */
export const sink = (p: Place): Place => below(p, 40);

/**
 * 9:16 social layout (EDL §5, adjusted): the phone is a little smaller (screen 571x1240, centre
 * 540,1080) so the caption block (y 236-380) never overlaps it and every CTA stays above y 1600.
 */
export const P = {
  SINGLE: { cx: 540, cy: 1080, h: 1240 } as Place,
  OFF_R: { cx: 1700, cy: 1080, h: 1240, o: 1 } as Place,
  OFF_L: { cx: -620, cy: 1080, h: 1240, o: 1 } as Place,
  capX: 80,
  /** round 4: 12 px higher so the chip dock fits between the caption block and the device */
  capY: 224,
  capSize: 58,
  /** right column of the caption block (kinetic values) */
  sideX: 640,
  /** role label just above the phone */
  labelTop: 388,
  /**
   * 업무 기록 chips dock under the caption block, centred, at 0.82 scale (y 366-441); round 4: the
   * device steps down CHIP_NUDGE px while a chip is docked, so the chip never touches the bezel.
   */
  chipY: 366,
  chipScale: 0.82,
};

/** 9:16: how far the device steps down while an 업무 기록 chip is docked above it (ROIs stay above y 1600). */
export const CHIP_NUDGE = 26;
