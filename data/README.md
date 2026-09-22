# Data

Only public/non-sensitive seed data belongs in this folder.

Hotel contract spreadsheets, net rates, discounts, tactical rules, supplier information and private operational data must never be committed here.

## Route data

`route-points-v0.json` contains canonical route anchors for the free-first OSM/OSRM route layer.

Rules:
- numeric km/minute claims require exact resolved coordinates
- hotel/attraction entrance coordinates are preferred over broad area centroids
- unresolved coordinates stay null and are skipped
- do not silently substitute a zone centroid just to make routing work

