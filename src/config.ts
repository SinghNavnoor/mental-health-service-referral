export type AppConfig = {
  webhookSecret: string;
  pandaDocApiKey: string;
  /** Provider email that receives the PandaDoc referral document */
  referralToEmail: string;
  /** Clinical Referral Form template UUID (PandaDoc workspace-specific) */
  clinicalReferralTemplateUuid: string;
  /** Address printed in the generated cover-page footer */
  clinicalFormContactEmail: string;
  /** Organization name rendered on the generated cover page */
  orgName: string;
};

/** Placeholder shown when no contact address is configured. */
export const DEFAULT_CLINICAL_FORM_CONTACT_EMAIL = "clinic@example.org";

/** Placeholder shown when no organization name is configured. */
export const DEFAULT_ORG_NAME = "Example Housing Services";

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const required = [
    "WEBHOOK_SECRET",
    "PANDADOC_API_KEY",
    "REFERRAL_TO_EMAIL",
    "CLINICAL_REFERRAL_TEMPLATE_UUID",
  ] as const;

  for (const key of required) {
    if (!env[key]?.trim()) {
      throw new Error(`Missing required env var: ${key}`);
    }
  }

  return {
    webhookSecret: env.WEBHOOK_SECRET!,
    pandaDocApiKey: env.PANDADOC_API_KEY!,
    referralToEmail: env.REFERRAL_TO_EMAIL!,
    clinicalReferralTemplateUuid: env.CLINICAL_REFERRAL_TEMPLATE_UUID!.trim(),
    clinicalFormContactEmail:
      env.CLINICAL_FORM_CONTACT_EMAIL?.trim() ||
      DEFAULT_CLINICAL_FORM_CONTACT_EMAIL,
    orgName: env.ORG_NAME?.trim() || DEFAULT_ORG_NAME,
  };
}
