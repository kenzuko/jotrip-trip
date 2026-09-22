# Open Phu Quoc CMS contract

`cms.openphuquoc.com` is the public knowledge layer for JoTrip Trip.

The Trip Engine should consume public destination facts from CMS instead of duplicating them into private commercial tables.

## Expected public entities

- hotel public profile
- hotel/POI coordinates
- areas/zones
- attractions
- opening hours and schedules
- practical destination notes
- map/display content
- public operational warnings
- approved images/content references

## Not allowed in CMS contract

- hotel net/contract rate
- effective private net
- margin/markup
- supplier contract identity
- private car acquisition cost
- customer chat/PII
- private inventory notes

## Adapter principle

The Trip Engine should depend on a small stable adapter rather than CMS page HTML.

Target interface:

- `getHotelPublicProfile(hotelRef)`
- `getPlace(placeRef)`
- `getArea(areaRef)`
- `getAttraction(attractionRef)`
- `getCurrentPublicWarning(subjectRef)`

The exact CMS API paths will be bound after the CMS public API contract is finalized.
