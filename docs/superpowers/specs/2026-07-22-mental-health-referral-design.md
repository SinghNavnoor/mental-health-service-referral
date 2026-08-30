# Mental Health Service Referral — Design Spec

**Date:** 2026-07-22  
**Status:** Approved approach B (HubSpot workflow → Vercel → PandaDoc → Outlook)

## Problem

When a new Program record is created in HubSpot (after intake), the org must email the mental health service provider with client intake details plus the signed **Consent to Release Information** forms from that client’s PandaDoc consent packet. The ROI forms must be extracted from a multi-page packet without relying on fixed page numbers.

## Constraints (decided)

- Trigger: HubSpot Program object, new record created
- Consent packet already exists in PandaDoc before/at intake
- Attach **both** English and Spanish ROI forms
- Locate ROI pages by **document text**, never by page index
- Email via **Outlook** (Microsoft Graph); fixed recipient address (provided later)
- From mailbox: configurable, provided later
- Host: **Vercel** (GitHub for source); ~50 runs/month is fine on Hobby
- Do **not** put PandaDoc download + PDF split + Graph send entirely inside HubSpot custom code (20s / library limits)

## Architecture

```
HubSpot Workflow (Program created)
    → POST webhook to Vercel /api/referral
        → Validate shared secret
        → Build expected PandaDoc document name
        → Search PandaDoc documents by name
        → Download completed PDF (protected download when applicable)
        → Scan each page text; collect English + Spanish ROI pages
        → Build email body from HubSpot fields
        → Send via Microsoft Graph (Outlook) with 2 PDF attachments
        → Return success/failure to HubSpot
```

## Document naming

Expected PandaDoc document name pattern:

`{ProgramName} Consent Form Packet - {FirstName} {LastName} - {CreatedDate}`

Examples:
- `Regional RRH Consent Form Packet - Jane Doe - Jul 17, 2026`
- `Youth Consent Form Packet - [Client.FirstName] [Client.LastName] - [Document.CreatedDate]` (template example on disk)

Program name, names, and date come from the HubSpot webhook payload. Date format must be confirmed against real PandaDoc document titles during implementation (normalize/search flexibly).

## ROI page detection

Scan extracted text per PDF page (case-insensitive, whitespace-normalized):

| Language | Match title substring |
|----------|------------------------|
| English  | `Consent to Release Information` |
| Spanish  | `Consentimiento Para Divulgar` |

Do **not** use TOC page numbers. Multi-page forms: include consecutive pages that continue the same form if needed; for the sample packet each language is one page.

Optional enhancement: PandaDoc `separate_files=true` zip-by-section if section names are reliable; text scan remains the source of truth.

## Email

- **To:** fixed address (env `OUTLOOK_TO_EMAIL`)
- **From:** org mailbox (env `OUTLOOK_FROM_USER`)
- **Subject:** e.g. `Mental Health Referral – {FirstName} {LastName} – {ProgramName}`
- **Body:** key HubSpot intake fields (name, DOB, program, contact info, HubSpot record id)
- **Attachments:**
  - `Consent-to-Release-Information-EN.pdf`
  - `Consentimiento-Para-Divulgar-Informacion-ES.pdf`

## Auth & secrets

| Secret | Where |
|--------|--------|
| `WEBHOOK_SECRET` | Vercel + HubSpot webhook header |
| `PANDADOC_API_KEY` | Vercel |
| Azure AD app: `tenant`, `client_id`, `client_secret` | Vercel (client credentials, `Mail.Send` application permission) |
| `OUTLOOK_FROM_USER`, `OUTLOOK_TO_EMAIL` | Vercel |

## Error handling

- Missing/ambiguous PandaDoc match → 422 + log; do not send partial email
- ROI pages not found → 422 + log
- PandaDoc 202 (PDF not ready) → retry with `Retry-After` (bounded)
- Graph/PandaDoc 5xx → 502 so HubSpot can retry
- Never log full PDF bytes or PHI beyond what’s needed for ops debugging

## Out of scope

- Creating PandaDoc packets
- Provider address lookup by program
- Language-based single-form selection (always both)
- HubSpot-only custom code implementation

## Success criteria

1. Creating a Program in HubSpot triggers one outbound email to the fixed provider address.
2. Email includes intake summary fields from HubSpot.
3. Email attaches English + Spanish ROI PDFs found by title text inside the correct consent packet.
4. Works across programs (Youth, Regional RRH, etc.) without hard-coded page numbers.
