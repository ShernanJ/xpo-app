import { prisma } from "../db.ts";
import { StyleCardSchema, type VoiceStyleCard } from "../agent-v2/core/styleProfile.ts";
import { buildCreatorAgentContext } from "../onboarding/strategy/agentContext.ts";
import { readLatestOnboardingRunByHandle } from "../onboarding/store/onboardingRunStore.ts";
import { resolveExtensionHandleAccess } from "./handles.ts";

export async function loadExtensionUserContext(args: {
  userId: string;
  requestedHandle: string | null | undefined;
  attachedHandles?: string[];
}) {
  const handleResolution = await resolveExtensionHandleAccess({
    userId: args.userId,
    requestedHandle: args.requestedHandle,
    attachedHandles: args.attachedHandles,
  });
  if (!handleResolution.ok) {
    return handleResolution;
  }
  const xHandle = handleResolution.xHandle;

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
    attachedHandles: handleResolution.attachedHandles,
    storedRun,
    styleCard,
    context: buildCreatorAgentContext({
      runId: storedRun.runId,
      onboarding: storedRun.result,
    }),
  };
}
