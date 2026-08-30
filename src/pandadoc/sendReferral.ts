import type { ReferralPayload } from "../types.js";
import { pandaDocFetch } from "./client.js";
import { buildClinicalTemplatePayload } from "./clinicalTemplate.js";
import {
  formatProgramStartDateForDisplay,
  resolveProgramLabel,
} from "./programPacketMap.js";

export type SendReferralViaPandaDocArgs = {
  apiKey: string;
  toEmail: string;
  payload: ReferralPayload;
  /** Combined ROI PDF (EN + ES pages) appended as a document section */
  referralPdf: Uint8Array;
  /** Clinical Referral Form template UUID (workspace-specific; from env) */
  clinicalTemplateUuid: string;
};

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

export function buildEmailMessage(payload: ReferralPayload): string {
  const programLabel = resolveProgramLabel(payload.programName);
  const startDate = formatProgramStartDateForDisplay(payload.programStartDate);
  const lines = [
    "Hi, we are sharing a new mental health referral for the following client.",
    "",
    `Pipeline / program: ${programLabel}`,
    `Client: ${payload.clientName}`,
    `Program start date: ${startDate}`,
  ];
  if (payload.dateOfBirth) lines.push(`Date of birth: ${payload.dateOfBirth}`);
  if (payload.phone) lines.push(`Phone: ${payload.phone}`);
  if (payload.email) lines.push(`Email: ${payload.email}`);
  if (payload.extraFields) {
    for (const [k, v] of Object.entries(payload.extraFields)) {
      lines.push(`${k}: ${v}`);
    }
  }
  lines.push(
    "",
    "Just an FYI: you will see the Clinical Referral Form, plus two Consent to Release Information forms — one in English and one in Spanish. The client chose one or the other. If they chose English, the English form will be signed; if they chose Spanish, the Spanish form will be signed. Please disregard the other one."
  );
  return lines.join("\n");
}

export async function createDocumentFromClinicalTemplate(
  apiKey: string,
  args: {
    name: string;
    toEmail: string;
    templateUuid: string;
    payload: ReferralPayload;
    now?: Date;
  }
): Promise<{ id: string; status: string }> {
  const { tokens, fields } = buildClinicalTemplatePayload(args.payload, {
    now: args.now,
  });

  const res = await fetch("https://api.pandadoc.com/public/v1/documents", {
    method: "POST",
    headers: {
      Authorization: `API-Key ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: args.name,
      template_uuid: args.templateUuid,
      recipients: [
        {
          email: args.toEmail,
          first_name: "Provider",
          role: "MH Clinic",
        },
        {
          email: args.toEmail,
          first_name: "Staff",
          role: "Case Manager",
        },
      ],
      tokens,
      fields,
      parse_form_fields: false,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `PandaDoc create from template failed: ${res.status} ${text}`
    );
  }

  return (await res.json()) as { id: string; status: string };
}

/** @deprecated Prefer createDocumentFromClinicalTemplate — kept for tests */
export async function createDocumentFromPdf(
  apiKey: string,
  args: {
    name: string;
    toEmail: string;
    pdfBytes: Uint8Array;
  }
): Promise<{ id: string; status: string }> {
  const form = new FormData();
  form.append(
    "file",
    new Blob([Buffer.from(args.pdfBytes)], { type: "application/pdf" }),
    "consent-to-release-information.pdf"
  );
  form.append(
    "data",
    JSON.stringify({
      name: args.name,
      recipients: [
        {
          email: args.toEmail,
          first_name: "Provider",
          role: "user",
        },
      ],
      parse_form_fields: false,
    })
  );

  const res = await fetch("https://api.pandadoc.com/public/v1/documents", {
    method: "POST",
    headers: {
      Authorization: `API-Key ${apiKey}`,
    },
    body: form,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PandaDoc create document failed: ${res.status} ${text}`);
  }

  return (await res.json()) as { id: string; status: string };
}

export async function appendPdfSection(
  apiKey: string,
  documentId: string,
  pdfBytes: Uint8Array,
  sectionName = "Consent to Release Information"
): Promise<{ uuid: string; status: string }> {
  const form = new FormData();
  form.append(
    "file",
    new Blob([Buffer.from(pdfBytes)], { type: "application/pdf" }),
    "consent-to-release-information.pdf"
  );
  form.append(
    "data",
    JSON.stringify({
      name: sectionName,
      parse_form_fields: false,
    })
  );

  const res = await fetch(
    `https://api.pandadoc.com/public/v1/documents/${documentId}/sections/uploads`,
    {
      method: "POST",
      headers: {
        Authorization: `API-Key ${apiKey}`,
      },
      body: form,
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `PandaDoc append section failed: ${res.status} ${text}`
    );
  }

  return (await res.json()) as { uuid: string; status: string };
}

export async function waitForSectionProcessed(
  apiKey: string,
  documentId: string,
  uploadId: string,
  options: { maxAttempts?: number; intervalMs?: number } = {}
): Promise<void> {
  const maxAttempts = options.maxAttempts ?? 30;
  const intervalMs = options.intervalMs ?? 2000;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const res = await pandaDocFetch(
      apiKey,
      `/public/v1/documents/${documentId}/sections/uploads/${uploadId}`
    );
    if (!res.ok) {
      throw new Error(`PandaDoc section status check failed: ${res.status}`);
    }
    const data = (await res.json()) as { status: string };
    const status = data.status.toLowerCase();
    if (
      status === "document_sections_upload.processed" ||
      status.endsWith(".processed")
    ) {
      return;
    }
    if (
      status === "document_sections_upload.error" ||
      status.endsWith(".error")
    ) {
      throw new Error(`PandaDoc section upload error: ${data.status}`);
    }
    await sleep(intervalMs);
  }
  throw new Error(
    `PandaDoc section ${uploadId} did not process in time`
  );
}

export async function waitForDocumentDraft(
  apiKey: string,
  documentId: string,
  options: { maxAttempts?: number; intervalMs?: number } = {}
): Promise<void> {
  const maxAttempts = options.maxAttempts ?? 20;
  const intervalMs = options.intervalMs ?? 2000;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const res = await pandaDocFetch(
      apiKey,
      `/public/v1/documents/${documentId}`
    );
    if (!res.ok) {
      throw new Error(`PandaDoc status check failed: ${res.status}`);
    }
    const data = (await res.json()) as { status: string };
    if (data.status === "document.draft") return;
    if (data.status === "document.error") {
      throw new Error(`PandaDoc document entered error status: ${data.status}`);
    }
    await sleep(intervalMs);
  }
  throw new Error(
    `PandaDoc document ${documentId} did not become draft in time`
  );
}

export async function sendPandaDocDocument(
  apiKey: string,
  documentId: string,
  subject: string,
  message: string
): Promise<void> {
  const res = await pandaDocFetch(
    apiKey,
    `/public/v1/documents/${documentId}/send`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subject,
        message,
        silent: false,
      }),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PandaDoc send failed: ${res.status} ${text}`);
  }
}

export async function sendReferralViaPandaDoc(
  args: SendReferralViaPandaDocArgs
): Promise<{ sentDocumentId: string }> {
  const clientName = args.payload.clientName;
  const programLabel = resolveProgramLabel(args.payload.programName);
  const docName = `Mental Health Referral – ${clientName} – ${programLabel}`;
  const subject = docName;
  const message = buildEmailMessage(args.payload);
  const templateUuid = args.clinicalTemplateUuid;

  const created = await createDocumentFromClinicalTemplate(args.apiKey, {
    name: docName,
    toEmail: args.toEmail,
    templateUuid,
    payload: args.payload,
  });

  await waitForDocumentDraft(args.apiKey, created.id);

  const section = await appendPdfSection(
    args.apiKey,
    created.id,
    args.referralPdf
  );
  await waitForSectionProcessed(args.apiKey, created.id, section.uuid);

  await sendPandaDocDocument(args.apiKey, created.id, subject, message);

  return { sentDocumentId: created.id };
}
