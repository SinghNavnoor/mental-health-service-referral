import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AppConfig } from "../src/config.js";

vi.mock("../src/pandadoc/findDocument.js", () => ({
  findConsentPacket: vi.fn(),
}));
vi.mock("../src/pandadoc/downloadPdf.js", () => ({
  downloadCompletedPdf: vi.fn(),
}));
vi.mock("../src/pdf/extractRoiPages.js", () => ({
  extractRoiPages: vi.fn(),
}));
vi.mock("../src/pdf/mergePdfs.js", () => ({
  mergePdfs: vi.fn(),
}));
vi.mock("../src/pandadoc/sendReferral.js", () => ({
  sendReferralViaPandaDoc: vi.fn(),
}));

import { findConsentPacket } from "../src/pandadoc/findDocument.js";
import { downloadCompletedPdf } from "../src/pandadoc/downloadPdf.js";
import { extractRoiPages } from "../src/pdf/extractRoiPages.js";
import { mergePdfs } from "../src/pdf/mergePdfs.js";
import { sendReferralViaPandaDoc } from "../src/pandadoc/sendReferral.js";
import { runReferralPipeline } from "../src/pipeline.js";

const config: AppConfig = {
  webhookSecret: "secret",
  pandaDocApiKey: "pd-key",
  referralToEmail: "provider@example.org",
  clinicalReferralTemplateUuid: "tmpl-clinical",
  clinicalFormContactEmail: "clinic@example.org",
  orgName: "Example Housing Services",
};

describe("runReferralPipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("finds packet, extracts ROI, merges, and sends via PandaDoc template", async () => {
    vi.mocked(findConsentPacket).mockResolvedValue({
      id: "doc-1",
      name: "Crisis Housing Consent Form Packet - Jane Doe - Jul 17, 2026",
      status: "document.completed",
    });
    vi.mocked(downloadCompletedPdf).mockResolvedValue(new Uint8Array([9]));
    vi.mocked(extractRoiPages).mockResolvedValue({
      englishPdf: new Uint8Array([1]),
      spanishPdf: new Uint8Array([2]),
      englishPageIndexes: [5],
      spanishPageIndexes: [6],
    });
    vi.mocked(mergePdfs).mockResolvedValue(new Uint8Array([1, 2]));
    vi.mocked(sendReferralViaPandaDoc).mockResolvedValue({
      sentDocumentId: "sent-9",
    });

    const payload = {
      programId: "p1",
      programName: "Coordinated Entry 6",
      clientName: "Jane Doe",
      programStartDate: "Jul 17, 2026",
    };

    const result = await runReferralPipeline(config, payload);

    expect(findConsentPacket).toHaveBeenCalledWith("pd-key", payload);
    expect(downloadCompletedPdf).toHaveBeenCalledWith("pd-key", "doc-1");
    expect(mergePdfs).toHaveBeenCalledWith(
      new Uint8Array([1]),
      new Uint8Array([2])
    );
    expect(sendReferralViaPandaDoc).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: "pd-key",
        toEmail: "provider@example.org",
        referralPdf: new Uint8Array([1, 2]),
        clinicalTemplateUuid: "tmpl-clinical",
      })
    );
    expect(result.sourceDocumentId).toBe("doc-1");
    expect(result.sentDocumentId).toBe("sent-9");
  });
});
