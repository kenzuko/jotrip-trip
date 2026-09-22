# Data boundary

## Public / CMS-facing

Can be sourced from `cms.openphuquoc.com`:

- Hotel descriptive content
- Areas and POIs
- Coordinates approved for public use
- Attraction descriptions and schedules
- Public ticket prices and effective dates
- Opening hours
- Destination warnings and travel knowledge

## Private JoTrip Core

Must never be exposed by the public CMS, frontend bundle, or committed to this repository:

- Hotel net / contracted rates
- ALL MARKET source rate blocks and discount math
- Supplier contracts and tactical codes
- Margin and markup rules
- Private vehicle acquisition cost
- Supplier identities where confidential
- Internal availability and operational notes
- Customer personal data

## API rule

Public responses may return the final selling offer and its customer-facing conditions. They must not return internal net, effective net, discount source, margin, supplier cost, or contract metadata.

Private ingestion/admin endpoints must require server-side authorization and must never be callable with a credential embedded in browser JavaScript.
