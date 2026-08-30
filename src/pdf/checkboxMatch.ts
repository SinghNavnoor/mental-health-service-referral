/** Split HubSpot multi-value strings into tokens. */
export function splitMultiValue(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/[;,|]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Return which option labels are selected given HubSpot multi-value text.
 * Match is case-insensitive; option matches if any token equals or is contained
 * in the option (or vice versa) after normalize.
 */
export function matchedCheckboxOptions(
  raw: string | undefined,
  options: readonly string[]
): Set<string> {
  const tokens = splitMultiValue(raw).map(normalizeToken);
  const selected = new Set<string>();
  if (!tokens.length) return selected;

  for (const option of options) {
    const opt = normalizeToken(option);
    const hit = tokens.some(
      (t) => t === opt || opt.includes(t) || t.includes(opt)
    );
    if (hit) selected.add(option);
  }
  return selected;
}

function normalizeToken(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

export const PREFERRED_COMMUNICATION_OPTIONS = [
  "Phone",
  "Text",
  "Email",
] as const;

export const INITIAL_ASSESSMENT_OPTIONS = [
  "Family dynamics support",
  "Stress and coping mechanisms",
  "Mental health check-in (e.g., anxiety, depression)",
] as const;

export const PREFERRED_SERVICES_OPTIONS = [
  "Orientation",
  "Initial Assessment",
  "Therapy Services",
] as const;
