import type { ReferralPayload } from "../types.js";
import { resolveProgramLabel } from "./programPacketMap.js";
import {
  INITIAL_ASSESSMENT_OPTIONS,
  matchedCheckboxOptions,
  PREFERRED_COMMUNICATION_OPTIONS,
  PREFERRED_SERVICES_OPTIONS,
} from "../pdf/checkboxMatch.js";

export function splitClientName(fullName: string): {
  firstName: string;
  lastName: string;
} {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0]!, lastName: "" };
  return {
    firstName: parts[0]!,
    lastName: parts.slice(1).join(" "),
  };
}

function isoDateForField(raw: string | undefined): string | undefined {
  if (!raw?.trim()) return undefined;
  // reuse display formatter's parse via epoch: format then re-parse is messy;
  // HubSpot often sends epoch ms or slash dates — Date.parse handles many.
  const s = raw.trim();
  if (/^\d{10,13}$/.test(s)) {
    const n = Number(s);
    const ms = s.length <= 10 ? n * 1000 : n;
    return new Date(ms).toISOString();
  }
  const t = Date.parse(s);
  if (!Number.isNaN(t)) return new Date(t).toISOString();
  // M/D/YYYY local-ish
  const slash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (slash) {
    const month = Number(slash[1]);
    const day = Number(slash[2]);
    let year = Number(slash[3]);
    if (year < 100) year += year >= 70 ? 1900 : 2000;
    return new Date(Date.UTC(year, month - 1, day)).toISOString();
  }
  return undefined;
}

function todayToken(now = new Date()): string {
  return now.toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });
}

export type ClinicalTemplatePayload = {
  tokens: Array<{ name: string; value: string }>;
  fields: Record<string, { value: string | boolean }>;
};

/**
 * Map HubSpot webhook payload → PandaDoc template tokens + merge fields.
 */
export function buildClinicalTemplatePayload(
  payload: ReferralPayload,
  options: { now?: Date } = {}
): ClinicalTemplatePayload {
  const { firstName, lastName } = splitClientName(payload.clientName);
  const programLabel = resolveProgramLabel(payload.programName);
  const now = options.now ?? new Date();

  const tokens: Array<{ name: string; value: string }> = [
    { name: "Client.FirstName", value: firstName },
    { name: "Client.LastName", value: lastName },
    {
      name: "Client.Email",
      value: payload.clientEmail ?? payload.email ?? "",
    },
    {
      name: "Client.Phone",
      value: payload.clientPhone ?? payload.phone ?? "",
    },
    { name: "Document.CreatedDate", value: todayToken(now) },
    // Case Manager left blank until owner lookup exists
    { name: "Case Manager.FirstName", value: "" },
    { name: "Case Manager.LastName", value: "" },
    { name: "Case Manager.Email", value: "" },
    { name: "Case Manager.Phone", value: "" },
  ];

  const fields: Record<string, { value: string | boolean }> = {
    program: { value: programLabel },
  };

  if (payload.age?.trim()) fields.age = { value: payload.age.trim() };
  if (payload.referralType?.trim()) {
    fields.referral_type = { value: payload.referralType.trim() };
  }
  if (payload.familyHousingSize?.trim()) {
    fields.family_housing_size = { value: payload.familyHousingSize.trim() };
  }

  const moveIn = isoDateForField(payload.moveInDate);
  if (moveIn) fields.move_in_date = { value: moveIn };
  const exit = isoDateForField(payload.anticipatedExitDate);
  if (exit) fields.exit_date = { value: exit };

  const pref = matchedCheckboxOptions(
    payload.preferredCommunication,
    PREFERRED_COMMUNICATION_OPTIONS
  );
  fields.pref_phone = { value: pref.has("Phone") };
  fields.pref_text = { value: pref.has("Text") };
  fields.pref_email = { value: pref.has("Email") };

  const assess = matchedCheckboxOptions(
    payload.initialAssessmentAreas,
    INITIAL_ASSESSMENT_OPTIONS
  );
  fields.ini_family = { value: assess.has("Family dynamics support") };
  fields.ini_stree = {
    value: assess.has("Stress and coping mechanisms"),
  };
  fields.ini_mental_health = {
    value: assess.has(
      "Mental health check-in (e.g., anxiety, depression)"
    ),
  };

  const services = matchedCheckboxOptions(
    payload.preferredServices,
    PREFERRED_SERVICES_OPTIONS
  );
  fields.serve_orientation = { value: services.has("Orientation") };
  fields.serve_initial_assessment = {
    value: services.has("Initial Assessment"),
  };
  fields.serve_therapy = { value: services.has("Therapy Services") };

  return { tokens, fields };
}
