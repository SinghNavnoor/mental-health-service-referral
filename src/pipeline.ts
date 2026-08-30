import type { AppConfig } from "./config.js";
import type { ReferralPayload } from "./types.js";
import { findConsentPacket } from "./pandadoc/findDocument.js";
import { downloadCompletedPdf } from "./pandadoc/downloadPdf.js";
import { sendReferralViaPandaDoc } from "./pandadoc/sendReferral.js";
import { extractRoiPages } from "./pdf/extractRoiPages.js";
import { mergePdfs } from "./pdf/mergePdfs.js";

export async function runReferralPipeline(
  config: AppConfig,
  payload: ReferralPayload
) {
  const doc = await findConsentPacket(config.pandaDocApiKey, payload);
  const pdfBytes = await downloadCompletedPdf(config.pandaDocApiKey, doc.id);
  const roi = await extractRoiPages(pdfBytes);
  const referralPdf = await mergePdfs(roi.englishPdf, roi.spanishPdf);

  const sent = await sendReferralViaPandaDoc({
    apiKey: config.pandaDocApiKey,
    toEmail: config.referralToEmail,
    payload,
    referralPdf,
    clinicalTemplateUuid: config.clinicalReferralTemplateUuid,
  });

  return {
    sourceDocumentId: doc.id,
    sourceDocumentName: doc.name,
    sentDocumentId: sent.sentDocumentId,
    englishPages: roi.englishPageIndexes,
    spanishPages: roi.spanishPageIndexes,
  };
}
