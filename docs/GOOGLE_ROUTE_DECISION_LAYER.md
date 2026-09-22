# Google Route Decision Layer

## Why

JoTrip should not say a hotel is "near" or "far" from a guest's actual plan using rough zone intuition when a route fact can be computed.

Route time is evidence, not decoration.

Example:

> "Ở phía Bắc thì VinWonders và Safari nhẹ hơn cho cả nhà. Nhưng nếu tối hay xuống Dương Đông, phần thời gian và tiền xe cũng nên tính vào."

That sentence becomes stronger when JoTrip can show the actual driving time and distance underneath.

## Source

Use **Google Maps Platform Routes API**, server-side.

Do not scrape Google Maps pages.

Preferred locator order:

1. Google Place ID
2. exact lat/lng when access point is known
3. normalized address as temporary fallback

Place IDs can be stored as canonical locators.

## Planning vs right now

### Future trip / hotel comparison

Use:

- DRIVE
- TRAFFIC_UNAWARE
- distance
- baseline duration

Why:
- stable
- lower latency
- cheaper
- live traffic today is not useful evidence for a trip weeks later

### Right now / leaving soon

Use:

- DRIVE
- TRAFFIC_AWARE

This is for questions such as:

- "Giờ từ đây xuống Sunset Town mất bao lâu?"
- "Tối nay đi chợ đêm có xa không?"

Live traffic is relevant here.

## Cost guard

Do not query every possible hotel and every POI.

For a normal decision surface:

- max 4 candidate stays
- max 4 relevant destinations
- max 16 route-matrix elements

Only route the destinations that change the decision.

Examples:
- VinWonders
- Safari
- Hòn Thơm cable-car station
- Sunset Town
- Dương Đông / night-market center for evening behavior
- airport only when airport transfer matters

## What JoTrip says

Do not dump numbers first.

Order:

1. JoTrip's human recommendation
2. consequence of each choice
3. route facts as evidence

Example:

> "Nếu Vin với Safari là phần chính thì mình hơi nghiêng về phía Bắc. Nhưng tối nhà mình hay xuống Dương Đông thì mình tính thêm phần xe cho chắc."

Then show:

- Safari ~x phút / y km
- VinWonders ~x phút / y km
- Dương Đông ~x phút / y km

## Vehicle cost

JoTrip's vehicle price engine remains separate from Google.

Google provides:
- route distance
- route duration

JoTrip calculates:
- vehicle type
- price/km or dispatch rule
- waiting / pickup rules
- total transport implication

Google does not decide JoTrip's selling price.

## Google content policy

Google route output must not become a permanent JoTrip route database.

- route response is used for the current decision
- do not permanently persist Google route duration/distance into D1
- store Place IDs as canonical locators where useful
- route content shown to travelers carries **Google Maps** attribution
- route results shown on a map must follow Google Maps display/attribution requirements

## Current implementation

`worker/googleRoutes.ts`

- server-side only
- secret: `GOOGLE_MAPS_API_KEY`
- Compute Route Matrix
- field mask limited to the facts JoTrip needs
- no public raw proxy endpoint
- no permanent D1 write
- graceful no-key fallback

`worker/engine/buildTrip.ts`

Planning candidates can be enriched with route facts when the secret exists.

Current test targets are limited by intent:
- VinWonders
- Safari
- Hòn Thơm cable-car station
- Sunset Town
- Dương Đông center
- airport when relevant

## Product rule

A missing Google route is not zero minutes and is not evidence that a location is convenient.

No route -> JoTrip speaks qualitatively only if zone knowledge supports it, or says it still needs to check.