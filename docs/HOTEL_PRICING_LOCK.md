# Hotel pricing lock - V0

## Goal

Hotel contract/net data is private JoTrip supply data. It must never be returned by a public endpoint, embedded in frontend bundles, committed to GitHub, or exposed through cms.openphuquoc.com.

## Temporary safe source rule

Until full market/rate-rule normalization is complete:

1. Auto-eligible hotel rate blocks must normalize to **ALL MARKET**.
2. If that block has one clearly applicable discount, the engine may calculate an **effective private net floor** from it.
3. Do not stack tactical/early-bird/member/market discounts unless the contract rule is normalized and explicitly marks them combinable.
4. Market-specific or ambiguous rows go to `REVIEW` and are not used automatically.
5. Blackout, minimum stay, occupancy, child policy, meal plan, taxes/service charge, booking window and stay window still override eligibility.

## Public price rule

The public/customer API never derives a visible price by exposing the private floor.

A public offer must be a separate derived record. It may contain only customer-facing fields such as:

- final selling price
- total/nights
- room display name
- meal plan
- cancellation summary
- availability/confirmation state
- checked-at timestamp

It must not contain:

- net/contract rate
- effective private net
- discount source/tactical code
- supplier/contract identity
- margin or acquisition cost

Until OTA benchmarking/manual selling policy is connected, a private ALL MARKET rate can be used for internal scenario feasibility but cannot automatically become a public selling rate.
