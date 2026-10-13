"use client";

import { AppIcon, type AppIconName } from "@/components/icons/AppIcon";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { signup } from "@/content/copy";
import { LEAD_ROLES, type LeadRole } from "@/lib/supabase/types";

/**
 * 어떤 일을 하고 계신가요? as radio cards (spec 10), the app's role picker
 * restyled for the page: paper cards, radius 24, the app's store icon for
 * 소매업자, bag icon for 사입삼촌 and send icon for 기타 (도입이나 제휴를
 * 문의해요), so the three rows read alike. Selected: 1.5px #0C483E border and the app's check in a
 * filled circle. Radix handles arrow keys and roving focus; inside the form
 * each card carries a hidden native radio named "role".
 *
 * Names and descriptions: each radio is named by its title alone (소매업자)
 * and described by its line plus the group's error, so a screen reader that
 * lands on a radio after a failed submit hears the error there; a group's own
 * description is not read when focus enters one of its radios. aria-invalid
 * stays on the radiogroup (role=radio does not support it).
 *
 * Below 640px the icon plate, the gaps and the check shrink a little so the
 * description keeps about 160px at 360px (two lines, not three).
 *
 * From 1280px the sheet spans the whole stage up to the record rail, and the
 * three cards stand side by side as tiles: icon and check on the top row,
 * title and line below, so a 900px sheet never stretches a row card's check
 * 600px away from its title.
 */

const ROLE_ICON: Record<LeadRole, AppIconName> = {
  retailer: "store",
  uncle: "bag",
  other: "send",
};

/** The send glyph is filled, the other two are stroked: drawn a little smaller so the three weigh the same. */
const ICON_SIZE: Record<LeadRole, string> = {
  retailer: "size-5 sm:size-[22px]",
  uncle: "size-5 sm:size-[22px]",
  other: "size-4 sm:size-[18px]",
};

function isRole(value: string): value is LeadRole {
  return (LEAD_ROLES as readonly string[]).includes(value);
}

type RoleCardsProps = {
  id: string;
  value: LeadRole | "";
  onValueChange: (role: LeadRole) => void;
  labelledBy: string;
  describedBy?: string;
  invalid: boolean;
  readOnly: boolean;
};

export function RoleCards({ id, value, onValueChange, labelledBy, describedBy, invalid, readOnly }: RoleCardsProps) {
  return (
    <RadioGroup
      id={id}
      name="role"
      required
      value={value}
      onValueChange={(next) => {
        if (!readOnly && isRole(next)) onValueChange(next);
      }}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      aria-invalid={invalid || undefined}
      aria-readonly={readOnly || undefined}
      className="gap-3 xl:grid-cols-3"
    >
      {LEAD_ROLES.map((role) => {
        const icon = ROLE_ICON[role];
        const copy = signup.roles[role];
        const titleId = `${id}-${role}-title`;
        const lineId = `${id}-${role}-line`;
        return (
          <RadioGroupItem
            key={role}
            value={role}
            aria-labelledby={titleId}
            aria-describedby={[lineId, describedBy].filter(Boolean).join(" ")}
            className={[
              "group/role grid min-h-[80px] w-full items-center rounded-card text-left",
              "grid-cols-[36px_minmax(0,1fr)_22px] gap-3 px-3.5 sm:grid-cols-[40px_minmax(0,1fr)_24px] sm:gap-4 sm:px-4",
              "border-[1.5px] border-grey-200 bg-surface py-3.5",
              "xl:content-start xl:items-start xl:gap-y-3.5 xl:p-4 xl:pb-[18px]",
              "transition-[border-color,scale] duration-200 ease-snap active:scale-[0.99]",
              "hover:border-grey-500 data-[state=checked]:border-green-800",
              "aria-[readonly=true]:cursor-progress",
            ].join(" ")}
          >
            <span
              aria-hidden="true"
              className="grid size-9 place-items-center rounded-pill bg-grey-100 text-grey-800 transition-colors duration-200 ease-snap group-data-[state=checked]/role:bg-accent-weak group-data-[state=checked]/role:text-green-800 sm:size-10 xl:col-start-1 xl:row-start-1"
            >
              <AppIcon name={icon} size={22} className={ICON_SIZE[role]} />
            </span>
            <span className="flex flex-col gap-0.5 xl:col-span-3 xl:row-start-2">
              <span id={titleId} className="text-[17px] leading-[1.4] font-bold text-ink">
                {copy.title}
              </span>
              <span id={lineId} className="text-[14px] leading-[1.5] text-grey-700">
                {copy.line}
              </span>
            </span>
            <span
              aria-hidden="true"
              className={[
                "grid size-[22px] place-items-center rounded-pill border-[1.5px] border-grey-500 text-surface sm:size-6",
                "xl:col-start-3 xl:row-start-1 xl:mt-2",
                "transition-[background-color,border-color] duration-200 ease-snap",
                "group-data-[state=checked]/role:border-green-800 group-data-[state=checked]/role:bg-green-800",
              ].join(" ")}
            >
              <AppIcon name="check" size={14} className="opacity-0 group-data-[state=checked]/role:opacity-100" />
            </span>
          </RadioGroupItem>
        );
      })}
    </RadioGroup>
  );
}
