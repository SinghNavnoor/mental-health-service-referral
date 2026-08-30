import { describe, it, expect } from "vitest";
import { buildDocumentNameQuery } from "../src/pandadoc/findDocument.js";

describe("buildDocumentNameQuery export", () => {
  it("uses mapped packet prefix", () => {
    expect(buildDocumentNameQuery("Regional RRH", "Jane Doe")).toBe(
      "Regional RRH Consent Form Packet - Jane Doe"
    );
  });
});
