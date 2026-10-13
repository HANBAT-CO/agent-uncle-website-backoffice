import React from "react";
import { C } from "../theme";

/** Real capture geometry: 1080x2346 (1320x2868 native, iPhone 17 Pro Max). */
export const SCREEN_ASPECT = 2346 / 1080;

/** Where a phone sits on the canvas: centre and on-screen *screen* height (px). */
export type Place = { cx: number; cy: number; h: number; o?: number };

/** Virtual camera on the phone layer: scale and the ROI centre in % of the screen. */
export type Cam = { s: number; x: number; y: number };
export const CAM_FULL: Cam = { s: 1, x: 50, y: 50 };

export const phoneDims = (h: number) => {
  const bezel = h * 0.0161;
  const w = h / SCREEN_ASPECT;
  return { bezel, w, h, devW: w + bezel * 2, devH: h + bezel * 2 };
};

/** On-canvas bounds of the device after the camera move (before any shift). */
export const deviceBounds = (place: Place, cam: Cam = CAM_FULL) => {
  const { w, h, devW, devH } = phoneDims(place.h);
  const cx = place.cx - ((cam.x - 50) / 100) * w * cam.s;
  const cy = place.cy - ((cam.y - 50) / 100) * h * cam.s;
  return { left: cx - (devW * cam.s) / 2, right: cx + (devW * cam.s) / 2, top: cy - (devH * cam.s) / 2, bottom: cy + (devH * cam.s) / 2 };
};

export type ScreenBox = { w: number; h: number; cam: number };
export const ScreenCtx = React.createContext<ScreenBox>({ w: 428, h: 930, cam: 1 });

/**
 * Clean iPhone frame (no brand marks) around real app footage.
 * The camera scales the whole device about its centre and shifts it so the ROI sits where
 * the device centre was, so a punch-in reads as a camera move, not a crop.
 * Children are laid out in screen pixels (0..w, 0..h) and move with the camera.
 */
export const Phone: React.FC<{
  place: Place;
  cam?: Cam;
  children?: React.ReactNode;
  overlay?: React.ReactNode;
  shadow?: boolean;
  /** extra canvas offset in px (the HUD-safe clamp) */
  shift?: { x: number; y: number };
}> = ({ place, cam = CAM_FULL, children, overlay, shadow = true, shift }) => {
  const { bezel, w, h, devW, devH } = phoneDims(place.h);
  const tx = -((cam.x - 50) / 100) * w * cam.s + (shift?.x ?? 0);
  const ty = -((cam.y - 50) / 100) * h * cam.s + (shift?.y ?? 0);
  const radius = w * 0.14;
  if ((place.o ?? 1) <= 0.001) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: place.cx - devW / 2,
        top: place.cy - devH / 2,
        width: devW,
        height: devH,
        opacity: place.o ?? 1,
        translate: `${tx}px ${ty}px`,
        scale: cam.s,
        transformOrigin: "50% 50%",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: radius + bezel,
          background: "#0B0B0B",
          boxShadow: shadow
            ? `0 ${devW * 0.06}px ${devW * 0.14}px rgba(7,35,28,0.22), inset 0 0 0 ${Math.max(1, devW * 0.005)}px #3A3A3A`
            : `inset 0 0 0 ${Math.max(1, devW * 0.005)}px #3A3A3A`,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: bezel,
          top: bezel,
          width: w,
          height: h,
          borderRadius: radius,
          overflow: "hidden",
          background: C.paper,
        }}
      >
        <ScreenCtx.Provider value={{ w, h, cam: cam.s }}>
          {children}
          {/* Dynamic Island (the capture pipeline removed the burned-in one at 468,38 386x120 of 1320x2868) */}
          <div
            style={{
              position: "absolute",
              left: (468 / 1320) * w,
              top: (38 / 2868) * h,
              width: (386 / 1320) * w,
              height: (120 / 2868) * h,
              borderRadius: w,
              background: "#0B0B0B",
            }}
          />
          {overlay}
        </ScreenCtx.Provider>
      </div>
    </div>
  );
};
