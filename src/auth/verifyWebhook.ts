import type { ReferralPayload } from "../types.js";

export function verifyWebhookSecret(
  headerValue: string | string[] | undefined,
  secret: string
): boolean {
  const value = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  if (!value || !secret) return false;
  return value === secret;
}

export function parseReferralPayload(body: unknown): ReferralPayload {
  if (!body || typeof body !== "object") {
    throw new Error("Invalid payload: expected object");
  }
  const b = body as Record<string, unknown>;

  // Aliases from HubSpot property internal names / older keys
  const clientName =
    firstString(b.clientName) ??
    firstString(b.hoh__program__first_name) ??
    firstString(b.subject);

  const programStartDate =
    firstString(b.programStartDate) ??
    firstString(b.createdDate) ??
    firstString(b.createDate) ??
    firstString(b.program_start_date);

  const programId = firstString(b.programId) ?? firstString(b.hs_object_id);
  const programName =
    firstString(b.programName) ?? firstString(b.hs_pipeline);

  if (!programId) throw new Error("Invalid payload: missing programId");
  if (!programName) throw new Error("Invalid payload: missing programName");
  if (!clientName) {
    throw new Error(
      "Invalid payload: missing clientName (hoh__program__first_name)"
    );
  }
  if (!programStartDate) {
    throw new Error("Invalid payload: missing programStartDate");
  }

  return {
    programId,
    programName,
    clientName,
    programStartDate,
    dateOfBirth: firstString(b.dateOfBirth),
    phone: firstString(b.phone),
    email: firstString(b.email),
    age: firstString(b.age) ?? firstString(b.a_hoh),
    clientEmail: firstString(b.clientEmail) ?? firstString(b.e_copy),
    clientPhone: firstString(b.clientPhone) ?? firstString(b.p_mhs),
    referralType: firstString(b.referralType) ?? firstString(b.r_t_mhs),
    moveInDate: firstString(b.moveInDate) ?? firstString(b.s_m_date),
    anticipatedExitDate:
      firstString(b.anticipatedExitDate) ?? firstString(b.epes_er),
    familyHousingSize:
      firstString(b.familyHousingSize) ?? firstString(b.tt_sz),
    preferredCommunication:
      firstString(b.preferredCommunication) ??
      firstMulti(b.preferredCommunication) ??
      firstString(b.p_c_mhs) ??
      firstMulti(b.p_c_mhs),
    initialAssessmentAreas:
      firstString(b.initialAssessmentAreas) ??
      firstMulti(b.initialAssessmentAreas) ??
      firstString(b.i_aa_mhs) ??
      firstMulti(b.i_aa_mhs),
    preferredServices:
      firstString(b.preferredServices) ??
      firstMulti(b.preferredServices) ??
      firstString(b.cps_mhs) ??
      firstMulti(b.cps_mhs),
    hubspotOwnerId:
      firstString(b.hubspotOwnerId) ?? firstString(b.hubspot_owner_id),
    extraFields:
      b.extraFields && typeof b.extraFields === "object"
        ? Object.fromEntries(
            Object.entries(b.extraFields as Record<string, unknown>).map(
              ([k, v]) => [k, String(v ?? "")]
            )
          )
        : undefined,
  };
}

function firstString(...vals: unknown[]): string | undefined {
  for (const v of vals) {
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
    if (typeof v === "boolean") return String(v);
  }
  return undefined;
}

/** HubSpot multi-checkbox may arrive as string[] */
function firstMulti(v: unknown): string | undefined {
  if (!Array.isArray(v) || !v.length) return undefined;
  const parts = v
    .map((x) => (typeof x === "string" || typeof x === "number" ? String(x).trim() : ""))
    .filter(Boolean);
  return parts.length ? parts.join(";") : undefined;
}
