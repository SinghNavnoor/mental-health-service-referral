import { PDFDocument } from "pdf-lib";
import { extractText, getDocumentProxy } from "unpdf";
import type { RoiExtractionResult } from "../types.js";

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function isEnglishRoi(text: string): boolean {
  const n = normalize(text);
  return (
    n.includes("consent to release information") &&
    n.includes("statement of consent")
  );
}

function isSpanishRoi(text: string): boolean {
  const n = normalize(text);
  return (
    n.includes("consentimiento para divulgar") &&
    (n.includes("declaración de consentimiento") ||
      n.includes("declaracion de consentimiento") ||
      n.includes("doy mi consentimiento"))
  );
}

export async function extractRoiPages(
  pdfBytes: Uint8Array
): Promise<RoiExtractionResult> {
  // Clone — some PDF parsers detach/transfer the underlying ArrayBuffer
  const forText = Uint8Array.from(pdfBytes);
  const forSplit = Uint8Array.from(pdfBytes);

  const pdf = await getDocumentProxy(forText);
  const { text } = await extractText(pdf, { mergePages: false });
  const pages = Array.isArray(text) ? text : [String(text ?? "")];

  const englishPageIndexes: number[] = [];
  const spanishPageIndexes: number[] = [];

  pages.forEach((pageText, i) => {
    if (isEnglishRoi(pageText)) englishPageIndexes.push(i);
    if (isSpanishRoi(pageText)) spanishPageIndexes.push(i);
  });

  if (!englishPageIndexes.length) {
    throw new Error(
      "Could not find English Consent to Release Information page by text"
    );
  }
  if (!spanishPageIndexes.length) {
    throw new Error(
      "Could not find Spanish Consentimiento Para Divulgar page by text"
    );
  }

  const src = await PDFDocument.load(forSplit);

  async function buildSubset(indexes: number[]): Promise<Uint8Array> {
    const out = await PDFDocument.create();
    const copied = await out.copyPages(src, indexes);
    for (const p of copied) out.addPage(p);
    return out.save();
  }

  return {
    englishPdf: await buildSubset(englishPageIndexes),
    spanishPdf: await buildSubset(spanishPageIndexes),
    englishPageIndexes,
    spanishPageIndexes,
  };
}
