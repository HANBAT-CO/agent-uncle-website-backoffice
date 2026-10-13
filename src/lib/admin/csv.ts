/*
 * CSV writer for the audited exports (screens 9, tasks WP-03). Excel-friendly:
 * a UTF-8 BOM so Korean opens correctly, CRLF line ends, RFC 4180 quoting,
 * and a formula guard: text starting with = + - @ tab or CR gets a leading
 * apostrophe, so a cell like =HYPERLINK(...) typed by an app user stays text.
 * Numbers are written as numbers (a negative count is not a formula).
 */

export type CsvColumn = {
  key: string;
  header: string;
  format?: (value: unknown, row: Record<string, unknown>) => string | number | null | undefined;
};

const BOM = "﻿";
const CRLF = "\r\n";
const FORMULA_START = /^[=+\-@\t\r]/;
const NEEDS_QUOTES = /[",\r\n]/;

function text(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return FORMULA_START.test(value) ? `'${value}` : value;
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Array.isArray(value)) return text(value.map((item) => (typeof item === "string" ? item : JSON.stringify(item))).join(", "));
  return text(JSON.stringify(value));
}

function cell(value: unknown): string {
  const out = text(value);
  return NEEDS_QUOTES.test(out) ? `"${out.replace(/"/g, '""')}"` : out;
}

export function toCsv(rows: Record<string, unknown>[], columns: CsvColumn[]): string {
  const lines = [columns.map((column) => cell(column.header)).join(",")];
  for (const row of rows) {
    lines.push(columns.map((column) => cell(column.format ? column.format(row[column.key], row) : row[column.key])).join(","));
  }
  return `${BOM}${lines.join(CRLF)}${CRLF}`;
}
