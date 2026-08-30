import { describe, it, expect } from "vitest";
import {
  buildClinicalTemplatePayload,
  splitClientName,
} from "../src/pandadoc/clinicalTemplate.js";

describe("splitClientName", () => {
  it("splits first and last", () => {
    expect(splitClientName("Test Bob")).toEqual({
      firstName: "Test",
      lastName: "Bob",
    });
  });
});

describe("buildClinicalTemplatePayload", () => {
  it("maps tokens and merge fields including checkboxes", () => {
    const { tokens, fields } = buildClinicalTemplatePayload(
      {
        programId: "1",
        programName: "100000003",
        clientName: "Test Bob",
        programStartDate: "1785196800000",
        clientEmail: "bob@example.com",
        clientPhone: "555",
        referralType: "Youth Housing",
        moveInDate: "08/01/2026",
        preferredCommunication: "Phone;Email",
        initialAssessmentAreas: "Family dynamics support;Stress and coping mechanisms",
        preferredServices: "Orientation",
        familyHousingSize: "3",
      },
      { now: new Date("2026-07-29T12:00:00Z") }
    );

    expect(tokens.find((t) => t.name === "Client.FirstName")?.value).toBe(
      "Test"
    );
    expect(tokens.find((t) => t.name === "Client.LastName")?.value).toBe(
      "Bob"
    );
    expect(tokens.find((t) => t.name === "Client.Email")?.value).toBe(
      "bob@example.com"
    );
    expect(tokens.find((t) => t.name === "Document.CreatedDate")?.value).toBe(
      "07/29/2026"
    );

    expect(fields.program.value).toBe("Coordinated Entry 6");
    expect(fields.referral_type.value).toBe("Youth Housing");
    expect(fields.family_housing_size.value).toBe("3");
    expect(fields.pref_phone.value).toBe(true);
    expect(fields.pref_text.value).toBe(false);
    expect(fields.pref_email.value).toBe(true);
    expect(fields.ini_family.value).toBe(true);
    expect(fields.ini_stree.value).toBe(true);
    expect(fields.serve_orientation.value).toBe(true);
    expect(fields.serve_therapy.value).toBe(false);
    expect(fields.move_in_date.value).toMatch(/^2026-08-01/);
  });
});
