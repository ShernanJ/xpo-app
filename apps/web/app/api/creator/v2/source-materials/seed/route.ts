import { NextResponse } from "next/server";
import { Prisma } from "@/lib/generated/prisma/client";
import { getServerSession } from "@/lib/auth/serverSession";
import { prisma } from "@/lib/db";
import { buildCreatorAgentContext } from "@/lib/onboarding/strategy/agentContext";
import { readLatestOnboardingRunByHandle } from "@/lib/onboarding/store/onboardingRunStore";
import type { DraftGroundingSource } from "@/lib/onboarding/shared/draftArtifacts";
import {
  isMissingDraftCandidateTableError,
  isMissingSourceMaterialAssetTableError,
} from "@/lib/agent-v2/persistence/prismaGuards";
import {
  buildSeedSourceMaterialInputs,
  normalizeSourceMaterialInput,
  serializeSourceMaterialAsset,
  type SourceMaterialAssetInput,
} from "@/lib/agent-v2/grounding/sourceMaterials";
import { resolveWorkspaceHandleForRequest } from "@/lib/workspaceHandle.server";

function buildSourceMaterialIdentityKey(
  asset: Pick<SourceMaterialAssetInput, "type" | "title" | "claims" | "snippets">,
): string {
  const normalized = normalizeSourceMaterialInput({
    type: asset.type,
    title: asset.title,
    tags: [],
    verified: true,
    claims: asset.claims,
    snippets: asset.snippets,
    doNotClaim: [],
  });

  return [
    normalized.type,
    normalized.title.toLowerCase(),
    (normalized.claims[0] || normalized.snippets[0] || "").toLowerCase(),
  ].join("::");
}

export async function POST(request: Request) {
  const session = await getServerSession();
  if (!session?.user?.id) {
    return NextResponse.json(
      { ok: false, errors: [{ field: "auth", message: "Unauthorized" }] },
      { status: 401 },
    );
  }

  const workspaceHandle = await resolveWorkspaceHandleForRequest({
    request,
    session,
  });
  if (!workspaceHandle.ok) {
    return workspaceHandle.response;
  }

  const xHandle = workspaceHandle.xHandle;

  const storedRun = await readLatestOnboardingRunByHandle(session.user.id, xHandle);
  if (!storedRun) {
    return NextResponse.json(
      {
        ok: false,
        errors: [{ field: "runId", message: "No onboarding run found for this profile." }],
      },
      { status: 404 },
    );
  }

  const context = buildCreatorAgentContext({
    runId: storedRun.runId,
    onboarding: storedRun.result,
  });

  let draftCandidates: Array<{
    title: string;
    sourcePlaybook: string | null;
    artifact: unknown;
  }> = [];
  try {
    draftCandidates = await prisma.draftCandidate.findMany({
      where: {
        userId: session.user.id,
        xHandle,
      },
      select: {
        title: true,
        sourcePlaybook: true,
        artifact: true,
      },
      orderBy: { updatedAt: "desc" },
      take: 12,
    });
  } catch (error) {
    if (!isMissingDraftCandidateTableError(error)) {
      throw error;
    }
  }

  const seedInputs = buildSeedSourceMaterialInputs({
    examples: context.creatorProfile.examples,
    draftCandidates: draftCandidates.map((candidate) => ({
      title: candidate.title,
      sourcePlaybook: candidate.sourcePlaybook,
      artifact:
        candidate.artifact && typeof candidate.artifact === "object"
          ? (candidate.artifact as { groundingSources?: DraftGroundingSource[] })
          : null,
    })),
  });

  if (seedInputs.length === 0) {
    return NextResponse.json({
      ok: true,
      data: {
        assets: [],
      },
    });
  }

  let existingAssets;
  try {
    existingAssets = await prisma.sourceMaterialAsset.findMany({
      where: {
        userId: session.user.id,
        xHandle,
      },
      select: {
        id: true,
        userId: true,
        xHandle: true,
        type: true,
        title: true,
        tags: true,
        verified: true,
        claims: true,
        snippets: true,
        doNotClaim: true,
        lastUsedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  } catch (error) {
    if (isMissingSourceMaterialAssetTableError(error)) {
      return NextResponse.json(
        {
          ok: false,
          errors: [{ field: "asset", message: "Source material storage is not available yet." }],
        },
        { status: 503 },
      );
    }

    throw error;
  }

  const existingKeys = new Set(
    existingAssets.map((asset) =>
      buildSourceMaterialIdentityKey({
        type: asset.type,
        title: asset.title,
        claims: Array.isArray(asset.claims) ? (asset.claims as string[]) : [],
        snippets: Array.isArray(asset.snippets) ? (asset.snippets as string[]) : [],
      }),
    ),
  );

  const createdAssets = [];
  for (const input of seedInputs) {
    const key = buildSourceMaterialIdentityKey(input);
    if (existingKeys.has(key)) {
      continue;
    }

    existingKeys.add(key);
    const created = await prisma.sourceMaterialAsset.create({
      data: {
        userId: session.user.id,
        xHandle,
        type: input.type,
        title: input.title,
        tags: input.tags as unknown as Prisma.InputJsonValue,
        verified: input.verified,
        claims: input.claims as unknown as Prisma.InputJsonValue,
        snippets: input.snippets as unknown as Prisma.InputJsonValue,
        doNotClaim: input.doNotClaim as unknown as Prisma.InputJsonValue,
      },
    });
    createdAssets.push(serializeSourceMaterialAsset(created));
  }

  return NextResponse.json({
    ok: true,
    data: {
      assets: createdAssets,
    },
  });
}
