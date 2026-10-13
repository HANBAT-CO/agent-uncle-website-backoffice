import {
  ChatsCircleIcon,
  ClockCounterClockwiseIcon,
  EnvelopeSimpleIcon,
  HandshakeIcon,
  ListMagnifyingGlassIcon,
  MegaphoneIcon,
  PackageIcon,
  PulseIcon,
  SlidersHorizontalIcon,
  SquaresFourIcon,
  TruckIcon,
  UserCircleIcon,
  UserGearIcon,
  UsersThreeIcon,
  WarningDiamondIcon,
} from "@phosphor-icons/react/dist/ssr";
import type { Icon } from "@phosphor-icons/react";

import type { NavIcon } from "@/lib/admin/nav";

/** nav.ts icon names to Phosphor components (Phosphor only, spec 9). */
export const NAV_ICONS: Record<NavIcon, Icon> = {
  SquaresFour: SquaresFourIcon,
  Pulse: PulseIcon,
  UsersThree: UsersThreeIcon,
  Handshake: HandshakeIcon,
  Package: PackageIcon,
  Truck: TruckIcon,
  ClockCounterClockwise: ClockCounterClockwiseIcon,
  WarningDiamond: WarningDiamondIcon,
  ChatsCircle: ChatsCircleIcon,
  Megaphone: MegaphoneIcon,
  SlidersHorizontal: SlidersHorizontalIcon,
  EnvelopeSimple: EnvelopeSimpleIcon,
  ListMagnifyingGlass: ListMagnifyingGlassIcon,
  UserGear: UserGearIcon,
  UserCircle: UserCircleIcon,
};
