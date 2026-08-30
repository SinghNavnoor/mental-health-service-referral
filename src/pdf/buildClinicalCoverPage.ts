import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { ReferralPayload } from "../types.js";
import {
  DEFAULT_CLINICAL_FORM_CONTACT_EMAIL,
  DEFAULT_ORG_NAME,
} from "../config.js";
import {
  formatProgramStartDateForDisplay,
  resolveProgramLabel,
} from "../pandadoc/programPacketMap.js";
import { ORG_LOGO_PNG_BASE64 } from "./orgLogoBase64.js";
import {
  INITIAL_ASSESSMENT_OPTIONS,
  matchedCheckboxOptions,
  PREFERRED_COMMUNICATION_OPTIONS,
  PREFERRED_SERVICES_OPTIONS,
} from "./checkboxMatch.js";

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 40;
const COL_GAP = 24;
const COL_W = (PAGE_W - MARGIN * 2 - COL_GAP) / 2;
const FIELD_BG = rgb(0.93, 0.93, 0.95);
const LABEL = rgb(0.15, 0.15, 0.18);
const MUTED = rgb(0.35, 0.35, 0.4);
const LINE = rgb(0.75, 0.75, 0.78);

function displayDate(raw: string | undefined): string {
  if (!raw?.trim()) return "";
  return formatProgramStartDateForDisplay(raw);
}

function todayDisplay(now = new Date()): string {
  return now.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Build a single-page Clinical Referral Form PDF filled from webhook payload.
 *
 * Organization name and contact address are injected by the caller (from env)
 * so no tenant-specific values are baked into the source.
 */
export async function buildClinicalCoverPage(
  payload: ReferralPayload,
  options: {
    now?: Date;
    orgName?: string;
    contactEmail?: string;
  } = {}
): Promise<Uint8Array> {
  const orgName = options.orgName?.trim() || DEFAULT_ORG_NAME;
  const contactEmail =
    options.contactEmail?.trim() || DEFAULT_CLINICAL_FORM_CONTACT_EMAIL;
  const doc = await PDFDocument.create();
  const page = doc.addPage([PAGE_W, PAGE_H]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const logoBytes = Buffer.from(ORG_LOGO_PNG_BASE64, "base64");
  const logo = await doc.embedPng(logoBytes);
  const logoSize = 56;
  page.drawImage(logo, {
    x: MARGIN,
    y: PAGE_H - MARGIN - logoSize,
    width: logoSize,
    height: logoSize,
  });

  page.drawText("Clinical Referral Form", {
    x: MARGIN + logoSize + 14,
    y: PAGE_H - MARGIN - 36,
    size: 18,
    font: fontBold,
    color: LABEL,
  });

  // header rule
  const ruleY = PAGE_H - MARGIN - logoSize - 12;
  page.drawLine({
    start: { x: MARGIN, y: ruleY },
    end: { x: PAGE_W - MARGIN, y: ruleY },
    thickness: 1,
    color: LINE,
  });

  const programLabel = resolveProgramLabel(payload.programName);
  const leftX = MARGIN;
  const rightX = MARGIN + COL_W + COL_GAP;
  let y = ruleY - 28;

  const row = (
    leftLabel: string,
    leftValue: string,
    rightLabel: string,
    rightValue: string
  ) => {
    drawLabeledField(page, font, fontBold, leftX, y, COL_W, leftLabel, leftValue);
    drawLabeledField(
      page,
      font,
      fontBold,
      rightX,
      y,
      COL_W,
      rightLabel,
      rightValue
    );
    y -= 48;
  };

  row("Client Name:", payload.clientName, "Date:", todayDisplay(options.now));
  row("Program:", programLabel, "Age:", payload.age ?? "");
  row(
    "Client Email:",
    payload.clientEmail ?? payload.email ?? "",
    "Client Phone:",
    payload.clientPhone ?? payload.phone ?? ""
  );

  drawLabeledField(
    page,
    font,
    fontBold,
    leftX,
    y,
    PAGE_W - MARGIN * 2,
    "Referral Type:",
    payload.referralType ?? ""
  );
  y -= 52;

  const note =
    `${orgName} Clinical Services is a voluntary program. This resource can be used for emotional, mental health, or family support. Please Note: the clinical program is part of the move in orientation, but participation level is client-directed.`;
  y = drawWrappedText(page, font, note, leftX, y, PAGE_W - MARGIN * 2, 9, MUTED);
  y -= 18;

  row(
    "Move-In Date:",
    displayDate(payload.moveInDate),
    "Anticipated Exit Date:",
    displayDate(payload.anticipatedExitDate)
  );

  drawLabeledField(
    page,
    font,
    fontBold,
    leftX,
    y,
    COL_W,
    "Family Housing Size:",
    payload.familyHousingSize ?? ""
  );
  drawCheckboxGroup(
    page,
    font,
    fontBold,
    rightX,
    y + 12,
    COL_W,
    "Preferred Communication:",
    PREFERRED_COMMUNICATION_OPTIONS,
    matchedCheckboxOptions(
      payload.preferredCommunication,
      PREFERRED_COMMUNICATION_OPTIONS
    )
  );
  y -= 78;

  drawCheckboxGroup(
    page,
    font,
    fontBold,
    leftX,
    y,
    COL_W,
    "Initial Assessment Areas (Optional):",
    INITIAL_ASSESSMENT_OPTIONS,
    matchedCheckboxOptions(
      payload.initialAssessmentAreas,
      INITIAL_ASSESSMENT_OPTIONS
    )
  );
  drawCheckboxGroup(
    page,
    font,
    fontBold,
    rightX,
    y,
    COL_W,
    "Preferred Services:",
    PREFERRED_SERVICES_OPTIONS,
    matchedCheckboxOptions(payload.preferredServices, PREFERRED_SERVICES_OPTIONS)
  );
  y -= 100;

  drawLabeledField(
    page,
    font,
    fontBold,
    leftX,
    y,
    PAGE_W - MARGIN * 2,
    "Staff Name:",
    payload.hubspotOwnerId ?? ""
  );
  y -= 56;

  page.drawText(
    `*Email Clinical Referral Form to ${contactEmail}`,
    {
      x: MARGIN,
      y: Math.max(MARGIN, y),
      size: 9,
      font,
      color: MUTED,
    }
  );

  return doc.save();
}

function drawLabeledField(
  page: ReturnType<PDFDocument["addPage"]>,
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  fontBold: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  x: number,
  y: number,
  width: number,
  label: string,
  value: string
) {
  page.drawText(label, {
    x,
    y: y + 18,
    size: 9,
    font: fontBold,
    color: LABEL,
  });
  page.drawRectangle({
    x,
    y: y - 4,
    width,
    height: 20,
    color: FIELD_BG,
    borderColor: LINE,
    borderWidth: 0.5,
  });
  const text = value || "";
  page.drawText(truncate(text, font, width - 10, 10), {
    x: x + 6,
    y: y + 2,
    size: 10,
    font,
    color: LABEL,
  });
}

function drawCheckboxGroup(
  page: ReturnType<PDFDocument["addPage"]>,
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  fontBold: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  x: number,
  y: number,
  width: number,
  title: string,
  options: readonly string[],
  selected: Set<string>
) {
  page.drawText(title, {
    x,
    y,
    size: 9,
    font: fontBold,
    color: LABEL,
  });
  let cy = y - 16;
  for (const opt of options) {
    const box = 10;
    page.drawRectangle({
      x,
      y: cy - 1,
      width: box,
      height: box,
      borderColor: LABEL,
      borderWidth: 1,
    });
    if (selected.has(opt)) {
      page.drawText("X", {
        x: x + 1.5,
        y: cy,
        size: 9,
        font: fontBold,
        color: LABEL,
      });
    }
    page.drawText(truncate(opt, font, width - 18, 8), {
      x: x + 16,
      y: cy,
      size: 8,
      font,
      color: LABEL,
    });
    cy -= 16;
  }
}

function drawWrappedText(
  page: ReturnType<PDFDocument["addPage"]>,
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  size: number,
  color: ReturnType<typeof rgb>
): number {
  const words = text.split(/\s+/);
  let line = "";
  let cy = y;
  const lines: string[] = [];
  for (const w of words) {
    const trial = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(trial, size) > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = trial;
    }
  }
  if (line) lines.push(line);
  for (const l of lines) {
    page.drawText(l, { x, y: cy, size, font, color });
    cy -= size + 3;
  }
  return cy;
}

function truncate(
  text: string,
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  maxWidth: number,
  size: number
): string {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let s = text;
  while (s.length > 0 && font.widthOfTextAtSize(`${s}…`, size) > maxWidth) {
    s = s.slice(0, -1);
  }
  return s ? `${s}…` : "";
}
