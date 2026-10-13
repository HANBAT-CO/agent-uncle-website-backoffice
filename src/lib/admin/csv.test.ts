import { describe, expect, it } from "vitest";

import { toCsv } from "./csv";

const BOM = "﻿";

describe("toCsv", () => {
  const columns = [
    { key: "id", header: "요청 ID" },
    { key: "product", header: "상품" },
    { key: "quantity", header: "요청" },
  ];

  it("starts with a BOM and uses CRLF", () => {
    const csv = toCsv([{ id: "r1", product: "니트", quantity: 3 }], columns);
    expect(csv.startsWith(`${BOM}요청 ID,상품,요청\r\n`)).toBe(true);
    expect(csv).toBe(`${BOM}요청 ID,상품,요청\r\nr1,니트,3\r\n`);
  });

  it("quotes cells with quotes, commas and newlines", () => {
    const csv = toCsv([{ id: "r1", product: 'A "big" one, blue\nline', quantity: 1 }], columns);
    expect(csv).toContain('"A ""big"" one, blue\nline"');
  });

  it("guards formula-looking text", () => {
    const csv = toCsv(
      [
        { id: "=SUM(1)", product: "+cmd", quantity: 1 },
        { id: "@x", product: "-2+3", quantity: -4 },
        { id: "\tx", product: "\rx", quantity: 0 },
      ],
      columns,
    );
    expect(csv).toContain("'=SUM(1),'+cmd,1");
    expect(csv).toContain("'@x,'-2+3,-4");
    expect(csv).toContain(`'\tx,"'\rx",0`);
  });

  it("writes empty cells for null and undefined, and formats with the column formatter", () => {
    const csv = toCsv(
      [{ id: null, product: undefined, quantity: true }],
      [...columns.slice(0, 2), { key: "quantity", header: "요청", format: (value: unknown) => (value ? "예" : "아니요") }],
    );
    expect(csv).toBe(`${BOM}요청 ID,상품,요청\r\n,,예\r\n`);
  });

  it("writes only the header for no rows", () => {
    expect(toCsv([], columns)).toBe(`${BOM}요청 ID,상품,요청\r\n`);
  });
});
