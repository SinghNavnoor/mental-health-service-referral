# Referral email copy — design (2026-07-29)

## Problem

PandaDoc notification used raw HubSpot values: pipeline ID in title/body and epoch ms for program start date. Also included HubSpot Program ID and lacked EN/ES guidance.

## Decision

When creating/sending the referral document:

1. **Title/subject:** `Mental Health Referral – {clientName} – {programLabel}` where `programLabel = resolveProgramLabel(programName)`.
2. **Body intro:** `Hi, we are sharing a new mental health referral for the following client.`
3. **Fields:** Pipeline / program (label), Client, Program start date (human-readable). Omit HubSpot Program ID.
4. **FYI:** Explain two Consent to Release Information forms (EN + ES); client signed one; disregard the other.
5. **Footer line:** Keep attached-document note.

**Date display:** format HubSpot epoch ms (and already-parseable strings) as e.g. `Jul 28, 2026` via existing `parseFlexibleDate` + UTC locale formatting.

## Out of scope

Recipient email change; new program packet mappings.
