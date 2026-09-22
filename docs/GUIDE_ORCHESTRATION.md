# JoTrip Guide orchestration

The mascot never receives raw animation commands from AI.

The UI derives a semantic cue from the current Trip Engine state:

- target: map:north
- target: map:south
- target: dates
- target: scenario:comparison
- target: price:total
- target: warning

The rendering layer later resolves the semantic target to the current viewport/DOM anchor and chooses an actual pose:

- point_left
- point_right
- point_up
- point_down

This keeps the mascot responsive on desktop/mobile and prevents animation logic from being hallucinated by a language model.

V0 director lives in `src/guideDirector.ts`.
