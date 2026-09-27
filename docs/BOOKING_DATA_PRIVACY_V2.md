# JoTrip Living Trip V2 - booking data boundary (draft)

Status: engineering handoff, **not a published privacy notice or legal review**. The owner supplied an interim privacy contact for operations; JoTrip is used as the service brand, not represented as a legal entity. No remote database migration, preview deployment or production changes are authorized by this document.

## Two independent records

| Record | Data | Purpose | Deletion |
|---|---|---|---|
| Anonymous trip/chat V2 | Server-owned trip context, recent conversation turns and evidence canvas | Resume and adjust the travel plan | Self-service deletion or configured 90-day inactivity cleanup |
| Separately consented booking lead | Contact, contact channel, optional short note, minimal server-owned trip summary, consent version and time | JoTrip staff check rooms, tickets and transport, then contact traveler | Staff-only deletion after verifying the customer request through the existing contact channel |

**Deleting chat does not delete a separately consented booking request.** The UI says so before contact submission and on the chat deletion confirmation.

## Minimal lead handoff

The browser sends `sessionId`, a stable client-generated lead UUID, the trip ID/version currently displayed, contact and an explicit consent flag. A stale tab receives HTTP 409 instead of silently sending the newest trip from another tab. A lost-response retry reuses the same lead UUID, so it cannot create a duplicate request. The Worker reads the authoritative session and creates a short allowlisted summary: trip ID, language, adults/children, duration, saved dates, recognized interests and area. The D1 insert rechecks the trip ID/version atomically and records that version in the minimal handoff. It never accepts the browser's raw transcript, hotel quotes, private supplier rates or full plan object as booking context. An optional note is capped at 300 characters. The summary is **not** a confirmed booking or supplier availability.

`booking_lead_consents_v2` records the consent version `booking_contact_v2_2026-09-26` and timestamp in the same D1 transaction as the lead. The lead itself stays in the existing `booking_leads` schema for compatibility.

## Staff-verified deletion

`POST /api/internal/booking-lead/erase` requires a separate server-only `LEAD_ADMIN_TOKEN`, a lead UUID and a reason (`verified_customer_request` or `operational_cleanup`). It deletes the lead and its consent record, then keeps an audit containing only the erased lead ID, reason and time. It does not expose the contact in its response and cannot be called with the read-only analytics token or an anonymous session ID.

The staff workflow must verify identity through the customer's existing channel **before** invoking erasure. There is intentionally no anonymous delete-by-contact endpoint, since it would permit other people to erase someone else's request. The audit also prevents a delayed retry from recreating an erased lead. It stores only the lead ID, reason and timestamp; erase and automatic-retention tombstones expire after 180 days.

## Approved retention policy

These windows apply to the D1 booking-lead copy and are separate from the 90-day inactive chat/session cleanup.

| Record state | Retention |
|---|---|
| Open or unresponsive lead | Delete lead, contact, trip summary and consent 90 days after the last human contact. Submission time is the initial contact timestamp; staff record later contact through the internal lifecycle endpoint. |
| Fulfilled lead | Delete lead, contact, trip summary and consent 30 days after the trip is completed. Staff mark completion only after the trip ends. |
| Withdrawal or verified erasure | Delete lead and consent immediately. Keep a contact-free lead-ID audit tombstone for 180 days, then remove it. Identity is verified through the existing customer channel before staff invoke erasure. |
| Encrypted full D1 backup | Keep only until migration and restore have been verified; rotate or delete it within 90 days after verification. The restore was verified on 2026-09-26, so the current backup is due for rotation or deletion by 2026-12-25. |

The Worker lifecycle endpoint is staff-only and requires the separate `LEAD_ADMIN_TOKEN`. `record_contact` updates the contact timestamp, `mark_unresponsive` changes state without resetting the clock, and `mark_fulfilled` records the actual completion time. Daily cleanup purges expired D1 lead and consent rows and removes expired tombstones. CRM exports and backup copies need the same deletion request handled in their own systems.

## Interim privacy contact for operations

The owner supplied these customer-facing channels on 27 September 2026:

- Email: [phuquoclux@gmail.com](mailto:phuquoclux@gmail.com)
- Phone: [+84 817 060 066](tel:+84817060066)

The booking form displays them under the JoTrip service brand for questions or requests about a submitted booking lead. JoTrip is the brand label only; this document does not invent or claim a registered legal entity. Staff must verify a request before erasing a lead. The full public privacy notice and legal controller identity still need review before public launch.

## Remaining decisions before public launch

- Confirm the legal entity/controller responsible for this service and complete a reviewed public privacy notice. The interim contact channel above is supplied; it does not replace the entity identity or legal review.
- Define access control for staff viewing contacts and any existing CRM export. This endpoint handles the D1 copy only; external copies require their own deletion workflow.
- Review applicable legal obligations with qualified local advice. This engineering document makes no claim of regulatory compliance.
- Before any production migration, reconcile the migration ledger against the reviewed schema and confirm owner custody of the recovery key. The verified full backup and restore checkpoint is recorded in the PR discussion; no production migration or Worker deployment is performed by this PR.
- Set `LEAD_ADMIN_TOKEN` as a Cloudflare secret, never a repository variable. Keep it separate from `INTERNAL_API_TOKEN`.


## Test scope

`tests/booking-lead.test.mjs` covers explicit consent, server-owned data minimization, stale-tab races, duplicate network retries, erased-lead replay, lifecycle authorization/transitions and scheduled expiry. The CI workflow exercises migrations 0009, 0010 and 0011, a real D1 version-locked insert and SQL lead/consent/erasure/retention lifecycle against **local D1 only**. A second local D1 run checks compatibility with the old runtime-created table. Neither test validates the real remote D1 schema or backups.
