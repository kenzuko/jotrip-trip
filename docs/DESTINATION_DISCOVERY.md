# Destination Discovery

JoTrip should not stop at hotel + car + ticket.

Once an area/hotel is under consideration, the engine should answer four traveler questions:

1. **Ăn gì?** - local dishes and useful food context
2. **Ăn ở đâu?** - verified food venues/restaurants nearby
3. **Cà phê ở đâu?** - current cafe venues
4. **Ở đây có gì để làm?** - attractions, places, local life, shows and useful stops

## Two-layer model

### Knowledge layer - relatively stable

Source: Open Phu Quoc knowledge/CMS.

Examples:
- bún quậy
- gỏi cá trích
- Chợ Dương Đông ăn gì
- Ẩm thực An Thới
- Dinh Cậu
- Bãi Sao
- Sunset Town
- Hòn Thơm

This layer explains **what** is worth eating/doing and why.

### Venue layer - changes faster

Examples:
- restaurant
- local food shop
- cafe
- attraction entrance / venue

Every venue should carry:

- canonical id
- category
- zone
- coordinates when verified
- address
- current/known opening-hours data
- price level when known
- source + verification date
- ACTIVE / CLOSED / REVIEW

This layer answers **where exactly**.

## Ranking principles

Do not rank by popularity alone.

Context matters:

- current hotel/area
- route direction for the day
- travel time
- daypart
- family/children
- budget
- dietary/allergy constraints
- opening hours/freshness
- whether the venue has been verified recently

A viral cafe 45 minutes in the opposite direction should not beat a strong nearby option for a short trip.

## Honesty rules

- No coordinates -> do not invent distance.
- Old opening hours -> do not claim “open now”.
- Directory-only venue -> can be discovered, but do not label it JoTrip recommended until verified.
- Venue closed/uncertain -> never keep it silently in the recommendation set.
- Food knowledge may be useful even when no specific venue has passed verification.

## Current V0

`data/destination-knowledge-v0.json` is synced from the Open Phu Quoc knowledge dataset.

Venue data enters through the private endpoint:

`POST /api/internal/destination/venues/import`

Public contextual lookup:

`POST /api/destination/context`

The engine can already return knowledge for eat/do by zone. Cafe/restaurant venue lists become live as soon as verified venues are synced into D1.
