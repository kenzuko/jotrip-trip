# Free-first Route Decision Layer

## Product rule

JoTrip must be able to explain the transport consequence of a hotel or area choice without depending on a paid runtime route API.

Route time is supporting evidence. JoTrip speaks first, then shows the numbers that support the advice.

## Runtime architecture

Primary source: JoTrip D1 `travel_matrix`.

Each row stores:
- `from_ref`
- `to_ref`
- `distance_km`
- `normal_minutes`
- `source`
- `checked_at`

The trip engine reads this table directly. No third-party route API call is required while a traveler is chatting.

## How the matrix is filled

V0:
- seed only high-value Phu Quoc routes
- hotel -> VinWonders
- hotel -> Safari
- hotel -> Hon Thom cable-car station
- hotel -> Sunset Town
- hotel -> Duong Dong / night-market center
- hotel -> airport

Later:
- generate/refresh the matrix from open map data and an open-source routing engine
- prefer OpenStreetMap road data
- use OSRM / Valhalla / another open router in an offline or controlled refresh job
- do not make the customer chat path depend on a public free routing endpoint

## Why this architecture

- no paid per-request route dependency
- predictable latency
- JoTrip owns its normalized route evidence
- easy to audit when a route looks wrong
- perfect fit for Phu Quoc because the important hotel/POI graph is bounded

## Freshness

Baseline hotel/POI driving times do not need minute-by-minute refresh.

Refresh when:
- road network changes
- a hotel/attraction entrance changes
- a new major venue is added
- field feedback shows a route is wrong

## Current traffic

V0 does not promise live traffic.

If a traveler asks a right-now traffic question and JoTrip does not have a reliable live source, say that the baseline route is known but current traffic still needs checking. Never present a baseline as live traffic.

## Vehicle cost

Route data gives:
- distance
- baseline drive time

JoTrip mobility logic gives:
- vehicle type
- internal dispatch logic
- selling price
- pickup/waiting rules

These remain separate.

## Conversation pattern

> "Nếu Vin với Safari là phần chính thì mình hơi nghiêng về phía Bắc. Nhưng nếu tối nhà mình hay xuống Dương Đông thì mình tính thêm phần xe với thời gian cho chắc."

Then the interface may show:
- VinWonders ~x min / y km
- Safari ~x min / y km
- Duong Dong ~x min / y km

## Safety rule

No route row -> no numeric route claim.

Missing data is never converted to zero minutes, zero kilometers, or zero transport cost.