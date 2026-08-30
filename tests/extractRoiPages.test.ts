import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { extractRoiPages } from "../src/pdf/extractRoiPages.js";

describe("extractRoiPages", () => {
  it("finds English and Spanish ROI by text, not fixed indexes", async () => {
    const bytes = readFileSync("tests/fixtures/sample-packet.pdf");
    const result = await extractRoiPages(new Uint8Array(bytes));

    expect(result.englishPageIndexes.length).toBeGreaterThan(0);
    expect(result.spanishPageIndexes.length).toBeGreaterThan(0);

    const enDoc = await PDFDocument.load(result.englishPdf);
    const esDoc = await PDFDocument.load(result.spanishPdf);
    expect(enDoc.getPageCount()).toBeGreaterThanOrEqual(1);
    expect(esDoc.getPageCount()).toBeGreaterThanOrEqual(1);
  }, 60_000);

  it("throws if either language missing", async () => {
    const empty = await PDFDocument.create();
    empty.addPage();
    const bytes = await empty.save();
    await expect(extractRoiPages(bytes)).rejects.toThrow(
      /release information|divulgar/i
    );
  });
});
