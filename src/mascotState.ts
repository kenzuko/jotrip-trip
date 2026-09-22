export type MascotState =
  | "greeting"
  | "listening"
  | "thinking"
  | "speaking"
  | "guiding"
  | "compare"
  | "checking"
  | "confirm";

export const MASCOT_ASSET_LOCK_VERSION = "2026-09-22";

export const MASCOT_CANONICAL_FILES: Record<MascotState, string> = {
  greeting: "01_greeting_wave.png",
  listening: "02_listening.png",
  thinking: "03_thinking.png",
  speaking: "04_speaking.png",
  guiding: "05_guiding_map.png",
  compare: "06_compare_two_directions.png",
  checking: "07_checking_phone_review.png",
  confirm: "08_confirm_thumbs_up.png",
};

export const MASCOT_CANONICAL_SHA256: Record<MascotState, string> = {
  greeting: "96f376e65d4602a092a2954ebab7ce62bb8f9191c0afbf69b4e31465c450eb40",
  listening: "c94b5f6666028778907c8c971828a369487a7e35642d36828d6e725100e6384e",
  thinking: "0b9ed610c8751fddf0f50632b3e31c2090c0f30ee17fc8c5f73fe18b4ff72df6",
  speaking: "6cd88956b453a35199a825ffb73adbb518f72553ca1b8f4614d6f5aef145bd46",
  guiding: "9b0545482403616616e80ecacdb77730d86b6821ec8dbb36c06ca341401f9b10",
  compare: "1d3b5ea9bcd5aba10e72809d40863eac5d7a6e7b9f317b9d3f67d6c52370d89e",
  checking: "8501ef15257663c937740c46d06cac30c5fc076fd58d3ad014cbdbab5048ddc8",
  confirm: "ee6d73d07d609b303df771c1be39c83103b9bafcd50fd984a9ff2b85e7c2110c",
};

export function canonicalMascotPath(state: MascotState) {
  return `/assets/mascot-v1/${MASCOT_CANONICAL_FILES[state]}`;
}

/**
 * The semantic state resolver is independent from the actual binary asset.
 * This lets product behavior be built safely before the locked binary pack
 * is installed in the runtime repo.
 */
export function resolveMascotState(input: {
  hasResponse: boolean;
  inputFocused: boolean;
  busy: boolean;
  speaking: boolean;
  comparing: boolean;
  checking?: boolean;
  confirming?: boolean;
  guiding?: boolean;
}): MascotState {
  if (!input.hasResponse) return "greeting";
  if (input.confirming) return "confirm";
  if (input.checking) return "checking";
  if (input.busy) return "thinking";
  if (input.inputFocused) return "listening";
  if (input.comparing) return "compare";
  if (input.guiding) return "guiding";
  if (input.speaking) return "speaking";
  return "speaking";
}
