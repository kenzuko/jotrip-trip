# JoTrip Mascot Asset Lock

**Locked:** 2026-09-22  
**Status:** CANONICAL - DO NOT REGENERATE

The approved mascot pack is the only canonical visual source for JoTrip AI / JoTrip Trip.

## Rule

If a required state already exists in this pack, reuse the exact asset.

Do **not** regenerate, redraw, substitute or reinterpret the mascot because an asset is missing from the repo, a previous chat is unavailable, or a new UI state is being implemented.

If the binary asset is not available in the runtime repo yet, stop at the asset boundary. Do not silently fall back to another mascot identity.

## Character DNA

- semi-real stylized adult Vietnamese local guide
- Vietnamese conical hat
- black rectangular glasses
- white JoTrip polo
- green/yellow trim
- black backpack
- khaki cargo pants
- white/green sneakers
- transparent background
- friendly, adult, trustworthy
- less anime than the old mascot

## State map

| State | Canonical file | Product use |
| --- | --- | --- |
| greeting | `01_greeting_wave.png` | first entry / welcome |
| listening | `02_listening.png` | input focused / user speaking |
| thinking | `03_thinking.png` | engine working / reasoning |
| speaking | `04_speaking.png` | main advice / explanation |
| guiding | `05_guiding_map.png` | map / route / POI guidance |
| compare | `06_compare_two_directions.png` | two-direction / scenario comparison |
| checking | `07_checking_phone_review.png` | checking current data / reviews |
| confirm | `08_confirm_thumbs_up.png` | selection / confirmation / handoff |

## SHA-256 lock

```
96f376e65d4602a092a2954ebab7ce62bb8f9191c0afbf69b4e31465c450eb40  01_greeting_wave.png
c94b5f6666028778907c8c971828a369487a7e35642d36828d6e725100e6384e  02_listening.png
0b9ed610c8751fddf0f50632b3e31c2090c0f30ee17fc8c5f73fe18b4ff72df6  03_thinking.png
6cd88956b453a35199a825ffb73adbb518f72553ca1b8f4614d6f5aef145bd46  04_speaking.png
9b0545482403616616e80ecacdb77730d86b6821ec8dbb36c06ca341401f9b10  05_guiding_map.png
1d3b5ea9bcd5aba10e72809d40863eac5d7a6e7b9f317b9d3f67d6c52370d89e  06_compare_two_directions.png
8501ef15257663c937740c46d06cac30c5fc076fd58d3ad014cbdbab5048ddc8  07_checking_phone_review.png
ee6d73d07d609b303df771c1be39c83103b9bafcd50fd984a9ff2b85e7c2110c  08_confirm_thumbs_up.png
```

## Source pack

Canonical archive name:

`JOTRIP_MASCOT_STATE_PACK_LOCKED_2026-09-22.zip`

The archive is retained outside the runtime repo until its binary assets are intentionally copied into `public/assets/mascot-v1/`.

## Runtime target paths

When binaries are installed, use exactly:

```
public/assets/mascot-v1/01_greeting_wave.png
public/assets/mascot-v1/02_listening.png
public/assets/mascot-v1/03_thinking.png
public/assets/mascot-v1/04_speaking.png
public/assets/mascot-v1/05_guiding_map.png
public/assets/mascot-v1/06_compare_two_directions.png
public/assets/mascot-v1/07_checking_phone_review.png
public/assets/mascot-v1/08_confirm_thumbs_up.png
```

No legacy mascot image should be renamed into one of these paths.
