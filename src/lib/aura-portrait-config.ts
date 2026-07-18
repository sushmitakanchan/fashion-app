export const DEFAULT_AURA_PORTRAIT_MODEL = "gpt-image-2";
export const AURA_PORTRAIT_MODEL_ENV = "AURA_PORTRAIT_MODEL";

type PortraitEnv = Record<string, string | undefined>;

/** The optional model override used by both portrait generation and readiness. */
export function resolveAuraPortraitModel(env: PortraitEnv): string {
  return env[AURA_PORTRAIT_MODEL_ENV]?.trim() || DEFAULT_AURA_PORTRAIT_MODEL;
}
