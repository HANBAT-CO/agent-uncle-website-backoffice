// Reads the top-level box order of an MP4 to confirm faststart (the moov box
// before mdat, so playback starts before the whole file has downloaded).

import { closeSync, openSync, readSync, statSync } from "node:fs";

/**
 * Top-level box types in file order.
 * @param {string} file
 * @returns {string[]}
 */
export function topLevelBoxes(file) {
  const size = statSync(file).size;
  const fd = openSync(file, "r");
  const header = Buffer.alloc(16);
  const types = [];
  try {
    let offset = 0;
    while (offset + 8 <= size) {
      readSync(fd, header, 0, 16, offset);
      let length = header.readUInt32BE(0);
      const type = header.toString("latin1", 4, 8);
      if (length === 1) length = Number(header.readBigUInt64BE(8));
      else if (length === 0) length = size - offset;
      if (length < 8) throw new Error(`${file}: corrupt box ${JSON.stringify(type)} at ${offset}`);
      types.push(type);
      offset += length;
    }
  } finally {
    closeSync(fd);
  }
  return types;
}

/** @param {string} file */
export function isFaststart(file) {
  const types = topLevelBoxes(file);
  const moov = types.indexOf("moov");
  const mdat = types.indexOf("mdat");
  return moov !== -1 && mdat !== -1 && moov < mdat;
}
