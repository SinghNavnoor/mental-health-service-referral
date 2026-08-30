# Mental Health Service Referral — Engineering Notes

**Status:** Working end-to-end; verified against a live PandaDoc workspace.

Design decisions, constraints, and bugs worked through while building the
integration. Deployment-specific values are shown as placeholders
(`YOUR_PROJECT`, `YOUR_TEAM`) — see `.env.example` for the real variable names.

---

## What this project does

When a **HubSpot Program** record is **created**:

1. HubSpot workflow POSTs to a Vercel webhook  
2. Service **skips** unless pipeline is Family Site One, Family Shelter (GEN and CE5), Coordinated Entry 6, Youth Program 1 & 2, or Youth Program A - IH  
3. Service resolves pipeline ID → program label → PandaDoc consent packet prefix  
4. Finds the matching **completed** PandaDoc consent form packet by name  
5. If multiple packets match the same client, picks the one whose **title create-date** is closest to HubSpot **program start date**  
6. Creates PandaDoc doc from the **Clinical Referral template** (UUID from `CLINICAL_REFERRAL_TEMPLATE_UUID`), filling tokens + merge fields  
7. Extracts **English + Spanish Consent to Release Information** pages by **page text** (never fixed page numbers)  
8. Appends ROI PDF as a document section, then **sends** to the provider email  

**Not used:** Azure / Outlook / Microsoft Graph (removed). Delivery is PandaDoc-only.

---

## Architecture

```
HubSpot Workflow (Program created)
  → POST https://YOUR_PROJECT.vercel.app/api/referral
      Header: x-webhook-secret
      Body: programId, programName, clientName, programStartDate
  → Vercel serverless (api/referral.ts)
      → PandaDoc list/search + download
      → unpdf text extract + pdf-lib page split/merge
      → PandaDoc create-from-upload + send
```

---

## Environment variables

Stored in `.env.local` (gitignored) and Vercel Production + Preview.

| Variable | Required | Purpose |
|----------|----------|---------|
| `WEBHOOK_SECRET` | yes | Shared secret; HubSpot sends as header `x-webhook-secret` |
| `PANDADOC_API_KEY` | yes | PandaDoc API key (a production key is required to send to real recipients; sandbox keys fail at the send step) |
| `REFERRAL_TO_EMAIL` | yes | Address that receives the assembled referral |
| `CLINICAL_REFERRAL_TEMPLATE_UUID` | yes | Clinical Referral Form template UUID, workspace-specific |
| `CLINICAL_FORM_CONTACT_EMAIL` | no | Address printed in the generated cover-page footer |
| `ORG_NAME` | no | Organization name rendered on the generated cover page |

**Never commit real secrets.** `.env.example` holds placeholder values only; real
values live in `.env.local` (gitignored) and in the deployment platform's env settings.

After changing deployment env vars, redeploy so the new values are picked up.

---

## HubSpot workflow (configured by user)

- Object: **Program**  
- Trigger: **Record created** (new records only; not historical backfill)  
- Action: **Send a webhook**  
  - Method: `POST`  
  - URL: `https://YOUR_PROJECT.vercel.app/api/referral`  
  - Auth: API Key  
    - Secret name in HubSpot: e.g. `MH_Referral_Webhook`  
    - API key name (header): `x-webhook-secret`  
    - Location: Request header  
  - Body: **Customize request body** (not “include all”)

### Required webhook body keys

| JSON key | HubSpot property | Notes |
|----------|------------------|-------|
| `programId` | `hs_object_id` | May arrive as a **number** — code coerces to string |
| `programName` | `hs_pipeline` | Arrives as **pipeline ID**, not label — code maps ID → label |
| `clientName` | `hoh__program__first_name` | Label: “HOH - Full Name - Hidden Property Only for Automation purpose” |
| `programStartDate` | `program_start_date` | Used only for closest-date selection among duplicate packets |

Aliases still accepted in code: `hoh__program__first_name`, `createdDate` / `createDate` / `program_start_date`, `subject` (legacy client name).

Docs: `hubspot/workflow-setup.md`, `hubspot/property-mapping.md`

---

## PandaDoc document matching (current rules)

### Client name
From HubSpot `hoh__program__first_name` (full name).

### Packet title pattern
`{Packet Prefix} - {Client Name} - {DocumentCreateDate}`

Document create date in the title is **not** the same as program start date. When multiple docs match prefix + client, pick the title date **closest** to `program_start_date`.

### Pipeline ID → label → packet prefix

| Label | Pipeline ID | PandaDoc prefix |
|-------|-------------|-----------------|
| Family Housing 6 | 100000011 | `Family Housing Consent Form Packet` |
| Family Housing 8 | 100000012 | `Family Housing Consent Form Packet` |
| Family Housing 8 Prevention | 100000013 | `Family Housing Consent Form Packet` |
| Coordinated Entry 6 | 100000003 | `Crisis Housing Consent Form Packet` |
| Family Shelter (GEN and CE5) | 100000004 | `Crisis Housing Consent Form Packet` |
| Family Site One | 100000009 | `Crisis Housing Consent Form Packet` |
| Site Gamma - Youth | 100000014 | `County MH Consent Form Packet` |
| Site Gamma - Families | 100000015 | `County MH Consent Form Packet` |
| Health Housing Partnership | 100000010 | `Health Housing Consent Form` (no “Packet”) |
| Regional RRH | 100000016 | `Regional RRH Consent Form Packet` |
| Youth Program 1 & 2 | 100000005 | `Youth Consent Form Packet` |
| Youth Program A - IH | 100000008 | `Youth Consent Form Packet` |
| Youth Program A - PH | 100000001 | `Youth Demonstration Consent Form Packet` |
| Youth Program A - RRH | 100000002 | `Youth Demonstration Consent Form Packet` |
| Site Alpha | 100000006 | **No packet mapping yet** |
| Site Beta | 100000007 | **No packet mapping yet** |
| Inactive/Legacy Programs | 100000017 | **No packet mapping yet** |

Implementation: `src/pandadoc/programPacketMap.ts`

---

## ROI page extraction

- Library: `unpdf` (serverless-safe; replaced `pdf-parse` which crashed on Vercel with `DOMMatrix`)  
- English: page text includes `Consent to Release Information` + `Statement of Consent`  
- Spanish: `Consentimiento Para Divulgar` + consent body markers  
- Merge EN+ES into one PDF via `pdf-lib`, upload/send via PandaDoc  

Sample fixture: `tests/fixtures/sample-packet.pdf` (from `Panda Doc Document/`)

---

## Key source files

| Path | Role |
|------|------|
| `api/referral.ts` | Vercel webhook entry |
| `src/pipeline.ts` | End-to-end orchestration |
| `src/auth/verifyWebhook.ts` | Secret check + payload parse (number coercion) |
| `src/pandadoc/programPacketMap.ts` | Pipeline ID / label / prefix / closest date |
| `src/pandadoc/findDocument.ts` | PandaDoc search |
| `src/pandadoc/downloadPdf.ts` | Download completed/protected PDF |
| `src/pandadoc/sendReferral.ts` | Create from upload + wait draft + send |
| `src/pdf/extractRoiPages.ts` | Text-based ROI extract |
| `src/pdf/mergePdfs.ts` | Merge EN+ES PDFs |
| `plan.md` | Original implementation plan |
| `docs/superpowers/specs/2026-07-22-mental-health-referral-design.md` | Early design (Outlook path obsolete) |

---

## Bugs fixed along the way (do not regress)

1. **HubSpot “Would trigger” path preview** does not send — use webhook **Test action** or real Program create.  
2. **500 FUNCTION_INVOCATION_FAILED** — `pdf-parse` + pdfjs canvas/`DOMMatrix` on Vercel → switched to `unpdf`.  
3. **`programId` as number** — HubSpot sends numeric IDs; parser must coerce numbers to strings.  
4. **`hs_pipeline` as ID** — not label; must map pipeline IDs (e.g. `100000013` = Family Housing 8 Prevention).  
5. **Sandbox vs production PandaDoc key** — sandbox worked until send; production key required for real org docs/send.  
6. **403 outside organization** — PandaDoc blocked sending to Gmail until production key / org settings allowed the test; production send to `provider@example.org` succeeded on live test 2026-07-29.  
7. HubSpot retries failed enrollments for hours — after a fix, **re-enroll or create a new Program**; old retries may hit pre-fix deployments.

---

## Verification commands

```bash
cd /path/to/mental-health-service-referral
npm test
npm run typecheck
npx vercel whoami
npx vercel logs --project mental-health-service-referral --environment production --since 1h --limit 30 -x
npx vercel --prod --yes   # after code or env changes
```

Rotate a deployment secret with `vercel env rm` / `vercel env add`, then
redeploy so the new value is picked up.

---

## Settled product decisions

- Approach: HubSpot workflow → Vercel → PandaDoc (not HubSpot-only custom code for PDF work)  
- Email via **PandaDoc send**, not Outlook  
- Attach **both** EN and ES ROI forms  
- Find ROI by **text**, not page index  
- Client name from `hoh__program__first_name`, not `subject`  
- ~10–30 runs/month; Vercel Hobby/free is enough  
- Free Vercel is intentional for this load  

---

## Known follow-ups / open items

1. Change `REFERRAL_TO_EMAIL` from test Gmail to the real mental health provider address when ready; update `.env.local` + Vercel + redeploy.  
2. Add packet mappings for **Site Alpha**, **Site Beta** if those programs need referrals.  
3. Confirm HubSpot webhook body keys are updated to `clientName` + `programStartDate` (not old `subject`/`createdDate` only).  
4. Optional: HubSpot API lookup for pipeline labels instead of hard-coded ID map (IDs can change if pipelines are rebuilt).  
5. Design doc still mentions Outlook in places — treat `status.md` + code as source of truth.  

### Email copy (updated 2026-07-29)

- Title/subject: `Mental Health Referral – {client} – {program label}` (ID resolved via `resolveProgramLabel`)  
- Body intro + EN/ES FYI; no HubSpot Program ID; start date human-readable (UTC) from epoch ms  
- Spec: `docs/superpowers/specs/2026-07-29-referral-email-copy-design.md`  

### Clinical template + pipeline filter (2026-07-29)

- Allowlist only: Family Site One, Family Shelter (GEN and CE5), Coordinated Entry 6, Youth Program 1 & 2, Youth Program A - IH  
- Clinical form = PandaDoc template from `CLINICAL_REFERRAL_TEMPLATE_UUID` (tokens + merge fields); ROI pages appended as section  
- Env: `CLINICAL_REFERRAL_TEMPLATE_UUID` (defaults to that ID)  
- HubSpot body keys: see `hubspot/property-mapping.md` / `hubspot/workflow-setup.md`  

---
