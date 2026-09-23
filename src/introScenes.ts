/** A data-driven scene library. Extend ids and add one matching SVG/CSS rule. */
export const INTRO_SCENES = ["warm", "future", "editorial"] as const;
export type IntroSceneId = (typeof INTRO_SCENES)[number];

export const INTRO_SCENE_META: Record<IntroSceneId, { title: string; background: string }> = {
  warm: { title: "Hoàng hôn trên đảo", background: "/assets/warm-island-scene.svg" },
  future: { title: "Chân trời thông minh", background: "/assets/intro-ai-horizon.svg" },
  editorial: { title: "Bản sắc Phú Quốc", background: "/assets/intro-editorial-coast.svg" },
};

const SESSION_KEY = "jotrip.intro.scene.v1";
const CYCLE_KEY = "jotrip.intro.cycle.v1";
const isScene = (value: string | null): value is IntroSceneId =>
  INTRO_SCENES.some((scene) => scene === value);

/**
 * iPhone only. First new session = existing approved Warm Island intro.
 * A NEW browser session visits the next scene; refresh/focus/chat keep one scene.
 * Query ?intro=warm|future|editorial previews a scene without changing rotation.
 * Restricted/private storage gracefully falls back to Warm Island.
 */
export function resolveIntroScene(): IntroSceneId {
  if (typeof window === "undefined" || !window.matchMedia("(max-width: 560px)").matches) {
    return "warm";
  }
  const forced = new URLSearchParams(window.location.search).get("intro");
  if (isScene(forced)) return forced;

  try {
    const existing = window.sessionStorage.getItem(SESSION_KEY);
    if (isScene(existing)) return existing;

    const previousText = window.localStorage.getItem(CYCLE_KEY);
    const previous = previousText === null ? -1 : Number(previousText);
    const next = Number.isSafeInteger(previous) && previous >= -1
      ? (previous + 1) % INTRO_SCENES.length
      : 0;
    const scene = INTRO_SCENES[next];
    window.sessionStorage.setItem(SESSION_KEY, scene);
    window.localStorage.setItem(CYCLE_KEY, String(next));
    return scene;
  } catch {
    return "warm";
  }
}
