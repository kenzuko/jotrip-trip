# Hotel pricing engine

JoTrip does not use a fixed markup.

The goal is:

> choose the highest profitable JoTrip selling price that still remains meaningfully below a comparable market price.

## Comparable means comparable

A benchmark is valid only when it reasonably matches:

- same/equivalent room type
- same occupancy
- same stay dates
- same meal plan
- same tax/service-charge basis
- same refund/cancellation class

Member-only, app-only, flash-sale or materially different conditions may be stored as market observations but should not automatically force JoTrip to match them.

## Guardrails

The private rate has:

- effective net floor
- minimum margin VND and/or %
- public display policy
- stop-sell

Public display policy:

- SHOW
- FROM_PRICE
- QUERY_ONLY
- PACKAGE_ONLY
- PRIVATE_ONLY

PACKAGE_ONLY and PRIVATE_ONLY never produce a public room-only offer.

## Default V0 pricing

Until JoTrip sets hotel-specific rules:

- target advantage: 3% below comparable benchmark
- price rounding: 10,000 VND
- minimum margin: must be explicitly supplied by internal pricing workflow

The engine returns no offer rather than destroying margin.

## No fake urgency

Availability states must distinguish:

- confirmed unavailable
- observed unavailable at one/more sources
- demand/peak-risk signal

Never emit fake exact inventory such as “2 rooms left” without real inventory evidence.
