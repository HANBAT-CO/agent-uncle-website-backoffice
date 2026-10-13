import { Device } from "@/components/device/Device";
import { DeviceVideo } from "@/components/device/DeviceVideo";
import { SectionHeading } from "@/components/section/SectionHeading";
import { SectionShell } from "@/components/section/SectionShell";
import { roles } from "@/content/copy";
import { APP_CLIPS, APP_STILLS, type AppClip, type AppStill } from "@/content/media";

import { CAPTURE, OUTLINE_BOXES, outlinePath, type OutlineSide } from "./outline-boxes";
import { RolesSeamIsland } from "./RolesSeamIsland";
import { RolesToggleIsland } from "./RolesToggleIsland";
import "./roles.css";

/**
 * S7 roles, 09:41 (spec S7): one record, two people's to-dos. The 9:41
 * status bars appear only here and later, when the story clock reaches 09:41.
 *
 * Server Component. Every string, both devices with their real stills and the
 * slider are in the server HTML; the no-JS layout is the reduced-motion one
 * (side by side at 50/50 on desktop; below 1024px the native radio toggle
 * still switches devices through CSS).
 *
 * Desktop (1024px up): H2 and body top left; a stage (up to 960px, clear of
 * the compact record plate) with the retailer device left and the uncle
 * device right of a draggable seam (RolesSeam). Each role label (an H3 with
 * whose home it is beside it) sits flush with its device's outer edge. Each
 * column is clipped at the seam, and the narrower side's label and device
 * recede with its share. The outlines mark the same denim card on both homes
 * and a dashed connector joins them through the dot on the seam.
 * Below 1024px: a radiogroup (RolesToggle), stuck under the nav while its
 * device scrolls past, shows one device at a time.
 * DeviceVideo puts an interrupted clip back on its still, so the comparison
 * survives one-at-a-time playback and scrolling away.
 *
 * Story: the section reports nothing; its default beat is b0941 and the
 * chrome shows the rail spine and the compact plate (SECTION_CHROME).
 */

/** The rendered screen width for the stills' srcset (see --roles-screen in roles.css). */
const STILL_SIZES = "(min-width: 1440px) 320px, (min-width: 1024px) 22vw, 80vw";

/**
 * Phrases the body must not split (spec 4.2, line breaks by meaning): each of
 * the two quoted app labels with its particle and comma, so a narrow phone
 * never splits ‘다음 미송 재확인’, whose home it is (소매업자 홈에는, never
 * 사입삼촌 / 홈에는), and the closing sentence (기록은 하나, 할 일은
 * 각자예요.), which wraps as one line rather than ending on a lone 할.
 */
const KEEP_WHOLE = /(‘[^’]*’\S*|\S+ 홈에는|[^\s.][^.]*\.$)/;
const FOOTNOTE_KEEP = /(가입할 때 한 번 고르고,|가입 후 역할 변경은 제공하지 않아요\.)/;

function keepPhrasesWhole(text: string) {
  return text.split(KEEP_WHOLE).map((part, index) =>
    index % 2 === 1 ? (
      <span key={index} className="whitespace-nowrap">
        {part}
      </span>
    ) : (
      part
    ),
  );
}

function keepFootnoteWhole(text: string) {
  return text.split(FOOTNOTE_KEEP).map((part, index) =>
    index % 2 === 1 ? (
      <span key={index} className="whitespace-nowrap">
        {part}
      </span>
    ) : (
      part
    ),
  );
}

type Side = {
  id: OutlineSide;
  role: string;
  line: string;
  caption: string;
  play: string;
  clip: AppClip;
  still: AppStill;
  /** Where the outline path starts, so its midpoint faces the seam. */
  outlineStart: "left" | "right";
};

const SIDES: readonly Side[] = [
  {
    id: "retailer",
    ...roles.retailer,
    clip: APP_CLIPS.retailerDenimDetail,
    still: APP_STILLS.retailerHome0941,
    outlineStart: "left",
  },
  {
    id: "uncle",
    ...roles.uncle,
    clip: APP_CLIPS.uncleHome,
    still: APP_STILLS.uncleHome0941,
    outlineStart: "right",
  },
];

function RoleSide({ side }: { side: Side }) {
  return (
    <div className="roles-side" data-side={side.id} id={`roles-side-${side.id}`}>
      <div className="roles-label">
        <div className="roles-label-head">
          <h3 className="roles-label-role">{side.role}</h3>
          {/* Whose home: the figure keeps it as its (visually hidden) caption for screen readers. */}
          <p className="roles-label-home" aria-hidden="true">
            {side.caption}
          </p>
        </div>
        <p className="roles-label-line">{side.line}</p>
      </div>
      <div className="roles-col">
        <Device screenWidth="var(--roles-screen)" label={side.caption} caption="hidden">
          <DeviceVideo
            clip={side.clip}
            still={side.still}
            mode="on-demand"
            playLabel={side.play}
            pauseLabel={roles.pause}
            sizes={STILL_SIZES}
            onYield="still"
          />
          <svg
            className="roles-outline"
            viewBox={`0 0 ${CAPTURE.width} ${CAPTURE.height}`}
            aria-hidden="true"
            focusable="false"
          >
            <path
              d={outlinePath(OUTLINE_BOXES[side.id], side.outlineStart)}
              vectorEffect="non-scaling-stroke"
              data-roles-outline={side.id}
            />
          </svg>
        </Device>
      </div>
    </div>
  );
}

export function RolesSection() {
  const [retailer, uncle] = SIDES;
  // A shorter tail on desktop (64px): the notes are the section's last line, and 128px under
  // them plus trust's 128px read as an empty frame before the next H2.
  return (
    <SectionShell id="roles" titleId="roles-title" tone="day" className="overflow-x-clip lg:pb-16">
      <div className="mx-auto w-full max-w-content px-gutter">
        <div className="roles-copy">
          <SectionHeading id="roles-title" lines={roles.h2} className="text-ink" />
          <p className="mt-6 max-w-(--container-prose) text-body text-grey-800 lg:text-body-lg">{keepPhrasesWhole(roles.body)}</p>
        </div>

        <div className="roles" data-roles="">
          {/* The toggle's sticky range below 1024px: it lets go when the device's play row leaves. */}
          <div className="roles-stage">
            <RolesToggleIsland />
            <div className="roles-seam" data-roles-seam="">
              <RoleSide side={retailer} />
              <RolesSeamIsland />
              <RoleSide side={uncle} />
            </div>
          </div>
          <div className="roles-notes">
            <p className="roles-media-caption">{roles.mediaCaption}</p>
            <p className="roles-footnote">{keepFootnoteWhole(roles.footnote)}</p>
          </div>
        </div>
      </div>
    </SectionShell>
  );
}
