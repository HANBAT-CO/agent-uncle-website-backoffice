import type { ReactNode } from "react";

/**
 * The app's own icons (spec 4.5), converted verbatim from
 * .context/brief/assets/icons: path data unchanged, colours to currentColor.
 * figma_* are 1.7 stroke icons with round caps and joins; tds_* are filled
 * mono icons from the TDS icon CDN. Product meaning only (store, bag, check,
 * chevron, ...); media and form chrome use Phosphor Light.
 *
 * Decorative by default (aria-hidden). Pass `title` when the icon is the only
 * label of its control.
 */

export type AppIconName = "chevron" | "bag" | "store" | "check" | "clock" | "shirt" | "truck" | "pin" | "send";

type AppIconProps = {
  name: AppIconName;
  /** Rendered width and height in px. */
  size?: number;
  className?: string;
  title?: string;
};

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

const GLYPHS: Record<AppIconName, ReactNode> = {
  // figma_chevron.svg
  chevron: <path d="M9 5L16 12L9 19" {...stroke} />,
  // figma_bag.svg
  bag: (
    <path
      d="M8 8V6C8 4.93913 8.42143 3.92172 9.17157 3.17157C9.92172 2.42143 10.9391 2 12 2C13.0609 2 14.0783 2.42143 14.8284 3.17157C15.5786 3.92172 16 4.93913 16 6V8M5 7H19L21 21H3L5 7Z"
      {...stroke}
    />
  ),
  // figma_store.svg
  store: (
    <path
      d="M4 10V21H20V10M9 21V15H15V21M3 10L5 3H19L21 10C21 14 17 14 17 10C17 14 12 14 12 10C12 14 7 14 7 10C7 14 3 14 3 10Z"
      {...stroke}
    />
  ),
  // figma_check.svg
  check: <path d="M5 12L9 16L19 6" {...stroke} />,
  // figma_clock.svg
  clock: (
    <>
      <path
        d="M12 21C16.9706 21 21 16.9706 21 12C21 7.02944 16.9706 3 12 3C7.02944 3 3 7.02944 3 12C3 16.9706 7.02944 21 12 21Z"
        {...stroke}
      />
      <path d="M12 6V12L16 14" {...stroke} />
    </>
  ),
  // figma_shirt.svg
  shirt: <path d="M8 3L3 6L1 11L5 13L7 10V21H17V10L19 13L23 11L21 6L16 3C15 6 9 6 8 3Z" {...stroke} />,
  // tds_truck.svg (icon-truck-mono)
  truck: (
    <>
      <path d="m0 0h24v24h-24z" fill="none" />
      <g fill="currentColor">
        <path d="m3.2 2.95h11c1.104 0 2 .896 2 2v8c0 .552-.448 1-1 1h-14v-9c0-1.104.896-2 2-2z" />
        <path
          d="m23.103 13.35-.239-.558c-.003-.008-.004-.016-.007-.024l-.054-.119-.107-.236-2.078-4.59c-.324-.715-1.037-1.175-1.822-1.175h-2.596v1.8h2.596c.078 0 .15.046.182.118l1.554 3.432h-4.332v.95c0 .552-.448 1-1 1h-14v2.6c0 1.104.895 2 2 2h18.103c1.105 0 2-.896 2-2v-2.2c0-.4-.1-.7-.2-1z"
          opacity=".6"
        />
        <path d="m18.908 20.8c1.243 0 2.25-1.007 2.25-2.25s-1.007-2.25-2.25-2.25-2.25 1.007-2.25 2.25 1.007 2.25 2.25 2.25z" />
        <path d="m5.606 20.8c1.243 0 2.25-1.007 2.25-2.25s-1.007-2.25-2.25-2.25-2.25 1.007-2.25 2.25 1.007 2.25 2.25 2.25z" />
      </g>
    </>
  ),
  // tds_pin.svg (icon-pin-mono)
  pin: (
    <path
      d="m21.079 5.31-8.09-4.67a1.029 1.029 0 0 0 -1.543.89v1.44a5.139 5.139 0 0 1 -2.57 4.452l-5.953 3.438a1.028 1.028 0 0 0 0 1.781l5.395 3.114c-.047.055-.104.096-.14.16l-3.456 5.985a1.2 1.2 0 0 0 2.078 1.2l3.456-5.984c.037-.065.044-.135.067-.202l5.396 3.114a1.028 1.028 0 0 0 1.542-.89v-6.874c0-1.837.979-3.534 2.57-4.452l1.248-.72a1.028 1.028 0 0 0 0-1.782"
      fill="currentColor"
      fillRule="evenodd"
    />
  ),
  // tds_send.svg (icon-send-mono)
  send: (
    <path
      d="m20.189 1.453-17.536 5.847c-1.205.402-1.437 2.009-.392 2.734l4.829 3.361c.614.427 1.446.353 1.975-.176l3.71-3.71c.362-.362.95-.363 1.312 0 .362.362.363.95 0 1.312l-3.709 3.709c-.53.529-.605 1.362-.177 1.976l3.36 4.831c.726 1.044 2.333.813 2.734-.394l5.849-17.536c.404-1.208-.746-2.357-1.955-1.955"
      fill="currentColor"
      fillRule="evenodd"
    />
  ),
};

export function AppIcon({ name, size = 24, className, title }: AppIconProps) {
  const labelled = Boolean(title);
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      overflow="visible"
      focusable="false"
      role={labelled ? "img" : undefined}
      aria-hidden={labelled ? undefined : true}
    >
      {labelled ? <title>{title}</title> : null}
      {GLYPHS[name]}
    </svg>
  );
}
