// Console output for the media scripts: aligned tables, byte sizes and a
// loud banner for warnings that block the release later (film not ready).

/** @param {number} bytes */
export function formatBytes(bytes) {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(2)} MB`;
  if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(1)} KB`;
  return `${bytes} B`;
}

const width = (text) => [...text].reduce((sum, ch) => sum + (/[ᄀ-ᇿ㄰-㆏가-힯]/.test(ch) ? 2 : 1), 0);

const pad = (text, size, align) => {
  const gap = " ".repeat(Math.max(0, size - width(text)));
  return align === "right" ? gap + text : text + gap;
};

/**
 * Prints rows as an aligned table.
 * @param {{ key: string, label: string, align?: "left" | "right" }[]} columns
 * @param {Record<string, string>[]} rows
 */
export function printTable(columns, rows) {
  const sizes = columns.map((column) => Math.max(width(column.label), ...rows.map((row) => width(String(row[column.key] ?? "")))));
  const line = (cells) => cells.map((cell, i) => pad(cell, sizes[i], columns[i].align)).join("  ").trimEnd();
  console.log(line(columns.map((column) => column.label)));
  console.log(sizes.map((size) => "-".repeat(size)).join("  "));
  for (const row of rows) console.log(line(columns.map((column) => String(row[column.key] ?? ""))));
}

/** @param {string[]} lines */
export function banner(lines) {
  const rule = "!".repeat(72);
  console.warn(`\n${rule}`);
  for (const text of lines) console.warn(`!! ${text}`);
  console.warn(`${rule}\n`);
}
