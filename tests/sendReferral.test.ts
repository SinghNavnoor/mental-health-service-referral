import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  buildEmailMessage,
  createDocumentFromPdf,
  waitForDocumentDraft,
  sendPandaDocDocument,
  sendReferralViaPandaDoc,
} from "../src/pandadoc/sendReferral.js";

describe("buildEmailMessage", () => {
  it("uses program label, formatted date, intro, and EN/ES FYI", () => {
    const message = buildEmailMessage({
      programId: "47273813568",
      programName: "100000013",
      clientName: "Test Bob",
      programStartDate: "1785196800000",
    });

    expect(message).toContain(
      "Hi, we are sharing a new mental health referral for the following client."
    );
    expect(message).toContain("Pipeline / program: Family Housing 8 Prevention");
    expect(message).toContain("Client: Test Bob");
    expect(message).toContain("Program start date: Jul 28, 2026");
    expect(message).not.toContain("HubSpot Program ID");
    expect(message).not.toContain("47273813568");
    expect(message).toMatch(/two Consent to Release Information/i);
    expect(message).toMatch(/disregard the other/i);
  });
});

describe("sendReferralViaPandaDoc", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("creates from template, appends ROI section, then sends", async () => {
    const fetchMock = vi
      .fn()
      // create from template
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "new-doc", status: "document.uploaded" }),
      })
      // wait draft
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "new-doc", status: "document.draft" }),
      })
      // append section
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          uuid: "section-1",
          status: "document_sections_upload.UPLOADED",
        }),
      })
      // wait section processed
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          uuid: "section-1",
          status: "document_sections_upload.PROCESSED",
        }),
      })
      // send
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "new-doc", status: "document.sent" }),
        text: async () => "",
      });
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendReferralViaPandaDoc({
      apiKey: "pd-key",
      toEmail: "provider@example.org",
      clinicalTemplateUuid: "tmpl-1",
      payload: {
        programId: "p1",
        programName: "100000003",
        clientName: "Jane Doe",
        programStartDate: "1785196800000",
        clientEmail: "jane@example.com",
      },
      referralPdf: new Uint8Array([1, 2, 3]),
    });

    expect(result.sentDocumentId).toBe("new-doc");
    expect(fetchMock).toHaveBeenCalledTimes(5);

    const createCall = fetchMock.mock.calls[0]!;
    expect(createCall[0]).toBe("https://api.pandadoc.com/public/v1/documents");
    const createBody = JSON.parse(createCall[1].body as string);
    expect(createBody.template_uuid).toBe("tmpl-1");
    expect(createBody.tokens).toEqual(
      expect.arrayContaining([
        { name: "Client.FirstName", value: "Jane" },
        { name: "Client.LastName", value: "Doe" },
      ])
    );
    expect(createBody.fields.program.value).toBe("Coordinated Entry 6");

    const sectionCall = fetchMock.mock.calls[2]!;
    expect(String(sectionCall[0])).toContain(
      "/documents/new-doc/sections/uploads"
    );

    const sendCall = fetchMock.mock.calls[4]!;
    expect(String(sendCall[0])).toContain("/documents/new-doc/send");
    const sendBody = JSON.parse(sendCall[1].body as string);
    expect(sendBody.silent).toBe(false);
    expect(sendBody.subject).toBe(
      "Mental Health Referral – Jane Doe – Coordinated Entry 6"
    );
  });
});

describe("createDocumentFromPdf", () => {
  it("throws on non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => "bad",
      })
    );
    await expect(
      createDocumentFromPdf("key", {
        name: "x",
        toEmail: "a@b.com",
        pdfBytes: new Uint8Array([1]),
      })
    ).rejects.toThrow(/create document failed/i);
  });
});

describe("waitForDocumentDraft", () => {
  it("throws if draft never reached", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: "document.uploaded" }),
      })
    );
    await expect(
      waitForDocumentDraft("key", "doc", { maxAttempts: 2, intervalMs: 1 })
    ).rejects.toThrow(/did not become draft/i);
  });
});

describe("sendPandaDocDocument", () => {
  it("throws on send failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => "fail",
      })
    );
    await expect(
      sendPandaDocDocument("key", "doc", "subj", "msg")
    ).rejects.toThrow(/send failed/i);
  });
});
