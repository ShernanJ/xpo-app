import {
  SourceMaterialAssetInputSchema,
  SourceMaterialAssetPatchSchema,
  normalizeSourceMaterialInput,
  normalizeSourceMaterialPatch,
} from "../../../../../lib/agent-v2/grounding/sourceMaterials.ts";

export function getActiveHandle(session: {
  user?: {
    activeXHandle?: string | null;
  };
} | null): string | null {
  if (!session?.user?.activeXHandle || typeof session.user.activeXHandle !== "string") {
    return null;
  }

  const normalized = session.user.activeXHandle.trim().replace(/^@+/, "").toLowerCase();
  return normalized || null;
}

export function parseCreateSourceMaterialBody(body: { asset?: unknown }): {
  ok: true;
  asset: ReturnType<typeof normalizeSourceMaterialInput>;
} | {
  ok: false;
} {
  const parsed = SourceMaterialAssetInputSchema.safeParse(body.asset);
  if (!parsed.success) {
    return { ok: false };
  }

  return {
    ok: true,
    asset: normalizeSourceMaterialInput(parsed.data),
  };
}

export function parsePatchSourceMaterialBody(body: { asset?: unknown }): {
  ok: true;
  asset: ReturnType<typeof normalizeSourceMaterialPatch>;
} | {
  ok: false;
} {
  const parsed = SourceMaterialAssetPatchSchema.safeParse(body.asset);
  if (!parsed.success) {
    return { ok: false };
  }

  return {
    ok: true,
    asset: normalizeSourceMaterialPatch(parsed.data),
  };
}
