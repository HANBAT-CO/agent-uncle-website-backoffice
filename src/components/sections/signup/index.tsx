import { AppIcon } from "@/components/icons/AppIcon";
import { SectionHeading } from "@/components/section/SectionHeading";
import { SectionShell } from "@/components/section/SectionShell";
import { signup } from "@/content/copy";
import { CONSENT } from "@/content/legal";

import { LazyLeadForm, LazyLiveRecordCard } from "./SignupIslands";
import { SignupPlace } from "./SignupPlace";
import "./signup.css";

/**
 * S10 signup · 사전 신청과 도입 문의 (spec S10, 10). The page's single
 * conversion intent: sending a lead mirrors sending a 사입 요청, so the
 * visitor's record is written in the same log as the night's records.
 *
 * Layout (unpinned, day): heading, body and the autosave note top-left; the
 * form in a double-bezel paper sheet. Between 1024 and 1279px the sheet takes
 * columns 1-6 and the live record card columns 8-12. From 1280px the record
 * rail holds the draft card, so the sheet spans the whole stage (columns
 * 1-12 of the stage, which already leaves the record column free), sets the
 * role cards side by side as tiles (RoleCards) and pairs its short fields
 * (LeadForm): the form reaches the rail's gutter, and the draft card beside
 * it reads as the form's twin instead of sitting across an empty band. One
 * column below 1024px, with the sticky submit bar below 768px. The
 * interactive parts are lazy islands (SignupIslands.tsx); SignupPlace (no
 * markup, in the first load) brings a reload back to the form; everything
 * else here is server-rendered.
 */

function ConsentDisclosure() {
  return (
    <details className="lead-disclosure group/disclosure ml-9">
      <summary className="-mx-2.5 -my-2 inline-flex min-h-11 cursor-pointer items-center gap-1 rounded-pill px-2.5 text-[14px] leading-none font-bold text-grey-700 transition-colors duration-200 ease-snap hover:text-ink">
        {CONSENT.more}
        <AppIcon
          name="chevron"
          size={14}
          className="text-grey-500 transition-[rotate] duration-200 ease-snap group-open/disclosure:rotate-90"
        />
      </summary>
      <dl className="mt-3 flex flex-col gap-3 rounded-input bg-grey-50 p-4 text-[14px] leading-[1.55]">
        {CONSENT.items.map((item) => (
          <div key={item.term} className="grid gap-0.5 sm:grid-cols-[5.5rem_minmax(0,1fr)] sm:gap-3">
            <dt className="font-bold text-grey-800">{item.term}</dt>
            <dd className="text-grey-700">{item.value}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

export function SignupSection() {
  return (
    <SectionShell id="signup" titleId="signup-title" tone="day">
      <SignupPlace />
      <div className="mx-auto w-full max-w-content px-gutter">
        <div className="stage-night grid grid-cols-1 gap-y-12 lg:grid-cols-12 lg:gap-x-6 lg:gap-y-14">
          <header className="flex flex-col gap-5 lg:col-span-8">
            <SectionHeading id="signup-title" lines={signup.h2} className="text-ink" />
            <p className="max-w-(--container-prose) text-body text-grey-800 lg:text-body-lg">{signup.body}</p>
            <p className="text-caption text-grey-600">{signup.autosave}</p>
          </header>

          <div className="lg:col-span-6 lg:col-start-1 lg:row-start-2 xl:col-span-12">
            {/* Double-bezel sheet (spec 4.4): a 6px tray around the paper core. */}
            <div className="rounded-shell bg-[rgb(16_16_16/0.04)] p-1.5 shadow-float ring-1 ring-[rgb(16_16_16/0.06)]">
              <div className="rounded-card bg-surface px-4 pt-7 pb-8 shadow-[inset_0_1px_0_rgb(255_255_255/0.6)] sm:px-8 sm:pt-9 sm:pb-10">
                <LazyLeadForm disclosure={<ConsentDisclosure />} />
              </div>
            </div>
          </div>

          <LazyLiveRecordCard className="lg:col-span-5 lg:col-start-8 lg:row-start-2 xl:hidden" />
        </div>
      </div>
    </SectionShell>
  );
}
