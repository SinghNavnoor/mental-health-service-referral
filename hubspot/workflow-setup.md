# HubSpot Workflow Setup — Mental Health Referral

## Goal

When a **Program** record is created, HubSpot POSTs fields to the Vercel webhook. The service finds the PandaDoc consent packet, extracts EN+ES Consent to Release Information pages, and sends them to the provider via **PandaDoc email**.

## Prerequisite

Deploy the app to Vercel first and copy the URL, e.g.:

`https://YOUR_PROJECT.vercel.app/api/referral`

Also set these Vercel env vars (same as `.env.local`):

- `WEBHOOK_SECRET`
- `PANDADOC_API_KEY`
- `REFERRAL_TO_EMAIL`

---

## Steps in HubSpot

### 1. Create the workflow

1. HubSpot → **Automation** → **Workflows** → **Create workflow**
2. Choose **From scratch**
3. Object type: **Program**
4. Enrollment trigger: **Object is created** / **Record created**
5. Name it e.g. `Mental Health Service Referral`

### 2. Add a webhook action (preferred)

1. Click **+** to add an action
2. Search for **Webhook** / **Send a webhook**
3. Configure:
   - **Method:** `POST`
   - **URL:** `https://YOUR_PROJECT.vercel.app/api/referral`
   - **Authentication / Headers:** add custom header  
     - Name: `x-webhook-secret`  
     - Value: your `WEBHOOK_SECRET` (from `.env.local`)
4. **Body** → JSON:

```json
{
  "programId": "{{ hs_object_id }}",
  "programName": "{{ hs_pipeline }}",
  "clientName": "{{ hoh__program__first_name }}",
  "programStartDate": "{{ program_start_date }}",
  "age": "{{ a_hoh }}",
  "clientEmail": "{{ e_copy }}",
  "clientPhone": "{{ p_mhs }}",
  "referralType": "{{ r_t_mhs }}",
  "moveInDate": "{{ s_m_date }}",
  "anticipatedExitDate": "{{ epes_er }}",
  "familyHousingSize": "{{ tt_sz }}",
  "preferredCommunication": "{{ p_c_mhs }}",
  "initialAssessmentAreas": "{{ i_aa_mhs }}",
  "preferredServices": "{{ cps_mhs }}",
  "hubspotOwnerId": "{{ hubspot_owner_id }}"
}
```

Use HubSpot’s property picker if tokens look different in your UI — map to:

| JSON key | Program property |
|----------|------------------|
| `programId` | Record ID (`hs_object_id`) |
| `programName` | Pipeline (`hs_pipeline`) |
| `clientName` | HOH Full Name (`hoh__program__first_name`) |
| `programStartDate` | Program Start Date (`program_start_date`) |
| `age` | Age (HOH) (`a_hoh`) |
| `clientEmail` | Email Copy (MHS) (`e_copy`) |
| `clientPhone` | Phone Copy (MHS) (`p_mhs`) |
| `referralType` | Referral Type (MHS) (`r_t_mhs`) |
| `moveInDate` | Shelter Move-in Date (MHS) (`s_m_date`) |
| `anticipatedExitDate` | Estimated Program Exit Date (`epes_er`) |
| `familyHousingSize` | Total Household Size (`tt_sz`) |
| `preferredCommunication` | Client Preferred Communication (MHS) (`p_c_mhs`) |
| `initialAssessmentAreas` | Client Initial Assessment Areas (MHS) (`i_aa_mhs`) |
| `preferredServices` | Client Preferred Services (MHS) (`cps_mhs`) |
| `hubspotOwnerId` | Program owner (`hubspot_owner_id`) |

**Enrollment filter (recommended):** only enroll when Pipeline is Family Site One, Family Shelter (GEN and CE5), Coordinated Entry 6, Youth Program 1 & 2, or Youth Program A - IH. The API also skips other pipelines with HTTP 200.

5. Save the action → **Review and publish** the workflow

### 3. If you don’t see “Webhook” — use Custom Code instead

1. Add action → **Custom code**
2. Language: **Node.js**
3. Secrets (Manage secrets):
   - `REFERRAL_WEBHOOK_URL` = `https://YOUR_PROJECT.vercel.app/api/referral`
   - `WEBHOOK_SECRET` = same value as `.env.local`
4. Input fields (Property to include):
   - `programId` ← `hs_object_id`
   - `programName` ← `hs_pipeline`
   - `clientName` ← `hoh__program__first_name`
   - `programStartDate` ← `program_start_date`
5. Paste:

```javascript
const axios = require("axios");

exports.main = async (event, callback) => {
  const input = event.inputFields;
  try {
    const res = await axios.post(
      process.env.REFERRAL_WEBHOOK_URL,
      {
        programId: input.programId,
        programName: input.programName,
        clientName: input.clientName,
        programStartDate: input.programStartDate,
      },
      {
        headers: {
          "Content-Type": "application/json",
          "x-webhook-secret": process.env.WEBHOOK_SECRET,
        },
        timeout: 55000,
      }
    );
    callback({
      outputFields: {
        ok: String(res.data.ok === true),
        sentDocumentId: res.data.sentDocumentId || "",
      },
    });
  } catch (err) {
    const message = err.response?.data?.error || err.message;
    callback({
      outputFields: {
        ok: "false",
        error: message,
      },
    });
  }
};
```

6. Save → publish

### 4. Test

1. Pick a Program that already has a completed PandaDoc packet named like:  
   `{pipeline} Consent Form Packet - {Program Name} - {start date}`
2. Create a new Program (or re-enroll a test record) with matching fields
3. Check workflow history (should succeed)
4. Check `provider@example.org` for the PandaDoc email

### Expected HTTP responses

| Status | Meaning |
|--------|---------|
| 200 | Referral sent via PandaDoc |
| 401 | Wrong/missing `x-webhook-secret` |
| 400 | Missing required fields |
| 422 | No matching packet or ROI pages not found |
| 502 | PandaDoc API failure |
