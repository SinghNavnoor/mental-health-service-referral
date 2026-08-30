import { describe, it, expect } from "vitest";
import {
  buildDocumentNameQuery,
  formatProgramStartDateForDisplay,
  isReferralEligiblePipeline,
  packetPrefixForProgram,
  pickClosestByProgramStartDate,
  parseFlexibleDate,
  resolveProgramLabel,
} from "../src/pandadoc/programPacketMap.js";

describe("packetPrefixForProgram", () => {
  it("maps Family Housing programs to Family Housing packet", () => {
    expect(packetPrefixForProgram("Family Housing 6")).toBe("Family Housing Consent Form Packet");
    expect(packetPrefixForProgram("Family Housing 8 Prevention")).toBe(
      "Family Housing Consent Form Packet"
    );
  });

  it("maps Regional RRH to Regional RRH packet", () => {
    expect(packetPrefixForProgram("Regional RRH")).toBe(
      "Regional RRH Consent Form Packet"
    );
  });

  it("maps Youth Program A - RRH to Youth Demonstration packet", () => {
    expect(packetPrefixForProgram("Youth Program A - RRH")).toBe("Youth Demonstration Consent Form Packet");
  });

  it("keeps Housing For Health without Packet", () => {
    expect(packetPrefixForProgram("Health Housing Partnership")).toBe(
      "Health Housing Consent Form"
    );
  });

  it("resolves HubSpot pipeline IDs to packet prefixes", () => {
    expect(packetPrefixForProgram("100000013")).toBe(
      "Family Housing Consent Form Packet"
    );
    expect(packetPrefixForProgram("100000016")).toBe(
      "Regional RRH Consent Form Packet"
    );
    expect(packetPrefixForProgram("100000001")).toBe(
      "Youth Demonstration Consent Form Packet"
    );
  });

  it("maps Family Shelter CE5 label", () => {
    expect(packetPrefixForProgram("Family Shelter (GEN and CE5)")).toBe(
      "Crisis Housing Consent Form Packet"
    );
  });
});

describe("resolveProgramLabel", () => {
  it("maps Family Housing 8 Prevention id", () => {
    expect(resolveProgramLabel("100000013")).toBe("Family Housing 8 Prevention");
  });
});

describe("isReferralEligiblePipeline", () => {
  it("allows the five MHS programs by id and label", () => {
    expect(isReferralEligiblePipeline("100000009")).toBe(true); // Family Site One
    expect(isReferralEligiblePipeline("Family Site One")).toBe(true);
    expect(isReferralEligiblePipeline("100000004")).toBe(true); // Family Shelter
    expect(isReferralEligiblePipeline("100000003")).toBe(true); // Coordinated Entry 6
    expect(isReferralEligiblePipeline("100000005")).toBe(true); // Youth Program 1 & 2
    expect(isReferralEligiblePipeline("100000008")).toBe(true); // Youth Program A - IH
  });

  it("rejects other programs", () => {
    expect(isReferralEligiblePipeline("100000013")).toBe(false); // Family Housing 8 Prevention
    expect(isReferralEligiblePipeline("Family Housing 6")).toBe(false);
    expect(isReferralEligiblePipeline("Site Alpha")).toBe(false);
  });
});

describe("buildDocumentNameQuery", () => {
  it("builds stem from mapped prefix + client", () => {
    expect(buildDocumentNameQuery("Family Housing 6", "Cindy Murga")).toBe(
      "Family Housing Consent Form Packet - Cindy Murga"
    );
  });

  it("builds stem from pipeline id", () => {
    expect(buildDocumentNameQuery("100000013", "Test Client")).toBe(
      "Family Housing Consent Form Packet - Test Client"
    );
  });
});

describe("pickClosestByProgramStartDate", () => {
  it("picks document whose title date is closest to program start", () => {
    const best = pickClosestByProgramStartDate(
      [
        {
          id: "old",
          name: "Family Housing Consent Form Packet - Jane Doe - 1/1/24",
          status: "document.completed",
        },
        {
          id: "near",
          name: "Family Housing Consent Form Packet - Jane Doe - 11/15/25",
          status: "document.completed",
        },
        {
          id: "far",
          name: "Family Housing Consent Form Packet - Jane Doe - 6/1/26",
          status: "document.completed",
        },
      ],
      "11/17/25"
    );
    expect(best.id).toBe("near");
  });
});

describe("parseFlexibleDate", () => {
  it("parses slash dates", () => {
    const a = parseFlexibleDate("11/17/25");
    const b = parseFlexibleDate("11/15/25");
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(Math.abs(a! - b!)).toBeLessThan(3 * 24 * 60 * 60 * 1000);
  });

  it("parses HubSpot epoch milliseconds", () => {
    expect(parseFlexibleDate("1785196800000")).toBe(1785196800000);
  });
});

describe("formatProgramStartDateForDisplay", () => {
  it("formats HubSpot epoch ms as readable UTC date", () => {
    expect(formatProgramStartDateForDisplay("1785196800000")).toBe(
      "Jul 28, 2026"
    );
  });

  it("passes through already-readable dates when parseable", () => {
    expect(formatProgramStartDateForDisplay("Jul 17, 2026")).toBe(
      "Jul 17, 2026"
    );
  });

  it("returns original string if unparseable", () => {
    expect(formatProgramStartDateForDisplay("not-a-date")).toBe("not-a-date");
  });
});
