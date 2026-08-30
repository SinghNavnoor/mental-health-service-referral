# Clinical cover page + pipeline filter — implementation plan

> **For agentic workers:** TDD; one task at a time; run tests after each.

**Goal:** Allowlist pipelines; parse MHS webhook fields; generate clinical cover PDF; merge before ROI; send as today.

**Tech:** existing pdf-lib, unpdf, Vercel webhook.

## File map

| File | Responsibility |
|------|----------------|
| `src/pandadoc/programPacketMap.ts` | `isReferralEligiblePipeline()` |
| `src/types.ts` | Clinical fields on `ReferralPayload` |
| `src/auth/verifyWebhook.ts` | Parse new keys + HubSpot aliases |
| `src/pdf/orgLogoBase64.ts` | Embedded logo (generated) |
| `src/pdf/buildClinicalCoverPage.ts` | Cover PDF bytes |
| `src/pdf/checkboxMatch.ts` | Multi-select → checked set |
| `src/pipeline.ts` | Cover → merge with ROI |
| `api/referral.ts` | Skip ineligible pipelines with 200 |
| tests | Filter, parse, cover, pipeline merge order |

## Tasks

### Task 1: Pipeline allowlist
- RED/GREEN: `isReferralEligiblePipeline` for IDs/labels above; reject others
- Wire `api/referral.ts` skip response

### Task 2: Payload parse
- RED/GREEN: optional clinical fields + HubSpot internal aliases

### Task 3: Cover page PDF
- Embed logo base64
- RED/GREEN: PDF has multiple pages when merged; cover is valid PDF; text includes client/program

### Task 4: Pipeline merge
- `mergePdfs(cover, en, es)` order
- Update pipeline tests

### Task 5: Docs + deploy
- Update `hubspot/workflow-setup.md` + `property-mapping.md` + `status.md`
- `npm test` + typecheck + `npx vercel --prod --yes`
