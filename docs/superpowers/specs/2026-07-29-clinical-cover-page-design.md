# Clinical referral cover page + pipeline filter — design (2026-07-29)

## Goal

On Program-created webhook: if pipeline is allowlisted, build a referral PDF whose **first page** is a filled Clinical Referral Form, followed by EN+ES Consent to Release pages, then send via PandaDoc.

## Pipeline allowlist

Only these programs proceed (by resolved label or HubSpot pipeline ID):

| Label | ID |
|-------|-----|
| Family Place | 100000009 |
| Family Shelter (GEN and CE5) | 100000004 |
| Coordinated Entry 6 | 100000003 |
| Youth Program 1 & 2 | 100000005 |
| Youth Program A - IH | 100000008 |

Non-matching → HTTP 200 `{ ok: true, skipped: true, reason: "pipeline_not_eligible" }` (no HubSpot retry storm).

## Cover page

- Logo: `assets/the organization-logo-no-outline.png` (embedded for Vercel)
- Title: Clinical Referral Form
- Layout mirrors PandaDoc template (two-column fields, voluntary-program note, checkboxes, staff name, footer to the partner clinical provider)
- Date field = **today** (UTC calendar day), not HubSpot date
- Staff Name = raw `hubspot_owner_id` for now (no Owners API)
- Staff email/phone omitted

## Webhook → form fields

All from Program object (aliases accept HubSpot internal names):

| Form | Keys / properties |
|------|-------------------|
| Client Name | `clientName` / `hoh__program__first_name` |
| Program | `programName` / `hs_pipeline` → label |
| Age | `age` / `a_hoh` |
| Client Email | `clientEmail` / `e_copy` |
| Client Phone | `clientPhone` / `p_mhs` |
| Referral Type | `referralType` / `r_t_mhs` |
| Move-In | `moveInDate` / `s_m_date` |
| Exit | `anticipatedExitDate` / `epes_er` |
| Household size | `familyHousingSize` / `tt_sz` |
| Preferred comm | `preferredCommunication` / `p_c_mhs` |
| Assessment areas | `initialAssessmentAreas` / `i_aa_mhs` |
| Preferred services | `preferredServices` / `cps_mhs` |
| Staff name | `hubspotOwnerId` / `hubspot_owner_id` |

Multi-selects: semicolon/comma/array → match checkbox labels (case-insensitive contains).

## Out of scope

Owner name resolution; staff email/phone; HubSpot Contact API lookup.
