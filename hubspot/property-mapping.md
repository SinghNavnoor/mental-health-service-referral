# HubSpot Program property mapping

Updated 2026-07-28.

| Label | Internal name | Used for |
|-------|---------------|----------|
| Pipeline | `hs_pipeline` | Chooses which PandaDoc packet **prefix** to search |
| HOH - Full Name (hidden) | `hoh__program__first_name` | Client name in PandaDoc title |
| Program Start Date | `program_start_date` | Pick closest doc when multiple packets match |
| Record ID | `hs_object_id` | `programId` |

## HubSpot pipeline IDs

HubSpot sends `hs_pipeline` as a numeric ID. The service resolves IDs to labels, then to packet prefixes.

| Label | Pipeline ID |
|-------|-------------|
| Youth Program A - PH | 100000001 |
| Youth Program A - RRH | 100000002 |
| Coordinated Entry 6 | 100000003 |
| Family Shelter (GEN and CE5) | 100000004 |
| Youth Program 1 & 2 | 100000005 |
| Site Alpha | 100000006 |
| Site Beta | 100000007 |
| Youth Program A - IH | 100000008 |
| Family Site One | 100000009 |
| Health Housing Partnership | 100000010 |
| Family Housing 6 | 100000011 |
| Family Housing 8 | 100000012 |
| Family Housing 8 Prevention | 100000013 |
| Site Gamma - Youth | 100000014 |
| Site Gamma - Families | 100000015 |
| Regional RRH | 100000016 |
| Inactive/Legacy Programs | 100000017 |

Site Alpha / Site Beta / Inactive have no consent-packet mapping yet.

Full name pattern:

`{Prefix} - {hoh__program__first_name} - {DocumentCreateDate}`

Program start date is **not** expected to equal the create date in the title. When multiple docs match prefix + client, the service picks the title date **closest** to `program_start_date`.

## Webhook body mapping

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

HubSpot internal names are also accepted as aliases (e.g. `a_hoh`, `e_copy`).

## Eligible pipelines only

Service skips (HTTP 200 `skipped: true`) unless pipeline is:

| Label | ID |
|-------|-----|
| Family Site One | 100000009 |
| Family Shelter (GEN and CE5) | 100000004 |
| Coordinated Entry 6 | 100000003 |
| Youth Program 1 & 2 | 100000005 |
| Youth Program A - IH | 100000008 |

Also accepted aliases: `hoh__program__first_name`, `createdDate` / `program_start_date` for the date field.
