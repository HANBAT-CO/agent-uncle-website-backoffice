import assert from "node:assert/strict";
import { test } from "node:test";

import { bannedFamily } from "./no-banned-colors.mjs";

const rgb = (hex) => [0, 2, 4].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));

test("flags the spec's banned hexes and the app reds", () => {
  assert.equal(bannedFamily(...rgb("E8572E")), "orange");
  assert.equal(bannedFamily(...rgb("FF5B35")), "orange");
  assert.equal(bannedFamily(...rgb("D9704F")), "orange");
  assert.equal(bannedFamily(...rgb("C6FF3A")), "lime");
  assert.equal(bannedFamily(...rgb("E42939")), "red");
  assert.equal(bannedFamily(...rgb("D22030")), "red");
  assert.equal(bannedFamily(...rgb("7C3AED")), "purple");
});

test("passes the brand palette, mint included", () => {
  for (const hex of ["0C483E", "07231C", "093A32", "F2FFE8", "B6D7C2", "EDECE3", "F5F4EE", "101010", "636363", "D7D7D7", "E4E3DA", "111111"]) {
    assert.equal(bannedFamily(...rgb(hex)), null, hex);
  }
});
