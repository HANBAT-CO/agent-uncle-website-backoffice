"use client";

import { useEffect, useEffectEvent, useId, useRef, useState, type FocusEvent } from "react";

import { PauseIcon, PlayIcon } from "@/components/icons/PhosphorLight";
import { useSmoothScroll } from "@/components/motion/SmoothScroll";
import { APP_STILLS, srcSets, type AppClip, type AppStill } from "@/content/media";
import { cx } from "@/lib/cx";

import "./device.css";
import { mediaManager } from "./media-manager";
import {
  isBusyPhase,
  phaseAfterEnded,
  phaseAfterPause,
  showsVideoForPhase,
  type DeviceVideoEnd,
  type DeviceVideoPhase,
  type DeviceVideoYield,
} from "./video-phase";

/**
 * Real app footage inside a Device screen (spec 11 playback policy).
 *
 *   <Device screenWidth={300} label="망원 셀렉트샵의 홈">
 *     <DeviceVideo clip={APP_CLIPS.retailerDenimDetail} still={APP_STILLS.retailerHome0941}
 *       mode="on-demand" playLabel="기록 열어 보기" pauseLabel="멈춤" />
 *   </Device>
 *
 * - The still (AVIF, then WebP) shows at rest; the <video> (muted, inline,
 *   preload none, poster = the clip's first frame once playback is requested;
 *   AV1 WebM, then H.264 MP4) sits above it at opacity 0 and crossfades in
 *   over 300ms once frames flow. On `ended` it crossfades back to the still
 *   unless `end="hold"` is set, in which case it rests on the last video frame.
 * - mode "in-view": the media manager autoplays it at 50% visibility, never
 *   under reduced motion, Save-Data or low-power devices. mode "on-demand":
 *   only the button plays it.
 * - The button (Phosphor Play / Pause, Light 20) is always there: play when
 *   idle, pause while playing (WCAG 2.2.2 for clips over 5s). When play() is
 *   rejected (iOS Low Power Mode, blocked autoplay, missing file) the still
 *   stays and the button reads playLabel.
 * - One decoder at a time, and pause below 25% visibility: mediaManager.
 * - onYield: what a pause the reader did not ask for leaves on screen (the
 *   manager gave the decoder to another clip, the clip scrolled below 25%
 *   visibility). "keep" (default) holds the paused frame; "still" rewinds to
 *   the start and crossfades back to the still, as at rest. The reader's own
 *   pause always keeps the frame.
 * - end: what the clip leaves on screen after `ended`. "still" (default)
 *   crossfades back to the still; "hold" keeps the last decoded frame visible.
 */

export type DeviceVideoProps = {
  clip: AppClip;
  /** Shown at rest and after the clip ends (e.g. the 09:41 home). */
  still: AppStill;
  mode: "in-view" | "on-demand";
  playLabel: string;
  pauseLabel: string;
  onEnded?: () => void;
  /** The rendered screen width for the still's srcset. */
  sizes?: string;
  /** below (default): under the frame, outside the screen. overlay: on the screen's lower edge. */
  controls?: "below" | "overlay";
  /** After a pause the reader did not ask for: keep the paused frame (default) or go back to the still. */
  onYield?: DeviceVideoYield;
  /** After the clip ends: crossfade to the still (default) or hold the last frame. */
  end?: DeviceVideoEnd;
  className?: string;
};

// Codec strings of the media pipeline's encodes (scripts/media/README.md):
// AV1 Main L4.0 8-bit first, then H.264 High L4.0.
const AV1_WEBM = 'video/webm; codecs="av01.0.08M.08"';
const H264_MP4 = 'video/mp4; codecs="avc1.640028"';

export function DeviceVideo({
  clip,
  still,
  mode,
  playLabel,
  pauseLabel,
  onEnded,
  sizes = "(min-width: 1024px) 320px, 86vw",
  controls = "below",
  onYield = "keep",
  end = "still",
  className,
}: DeviceVideoProps) {
  const id = useId();
  const videoId = `${id}-video`;
  const videoRef = useRef<HTMLVideoElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const { scrollTo } = useSmoothScroll();
  const [phase, setPhase] = useState<DeviceVideoPhase>("still");
  // The poster only matters once playback is asked for (the video sits at
  // opacity 0 over the still until then). Setting it from the start made every
  // device fetch its first-frame WebP at page load, ahead of the hero's
  // critical requests, for pixels nobody sees.
  const [poster, setPoster] = useState<string>();
  const stillSet = srcSets(still);
  const firstFrame = APP_STILLS[clip.poster];

  /**
   * When the resting still is the clip's first frame, the poster reuses the
   * file the <picture> already chose (no second copy in another format and
   * size); otherwise the first frame's small WebP.
   */
  const prime = () => {
    const shown = still.id === firstFrame.id ? imgRef.current?.currentSrc : undefined;
    setPoster((current) => current ?? (shown || firstFrame.variants[0].webp));
  };
  const handlePlay = useEffectEvent(() => prime());

  const handleEnded = useEffectEvent(() => {
    setPhase(phaseAfterEnded(end));
    onEnded?.();
  });

  const handlePause = useEffectEvent((video: HTMLVideoElement) => {
    const yielded = mediaManager.takeYield(id);
    if (video.ended) return;
    if (yielded && onYield === "still") {
      try {
        video.currentTime = 0;
      } catch {
        // Some engines reject a seek while the media pipeline is tearing down.
      }
    }
    setPhase((current) => phaseAfterPause(current, { yielded, onYield }));
  });

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const unregister = mediaManager.register(id, video, { autoplay: mode === "in-view" });
    const onPlaying = () => setPhase("playing");
    const onPlay = () => handlePlay();
    const onPause = () => handlePause(video);
    // A rejected play() (autoplay policy) or a failure of every source (the
    // manager watches source errors) resolves play() false and the still stays.
    const onEnd = () => handleEnded();
    video.addEventListener("play", onPlay);
    video.addEventListener("playing", onPlaying);
    video.addEventListener("pause", onPause);
    video.addEventListener("ended", onEnd);
    return () => {
      video.removeEventListener("play", onPlay);
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("ended", onEnd);
      unregister();
    };
  }, [id, mode]);

  const busy = isBusyPhase(phase);

  const toggle = () => {
    if (busy) {
      mediaManager.pause(id);
      setPhase((current) => (current === "loading" ? "still" : "paused"));
      return;
    }
    prime();
    setPhase((current) => (current === "paused" ? current : "loading"));
    // Every source failed on an earlier try: restart resource selection, or
    // play() would wait forever for a new <source>.
    const video = videoRef.current;
    if (video && video.networkState === HTMLMediaElement.NETWORK_NO_SOURCE) video.load();
    void mediaManager.play(id).then((started) => {
      if (!started) setPhase((current) => (current === "playing" ? current : "still"));
    });
  };

  const revealOnKeyboardFocus = (event: FocusEvent<HTMLButtonElement>) => {
    const button = event.currentTarget;
    if (!button.matches(":focus-visible")) return;
    requestAnimationFrame(() => {
      if (document.activeElement !== button) return;
      const box = button.getBoundingClientRect();
      const top = window.scrollY + box.top - Math.max(0, (window.innerHeight - box.height) / 2);
      scrollTo(top, { immediate: true });
    });
  };

  const showsVideo = showsVideoForPhase(phase);

  return (
    <>
      <div className={cx("device-media", className)} data-state={phase} data-clip={clip.id}>
        <picture>
          <source type="image/avif" srcSet={stillSet.avif} sizes={sizes} />
          <source type="image/webp" srcSet={stillSet.webp} sizes={sizes} />
          {/* Pre-encoded AVIF/WebP pair from the media pipeline (spec 11), so no next/image re-encode. */}
          <img
            ref={imgRef}
            src={stillSet.fallback}
            srcSet={stillSet.webp}
            sizes={sizes}
            width={stillSet.width}
            height={stillSet.height}
            alt={still.alt}
            aria-hidden={showsVideo || undefined}
            loading="lazy"
            decoding="async"
          />
        </picture>
        <video
          ref={videoRef}
          id={videoId}
          muted
          playsInline
          preload="none"
          poster={poster}
          width={clip.width}
          height={clip.height}
          aria-label={clip.alt}
          aria-hidden={showsVideo ? undefined : true}
          disablePictureInPicture
          disableRemotePlayback
        >
          <source src={clip.webm} type={AV1_WEBM} />
          <source src={clip.mp4} type={H264_MP4} />
        </video>
      </div>
      <div className="device-controls" data-placement={controls}>
        <button
          type="button"
          aria-controls={videoId}
          data-phase={phase}
          onClick={toggle}
          onFocus={revealOnKeyboardFocus}
          className="group/media inline-flex h-11 items-center gap-2.5 rounded-pill bg-accent-weak pr-[18px] pl-1.5 text-[15px] leading-none font-bold whitespace-nowrap text-accent transition-[scale] duration-(--duration-fast) ease-snap select-none active:scale-[0.98]"
        >
          <span
            aria-hidden="true"
            className="grid size-8 shrink-0 place-items-center rounded-pill bg-accent text-on-accent transition-[scale] duration-300 ease-snap group-hover/media:scale-105"
          >
            {busy ? <PauseIcon size={20} weight="light" /> : <PlayIcon size={20} weight="light" />}
          </span>
          <span>{busy ? pauseLabel : playLabel}</span>
        </button>
      </div>
    </>
  );
}
