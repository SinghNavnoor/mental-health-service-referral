/**
 * HubSpot Program pipeline stage IDs → display labels.
 * Source: HubSpot pipeline settings (2026-07-29).
 */
const PIPELINE_ID_TO_LABEL: Record<string, string> = {
  "100000001": "Youth Program A - PH",
  "100000002": "Youth Program A - RRH",
  "100000003": "Coordinated Entry 6",
  "100000004": "Family Shelter (GEN and CE5)",
  "100000005": "Youth Program 1 & 2",
  "100000006": "Site Alpha",
  "100000007": "Site Beta",
  "100000008": "Youth Program A - IH",
  "100000009": "Family Site One",
  "100000010": "Health Housing Partnership",
  "100000011": "Family Housing 6",
  "100000012": "Family Housing 8",
  "100000013": "Family Housing 8 Prevention",
  "100000014": "Site Gamma - Youth",
  "100000015": "Site Gamma - Families",
  "100000016": "Regional RRH",
  "100000017": "Inactive/Legacy Programs",
};

/**
 * Maps HubSpot program/pipeline labels to the PandaDoc consent packet title prefix.
 * Matching is case-insensitive after trim.
 */
const PROGRAM_PACKET_PREFIX: Record<string, string> = {
  "family housing 6": "Family Housing Consent Form Packet",
  "family housing 8": "Family Housing Consent Form Packet",
  "family housing 8 prevention": "Family Housing Consent Form Packet",
  "coordinated entry 6": "Crisis Housing Consent Form Packet",
  ces6: "Crisis Housing Consent Form Packet",
  "family shelter (gen and ce5)": "Crisis Housing Consent Form Packet",
  "family shelter (gen and ces)": "Crisis Housing Consent Form Packet",
  "family site one": "Crisis Housing Consent Form Packet",
  "site gamma - youth": "County MH Consent Form Packet",
  "site gamma - families": "County MH Consent Form Packet",
  "health housing partnership": "Health Housing Consent Form",
  "regional rrh": "Regional RRH Consent Form Packet",
  "youth program 1 & 2": "Youth Consent Form Packet",
  "youth program a - ih": "Youth Consent Form Packet",
  "youth program a - ph": "Youth Demonstration Consent Form Packet",
  "youth program a - rrh": "Youth Demonstration Consent Form Packet",
};

export function normalizeProgramLabel(programName: string): string {
  return programName.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Resolve HubSpot pipeline ID to label; pass through if already a label. */
export function resolveProgramLabel(programNameOrId: string): string {
  const raw = String(programNameOrId).trim();
  return PIPELINE_ID_TO_LABEL[raw] ?? raw;
}

/** Programs eligible for mental health referral automation. */
const REFERRAL_ELIGIBLE_LABELS = new Set(
  [
    "Family Site One",
    "Family Shelter (GEN and CE5)",
    "Coordinated Entry 6",
    "Youth Program 1 & 2",
    "Youth Program A - IH",
  ].map(normalizeProgramLabel)
);

export function isReferralEligiblePipeline(programNameOrId: string): boolean {
  const label = resolveProgramLabel(programNameOrId);
  return REFERRAL_ELIGIBLE_LABELS.has(normalizeProgramLabel(label));
}

export function packetPrefixForProgram(programNameOrId: string): string {
  const label = resolveProgramLabel(programNameOrId);
  const key = normalizeProgramLabel(label);
  const prefix = PROGRAM_PACKET_PREFIX[key];
  if (!prefix) {
    throw new Error(
      `No consent packet mapping for program "${programNameOrId}" (resolved: "${label}"). Update PROGRAM_PACKET_PREFIX.`
    );
  }
  return prefix;
}

/** Build search stem: `{Packet Prefix} - {Client Name}` */
export function buildDocumentNameQuery(
  programNameOrId: string,
  clientName: string
): string {
  return `${packetPrefixForProgram(programNameOrId)} - ${clientName.trim()}`;
}

/**
 * Parse common date strings from HubSpot / PandaDoc titles into epoch ms.
 * Returns null if unparseable.
 */
export function parseFlexibleDate(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;

  // HubSpot date properties often arrive as epoch ms (or seconds)
  if (/^\d{10,13}$/.test(s)) {
    const n = Number(s);
    if (!Number.isFinite(n)) return null;
    return s.length <= 10 ? n * 1000 : n;
  }

  // ISO / yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const t = Date.parse(s);
    return Number.isNaN(t) ? null : t;
  }

  // M/D/YY or M/D/YYYY
  const slash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (slash) {
    const month = Number(slash[1]);
    const day = Number(slash[2]);
    let year = Number(slash[3]);
    if (year < 100) year += year >= 70 ? 1900 : 2000;
    const t = new Date(year, month - 1, day).getTime();
    return Number.isNaN(t) ? null : t;
  }

  // Mon D, YYYY (e.g. Jul 17, 2026)
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : t;
}

/** Human-readable program start date for email copy (UTC calendar day). */
export function formatProgramStartDateForDisplay(raw: string): string {
  const ts = parseFlexibleDate(raw);
  if (ts == null) return raw.trim();
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Extract the trailing `{CreateDate}` segment from a PandaDoc document name. */
export function extractDateFromDocumentName(name: string): string | null {
  const parts = name.split(" - ");
  if (parts.length < 3) return null;
  return parts[parts.length - 1]?.trim() || null;
}

export type DatedCandidate = {
  id: string;
  name: string;
  status: string;
};

/**
 * Prefer completed docs whose title date is closest to programStartDate.
 * Falls back to first completed / first result if dates can't be compared.
 */
export function pickClosestByProgramStartDate(
  items: DatedCandidate[],
  programStartDate: string
): DatedCandidate {
  if (!items.length) {
    throw new Error("No matching PandaDoc consent packet found");
  }

  const target = parseFlexibleDate(programStartDate);
  const withParsed = items.map((item) => {
    const raw = extractDateFromDocumentName(item.name);
    const ts = raw ? parseFlexibleDate(raw) : null;
    return { item, ts };
  });

  const dated = withParsed.filter((x) => x.ts != null);
  if (target != null && dated.length) {
    dated.sort(
      (a, b) => Math.abs(a.ts! - target) - Math.abs(b.ts! - target)
    );
    const best = dated[0]!;
    const bestDist = Math.abs(best.ts! - target);
    const ties = dated.filter((x) => Math.abs(x.ts! - target) === bestDist);
    const completedTie = ties.find(
      (x) => x.item.status === "document.completed"
    );
    return (completedTie ?? best).item;
  }

  const completed = items.filter((i) => i.status === "document.completed");
  return (completed[0] ?? items[0])!;
}
