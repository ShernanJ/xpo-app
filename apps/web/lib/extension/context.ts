import { prisma } from "../db.ts";
import { StyleCardSchema, type VoiceStyleCard } from "../agent-v2/core/styleProfile.ts";
import { buildCreatorAgentContext } from "../onboarding/agentContext.ts";
import { readLatestOnboardingRunByHandle } from "../onboarding/store.ts";

export function normalizeXHandle(value: string | null | undefined): string | null {
  const normalized = value?.trim().replace(/^@+/, "").toLowerCase() || "";
  return normalized || null;
}

export async function loadExtensionUserContext(args: {
  userId: string;
  activeXHandle: string | null | undefined;
}) {
  const xHandle = normalizeXHandle(args.activeXHandle);
  if (!xHandle) {
    return {
      ok: false as const,
      status: 409,
      field: "profile",
      message: "No active X handle is connected for this token.",
    };
  }

  const storedRun = await readLatestOnboardingRunByHandle(args.userId, xHandle);
  if (!storedRun) {
    return {
      ok: false as const,
      status: 404,
      field: "profile",
      message: "No onboarding context found for the active handle.",
    };
  }

  const voiceProfile = await prisma.voiceProfile.findFirst({
    where: {
      userId: args.userId,
      xHandle,
    },
    select: {
      styleCard: true,
    },
  });

  const parsedStyleCard = voiceProfile?.styleCard
    ? StyleCardSchema.safeParse(voiceProfile.styleCard)
    : null;
  const styleCard: VoiceStyleCard | null = parsedStyleCard?.success ? parsedStyleCard.data : null;

  return {
    ok: true as const,
    xHandle,
    storedRun,
    styleCard,
    context: buildCreatorAgentContext({
      runId: storedRun.runId,
      onboarding: storedRun.result,
    }),
  };
}
