# Private hotel import workflow

The source workbooks remain outside Git.

## V0 workflow

1. Read only Phu Quoc hotel sheets/candidates.
2. Detect market scope, stay/booking windows, room names, meal plan, occupancy and numeric rate cells.
3. Auto-accept only clearly normalized **ALL MARKET** source blocks.
4. Allow one clearly applicable discount to derive an internal effective net floor.
5. Send ambiguous market / stacking / blackout / tactical / package-only cases to REVIEW.
6. Import normalized rows through a private authenticated endpoint.
7. Never publish import rows directly. Public offers are separate derived records.

## Safety

Never commit generated private JSON/CSV to Git. Output private normalization files only under:

- `private-data/`
- `imports/private/`

Both paths are ignored.

## Contract logic still overrides

An ALL MARKET marker does not by itself make a rate valid. The importer and pricing engine must still respect:

- stay window
- booking window
- blackout
- minimum stay
- room/occupancy
- child policy
- meal plan
- taxes/service charge
- public-display restriction
- stop sale / on request
