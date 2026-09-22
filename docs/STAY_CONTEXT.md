# Stay Context

A hotel is not only a room price and distance to one attraction.

JoTrip evaluates the area around a stay across:

- food
- cafe
- evening activity
- walkability
- quiet
- local life
- family convenience
- airport convenience

## V0 evidence model

Two evidence levels are deliberately separated.

### zone_baseline

A broad, human-reviewed description of an area. It is useful before venue data is complete, but it must not be presented as exact venue counts.

### venue_enriched

The zone also has verified active venue records in D1. This raises confidence for the relevant dimension.

## No fake precision

The guest sees qualitative signals:

- strong
- moderate
- limited

The internal engine maps these to an ordinal fit score only for comparing scenarios against the traveler's stated preferences.

It must never say “there are 12 cafes nearby” unless verified venue data actually supports that count.

## Future upgrade

When Open Phu Quoc/CMS has enough venue data, Stay Context should become more granular:

- hotel-coordinate radius
- walking time
- actual opening hours by daypart
- verified venue freshness
- dietary tags
- family suitability
- late-night availability
- rainy-day usefulness
