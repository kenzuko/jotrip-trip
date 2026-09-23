# Locked JoTrip mascot HD assets - release gate

Approved source: `JOTRIP_MASCOT_STATE_PACK_LOCKED_2026-09-22.zip`.
The original logo and all eight mascot poses remain unchanged. All derivative SHA-256 values are locked in `public/assets/mascot-v1/manifest.json`.

## What changed

The original 100x125 WebP files blur when enlarged on iPhones. Eight approved 720x900 WebP derivatives were mechanically resized from the SHA-256 verified original PNGs, without regeneration or redraw.

The app now references `*_hd.webp`. The first screen preloads four relevant poses; other poses load when needed.

## One-ZIP installation

Upload **one** file, `JoTrip_Mascot_HD_8_States_2026-09-23.zip`, to the **root of this pull-request branch** (`fix/mascot-hd-remaining-states`). Do not extract it manually. The archive is included in the handoff package.

The repo's `predev` and `prebuild` scripts run `tools/prepare-mascot-hd.mjs`, which:
1. Finds the approved ZIP in the repository root.
2. Extracts only the eight named `*_hd.webp` assets to `public/assets/mascot-v1/`.
3. Requires exactly the approved SHA-256 hashes, expected byte sizes, valid WebP format and dimensions 720x900.
4. Fails the build when the ZIP or any required asset is missing or altered.

Vite copies the verified assets into `dist/assets/mascot-v1/` during `npm run build`. No native unzip or Pillow is needed in the Cloudflare build environment.

**Do not merge or deploy this branch until the ZIP is committed and the asset verification + build pass.** The canonical greeting PNG and older WebP files remain unchanged for rollback. Do not replace the approved logo, repaint the mascot, or publish without all eight poses.

To regenerate the ZIP from original PNGs in the future, use the accompanying `install_mascot_hd.py` in the original approved handoff package with Pillow and reverify all checksums.
