import React from "react";
import { AbsoluteFill, Freeze, OffthreadVideo, Sequence, staticFile } from "remotion";

/** Real app screen recordings (synced by scripts/sync-app-capture.mjs into public/app/rec). */
export type ClipId =
  | "02-retailer-home"
  | "04-new-request"
  | "05-uncle-home"
  | "06-acquisition"
  | "06a-retailer-accepted"
  | "06r-acquisition-reply-on"
  | "06b-retailer-backorder-reply"
  | "07-delivery"
  | "08-receipt"
  | "08b-uncle-delivery-history"
  | "09-chat"
  | "09r-chat"
  | "09u-uncle-chat-reply"
  | "10-partners";

/**
 * One footage sub-shot: absolute output frames [from, from+dur), source in-point in seconds
 * (clips are 30 fps, so trimBefore = src * 30), playback rate. `freeze` holds the in-point frame.
 */
export type Sub = { from: number; dur: number; clip: ClipId; src: number; rate?: number; freeze?: boolean };

const src = (clip: ClipId) => staticFile(`app/rec/${clip}.mp4`);

const Screen: React.FC<{ s: Sub }> = ({ s }) => (
  <OffthreadVideo
    src={src(s.clip)}
    muted
    trimBefore={Math.round(s.src * 30)}
    playbackRate={s.rate ?? 1}
    style={{ width: "100%", height: "100%", objectFit: "cover" }}
  />
);

/** Renders a phone's footage track. `offset` is the absolute frame of the parent Sequence. */
export const FootageTrack: React.FC<{ subs: Sub[]; offset: number }> = ({ subs, offset }) => (
  <>
    {subs.map((s, i) => (
      <Sequence key={i} from={s.from - offset} durationInFrames={s.dur} premountFor={20} name={`${s.clip} @${s.src}`}>
        <AbsoluteFill>
          {s.freeze ? (
            <Freeze frame={0}>
              <Screen s={s} />
            </Freeze>
          ) : (
            <Screen s={s} />
          )}
        </AbsoluteFill>
      </Sequence>
    ))}
  </>
);
