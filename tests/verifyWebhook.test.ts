import { describe, it, expect } from "vitest";
import {
  verifyWebhookSecret,
  parseReferralPayload,
} from "../src/auth/verifyWebhook.js";

describe("verifyWebhookSecret", () => {
  it("accepts exact match", () => {
    expect(verifyWebhookSecret("abc123", "abc123")).toBe(true);
  });
  it("rejects mismatch", () => {
    expect(verifyWebhookSecret("nope", "abc123")).toBe(false);
  });
  it("rejects missing header", () => {
    expect(verifyWebhookSecret(undefined, "abc123")).toBe(false);
  });
});

describe("parseReferralPayload", () => {
  it("maps HubSpot fields including hoh full name", () => {
    const payload = parseReferralPayload({
      programId: "123",
      programName: "Family Housing 6",
      hoh__program__first_name: "Jane Doe",
      program_start_date: "11/17/25",
    });
    expect(payload.programName).toBe("Family Housing 6");
    expect(payload.clientName).toBe("Jane Doe");
    expect(payload.programStartDate).toBe("11/17/25");
  });

  it("accepts numeric HubSpot ids", () => {
    const payload = parseReferralPayload({
      programId: 47273737899,
      programName: "Family Housing 6",
      clientName: "Jane Doe",
      programStartDate: "11/17/25",
    });
    expect(payload.programId).toBe("47273737899");
  });

  it("maps MHS clinical fields from HubSpot internal names", () => {
    const payload = parseReferralPayload({
      programId: "1",
      hs_pipeline: "100000009",
      hoh__program__first_name: "Test Bob",
      program_start_date: "1785196800000",
      a_hoh: "34",
      e_copy: "bob@example.com",
      p_mhs: "555-0100",
      r_t_mhs: "Self",
      s_m_date: "01/15/2026",
      epes_er: "06/01/2026",
      tt_sz: "3",
      p_c_mhs: "Phone;Email",
      i_aa_mhs: "Family dynamics support",
      cps_mhs: ["Orientation", "Therapy Services"],
      hubspot_owner_id: 12345,
    });
    expect(payload.programName).toBe("100000009");
    expect(payload.age).toBe("34");
    expect(payload.clientEmail).toBe("bob@example.com");
    expect(payload.clientPhone).toBe("555-0100");
    expect(payload.referralType).toBe("Self");
    expect(payload.moveInDate).toBe("01/15/2026");
    expect(payload.anticipatedExitDate).toBe("06/01/2026");
    expect(payload.familyHousingSize).toBe("3");
    expect(payload.preferredCommunication).toBe("Phone;Email");
    expect(payload.initialAssessmentAreas).toBe("Family dynamics support");
    expect(payload.preferredServices).toBe("Orientation;Therapy Services");
    expect(payload.hubspotOwnerId).toBe("12345");
  });

  it("throws when required fields missing", () => {
    expect(() => parseReferralPayload({ programName: "Youth Program A - RRH" })).toThrow(
      /clientName|programId/i
    );
  });
});
