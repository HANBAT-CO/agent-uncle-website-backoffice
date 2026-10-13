import { loadFont } from "@remotion/fonts";
import { staticFile } from "remotion";
import { FONT } from "./theme";

// Paperlogy from the brand kit (local TTFs, copied from .context/brief/assets/fonts).
const WEIGHTS: [string, string][] = [
  ["400", "Paperlogy-4Regular.ttf"],
  ["500", "Paperlogy-5Medium.ttf"],
  ["600", "Paperlogy-6SemiBold.ttf"],
  ["700", "Paperlogy-7Bold.ttf"],
  ["800", "Paperlogy-8ExtraBold.ttf"],
  ["900", "Paperlogy-9Black.ttf"],
];

export const fontsReady = Promise.all(
  WEIGHTS.map(([weight, file]) =>
    loadFont({ family: FONT, url: staticFile(`fonts/${file}`), weight, display: "block" }),
  ),
);
