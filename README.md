# Mental Health Service Referral

A serverless integration that automates mental health provider referrals for a
housing services organization. When a **Program** record is created in HubSpot,
the service assembles a complete referral packet and sends it to the receiving
clinical provider — no manual document handling.

> **Portfolio note.** This is a sanitized, public copy of a system built for a
> nonprofit housing provider. All credentials, organization identifiers, internal
> URLs, and client data have been removed or replaced with placeholders. See
> [Privacy & sample data](#privacy--sample-data).

## What it does

1. HubSpot workflow POSTs intake fields to the webhook on Program creation
2. The service authenticates the request against a shared secret
3. Skips programs outside the referral-eligible allowlist (HTTP 200, `skipped: true`)
4. Resolves the HubSpot pipeline ID → program label → consent packet title prefix
5. Finds the matching **completed** PandaDoc consent packet; when several packets
   share a client name, picks the one whose title date is closest to the program
   start date
6. Creates a Clinical Referral Form from a PandaDoc template, populating tokens
   and merge fields from the webhook payload
7. Extracts the **English and Spanish Consent to Release Information** pages
   **by page text, never by fixed page index**
8. Appends those pages as a document section and sends the assembled packet

## Architecture

```
HubSpot Workflow (Program created)
  │  POST /api/referral   header: x-webhook-secret
  ▼
Vercel serverless function  (api/referral.ts)
  ├─ verify secret + parse payload      src/auth/verifyWebhook.ts
  ├─ resolve program → packet prefix    src/pandadoc/programPacketMap.ts
  ├─ search + download packet PDF       src/pandadoc/findDocument.ts, downloadPdf.ts
  ├─ text-based ROI page extraction     src/pdf/extractRoiPages.ts   (unpdf)
  ├─ merge EN + ES pages                src/pdf/mergePdfs.ts         (pdf-lib)
  └─ create from template + send        src/pandadoc/sendReferral.ts
```

### Engineering notes

- **Page selection is content-based.** Consent packets vary in length between
  programs, so ROI pages are located by matching page text (`Consent to Release
  Information` + `Statement of Consent`; `Consentimiento Para Divulgar` +
  consent body markers) rather than by hardcoded indexes.
- **`unpdf` over `pdf-parse`.** `pdf-parse` pulls in a pdf.js build that requires
  `DOMMatrix` and crashes in the Vercel serverless runtime; `unpdf` ships a
  serverless-safe build.
- **Defensive payload parsing.** HubSpot sends numeric record IDs, pipeline IDs
  rather than labels, and multi-checkbox values as either delimited strings or
  arrays. `parseReferralPayload` normalizes all three and accepts legacy key
  aliases.
- **Async PandaDoc lifecycle.** Document creation, section upload, and PDF
  download are all eventually-consistent; each is polled with bounded retries
  before the send step.

## Setup

### 1. Install

```bash
npm install
```

### 2. Environment variables

```bash
cp .env.example .env.local
```

| Variable | Required | Purpose |
|----------|----------|---------|
| `WEBHOOK_SECRET` | yes | Shared secret; HubSpot sends it as the `x-webhook-secret` header |
| `PANDADOC_API_KEY` | yes | PandaDoc API key |
| `REFERRAL_TO_EMAIL` | yes | Address that receives the assembled referral |
| `CLINICAL_REFERRAL_TEMPLATE_UUID` | yes | Clinical Referral Form template UUID in your PandaDoc workspace |
| `CLINICAL_FORM_CONTACT_EMAIL` | no | Address printed in the generated cover-page footer |
| `ORG_NAME` | no | Organization name rendered on the generated cover page |

`.env.local` is gitignored and must never be committed.

### 3. Deploy

```bash
npx vercel --prod
```

Set the same variables in your Vercel project, then point the HubSpot workflow at
`https://YOUR_PROJECT.vercel.app/api/referral`.

See [hubspot/workflow-setup.md](hubspot/workflow-setup.md) for the workflow
configuration and [hubspot/property-mapping.md](hubspot/property-mapping.md) for
the property mapping.

## Tests

```bash
npm test          # vitest
npm run typecheck # tsc --noEmit
```

## Privacy & sample data

This system processes protected client information — names, dates of birth,
addresses, and program enrollment history. Nothing of that kind is in this
repository.

- **Real consent packets are not included.** The production fixture was a signed
  multi-page intake packet belonging to the operating organization. It has been
  removed. `tests/fixtures/sample-packet.pdf` is a **synthetic three-page
  document** generated for this repository: an English ROI page, a Spanish ROI
  page, and one non-matching page that proves the extractor selects by text
  rather than by index. It contains no real client information.
- **Program identifiers are illustrative.** The pipeline IDs and program names in
  `src/pandadoc/programPacketMap.ts` are placeholder values, not the operating
  organization's real HubSpot configuration.
- **The organization logo is a placeholder.** `assets/org-logo-placeholder.png`
  stands in for the real brand mark, which is not included.
- **No credentials are present.** Every secret is read from the environment; none
  are committed, and there is no prior commit history in this repository.

## License

Published as a portfolio work sample. The integration logic is original work;
the workflow it automates was built for a nonprofit housing provider and is
reproduced here in generalized form with permission.
