import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { buildClinicalCoverPage } from "../src/pdf/buildClinicalCoverPage.js";
import {
  matchedCheckboxOptions,
  PREFERRED_COMMUNICATION_OPTIONS,
} from "../src/pdf/checkboxMatch.js";

describe("matchedCheckboxOptions", () => {
  it("matches Phone and Email from semicolon list", () => {
    const selected = matchedCheckboxOptions(
      "Phone; Email",
      PREFERRED_COMMUNICATION_OPTIONS
    );
    expect([...selected]).toEqual(["Phone", "Email"]);
  });
});

describe("buildClinicalCoverPage", () => {
  it("produces a one-page PDF with program label and client", async () => {
    const bytes = await buildClinicalCoverPage(
      {
        programId: "1",
        programName: "100000009",
        clientName: "Test Bob",
        programStartDate: "1785196800000",
        age: "34",
        clientEmail: "bob@example.com",
        clientPhone: "555-0100",
        referralType: "Staff",
        preferredCommunication: "Phone;Text",
        hubspotOwnerId: "999",
      },
      { now: new Date("2026-07-29T12:00:00Z") }
    );

    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(1);
    // pdf-lib does not expose text extraction; size sanity check
    expect(bytes.byteLength).toBeGreaterThan(5000);
  });
});
