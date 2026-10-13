/**
 * Note: When using the Node.JS APIs, the config file
 * doesn't apply. Instead, pass options directly to the APIs.
 *
 * All configuration options: https://remotion.dev/docs/config
 */

import { Config } from "@remotion/cli/config";

Config.setRspack(true);
Config.setVideoImageFormat("jpeg");
Config.setJpegQuality(95);
Config.setOverwriteOutput(true);
// v2 is DOM/SVG only (the v1 three.js chapters were removed); ANGLE keeps GPU compositing consistent with the stills script.
Config.setChromiumOpenGlRenderer("angle");
