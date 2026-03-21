import type { Persona } from "../../generated/prisma/client";
import type { VoiceStyleCard } from "./styleProfile";

export interface VoiceProfileContext {
  id: string | null;
  primaryPersona: Persona | null;
  styleCard: VoiceStyleCard | null;
  goldenExampleCount: number;
}

export function createEmptyVoiceProfileContext(
  overrides?: Partial<VoiceProfileContext>,
): VoiceProfileContext {
  return {
    id: null,
    primaryPersona: null,
    styleCard: null,
    goldenExampleCount: 0,
    ...overrides,
  };
}
