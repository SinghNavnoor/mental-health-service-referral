import { PDFDocument } from "pdf-lib";

/** Merge English + Spanish ROI PDFs into one multi-page PDF for PandaDoc upload. */
export async function mergePdfs(
  ...pdfs: Uint8Array[]
): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  for (const bytes of pdfs) {
    const src = await PDFDocument.load(bytes);
    const pages = await out.copyPages(src, src.getPageIndices());
    for (const page of pages) out.addPage(page);
  }
  return out.save();
}
