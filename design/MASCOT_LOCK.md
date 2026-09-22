# JoTrip Guide mascot lock

The mascot is a functional UI guide, not decorative animation.

## Visual lock

- short arms
- short-sleeve shirt
- small JoTrip logo on the left chest
- preserve the JoTrip yellow/green brand
- lightweight 2D/vector-first implementation
- no heavy 3D runtime requirement

## Core states

- idle
- listening
- thinking
- speaking
- point_left
- point_right
- point_up
- point_down
- compare
- warning
- confirm

## UI behavior

The Trip Engine never tells the mascot “animate randomly”.

It sends semantic targets such as:

- `map:north_zone`
- `hotel:new_world`
- `route:vinwonders`
- `price:total`
- `warning:peak_dates`

The UI orchestrator decides where the mascot stands and which pointing pose is appropriate for the current viewport.

## Motion rule

Movement is restrained:

- gentle idle movement
- mouth movement while speaking
- point only when a visual target matters
- warning expression only for real warnings
- celebrate only for meaningful confirmations/deals

Do not keep the mascot bouncing continuously.
