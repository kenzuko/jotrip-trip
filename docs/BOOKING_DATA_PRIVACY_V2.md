# JoTrip Living Trip V2 - booking data boundary (draft)

Status: engineering handoff, **not a published privacy notice or legal review**. No remote database migration, preview deployment or production changes are authorized by this document.

## Two independent records

| Record | Data | Purpose | Deletion |
|---|---|---|---|
| Anonymous trip/chat V2 | Server-owned trip context, recent conversation turns and evidence canvas | Resume and adjust the travel plan | Self-service deletion or configured 90-day inactivity cleanup |
| Separately consented booking lead | Contact, contact channel, optional short note, minimal server-owned trip summary, consent version and time | JoTrip staff check rooms, tickets and transport, then contact traveler | Staff-only deletion after verifying the customer request through the existing contact channel |

**Deleting chat does not delete a separately consented booking request.** The UI says so before contact submission and on the chat deletion confirmation.

## Minimal lead handoff

The browser sends `sessionId`, contact and an explicit consent flag. The Worker reads the authoritative session and creates a short allowlisted summary: trip ID, language, adults/children, duration, saved dates, recognized interests and area. It never accepts the browser's raw transcript, hotel quotes, private supplier rates or full plan object as booking context. An optional note is capped at 300 characters. The summary is **not** a confirmed booking or supplier availability.

`booking_lead_consents_v2` records the consent version `booking_contact_v2_2026-09-26` and timestamp in the same D1 transaction as the lead. The lead itself stays in the existing `booking_leads` schema for compatibility.

## Staff-verified deletion

`POST /api/internal/booking-lead/erase` requires a separate server-only `LEAD_ADMIN_TOKEN`, a lead UUID and a reason (`verified_customer_request` or `operational_cleanup`). It deletes the lead and its consent record, then keeps an audit containing only the erased lead ID, reason and time. It does not expose the contact in its response and cannot be called with the read-only analytics token or an anonymous session ID.

The staff workflow must verify identity through the customer's existing channel **before** invoking erasure. There is intentionally no anonymous delete-by-contact endpoint, since it would permit other people to erase someone else's request. The audit itself needs a separately reviewed retention policy.

## Unresolved decisions before public launch

- Confirm the public-facing business name, privacy contact channel and wording in every supported language.
- Approve the retention period for **open**, **fulfilled**, **withdrawn** and **unresponsive** booking requests. The 90-day chat rule does not apply to leads; there is **no automatic lead purge** until an operator-approved policy exists.
- Define access control for staff viewing contacts, request verification and any existing CRM export or backup. This endpoint handles the D1 copy only; external copies require their own deletion workflow.
- Review any applicable legal obligations with qualified local advice. This engineering document makes no claim of regulatory compliance.
- Verify remote D1 schema and back up data before applying additive migration `0010_booking_lead_privacy.sql`. The legacy Worker previously created `booking_leads` at runtime; migration 0010 formalizes that schema and adds the consent and erasure-audit tables.
- Set `LEAD_ADMIN_TOKEN` as a Cloudflare secret, never a repository variable. Keep it separate from `INTERNAL_API_TOKEN`. Test access and rollback in preview first.

## Test scope

`tests/booking-lead.test.mjs` covers explicit consent, server-owned data minimization, deleted/unknown sessions and separate staff authorization. The CI workflow exercises migrations 0009 and 0010 and SQL lead/consent/erasure lifecycle against **local D1 only**. A second local D1 run checks compatibility with the old runtime-created table. Neither test validates the real remote D1 schema or backups.
