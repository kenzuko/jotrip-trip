# Locked mascot HD pack - deployment gate

Source archive: `JOTRIP_MASCOT_STATE_PACK_LOCKED_2026-09-22.zip`.
All eight original PNG SHA-256 values are locked in `src/mascotState.ts`.

## The 100 x 125 px image problem

The old WebP derivatives are only 100 x 125 pixels, so they blur when expanded on an iPhone. The approved PNGs are 1122 x 1402. The 8 HD files included in `JoTrip_Mascot_HD_8_States_2026-09-23.zip` are mechanically resized from the originals at 720 x 900, WebP quality 78. No images have been redrawn.

## Release requirements

Place **all eight** `*_hd.webp` files from that archive into `public/assets/mascot-v1/` on the same feature branch as the code change. The sha256 of each file must equal the matching entry in `manifest.json > hd_derivatives.files`.

**Do not merge or deploy this branch until all 8 files have been committed.** Existing original PNG and older low-resolution WebP assets remain unchanged for rollback.

The first screen now preloads only four likely states; the other four load on demand. The main greeting changes to the 720px derivative so the iPhone no longer downloads the 1.1 MB original PNG on every visit.

To regenerate in future, run `python install_mascot_hd.py SOURCE_ZIP --out public/assets/mascot-v1` from the accompanying asset package after installing Pillow.
