import { z } from "zod";

import {
  collectGroundingFactualAuthority,
  sanitizeGroundingSourceMaterials,
  type GroundingPacket,
} from "./groundingPacket.ts";
import {
  dedupeList,
  looksAutobiographical,
  normalizeLine,
  normalizeTag,
  SourceMaterialTypeSchema,
  type SourceMaterialType,
} from "./sourceMaterialShared.ts";
export { selectRelevantSourceMaterials } from "./sourceMaterialSelection.ts";

export const SourceMaterialAssetInputSchema = z.object({
  type: SourceMaterialTypeSchema,
  title: z.string().trim().min(3).max(160),
  tags: z.array(z.string()).default([]),
  verified: z.boolean().default(false),
  claims: z.array(z.string()).default([]),
  snippets: z.array(z.string()).default([]),
  doNotClaim: z.array(z.string()).default([]),
});

export const SourceMaterialAssetPatchSchema = z.object({
  type: SourceMaterialTypeSchema.optional(),
  title: z.string().trim().min(3).max(160).optional(),
  tags: z.array(z.string()).optional(),
  verified: z.boolean().optional(),
  claims: z.array(z.string()).optional(),
  snippets: z.array(z.string()).optional(),
  doNotClaim: z.array(z.string()).optional(),
}).refine((value) => Object.keys(value).length > 0, {
  message: "At least one field must be provided.",
});

export type SourceMaterialAssetInput = z.infer<typeof SourceMaterialAssetInputSchema>;
export type SourceMaterialAssetPatch = z.infer<typeof SourceMaterialAssetPatchSchema>;

export interface SourceMaterialAssetRecord extends SourceMaterialAssetInput {
  id: string;
  userId: string;
  xHandle: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export function buildSourceMaterialIdentityKey(
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

export function filterNewSourceMaterialInputs(args: {
  existing: Array<Pick<SourceMaterialAssetInput, "type" | "title" | "claims" | "snippets">>;
  incoming: SourceMaterialAssetInput[];
}): SourceMaterialAssetInput[] {
  const seen = new Set(args.existing.map((asset) => buildSourceMaterialIdentityKey(asset)));

  return args.incoming.filter((asset) => {
    const key = buildSourceMaterialIdentityKey(asset);
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}


export function normalizeSourceMaterialInput(
  value: SourceMaterialAssetInput,
): SourceMaterialAssetInput {
  return {
    type: value.type,
    title: normalizeLine(value.title),
    tags: dedupeList(value.tags || []).map(normalizeTag),
    verified: value.verified === true,
    claims: dedupeList(value.claims || []),
    snippets: dedupeList(value.snippets || []),
    doNotClaim: dedupeList(value.doNotClaim || []),
  };
}

export function normalizeSourceMaterialPatch(
  value: SourceMaterialAssetPatch,
): SourceMaterialAssetPatch {
  const next: SourceMaterialAssetPatch = {};

  if (value.type) {
    next.type = value.type;
  }
  if (typeof value.title === "string") {
    next.title = normalizeLine(value.title);
  }
  if (value.tags) {
    next.tags = dedupeList(value.tags).map(normalizeTag);
  }
  if (typeof value.verified === "boolean") {
    next.verified = value.verified;
  }
  if (value.claims) {
    next.claims = dedupeList(value.claims);
  }
  if (value.snippets) {
    next.snippets = dedupeList(value.snippets);
  }
  if (value.doNotClaim) {
    next.doNotClaim = dedupeList(value.doNotClaim);
  }

  return next;
}

export function serializeSourceMaterialAsset(asset: {
  id: string;
  userId: string;
  xHandle: string | null;
  type: SourceMaterialType;
  title: string;
  tags: unknown;
  verified: boolean;
  claims: unknown;
  snippets: unknown;
  doNotClaim: unknown;
  lastUsedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): SourceMaterialAssetRecord {
  const parsed = normalizeSourceMaterialInput(
    SourceMaterialAssetInputSchema.parse({
      type: asset.type,
      title: asset.title,
      tags: asset.tags,
      verified: asset.verified,
      claims: asset.claims,
      snippets: asset.snippets,
      doNotClaim: asset.doNotClaim,
    }),
  );

  return {
    id: asset.id,
    userId: asset.userId,
    xHandle: asset.xHandle || null,
    type: parsed.type,
    title: parsed.title,
    tags: parsed.tags,
    verified: parsed.verified,
    claims: parsed.claims,
    snippets: parsed.snippets,
    doNotClaim: parsed.doNotClaim,
    lastUsedAt: asset.lastUsedAt?.toISOString() || null,
    createdAt: asset.createdAt.toISOString(),
    updatedAt: asset.updatedAt.toISOString(),
  };
}

export function mergeSourceMaterialsIntoGroundingPacket(args: {
  groundingPacket: GroundingPacket;
  sourceMaterials: SourceMaterialAssetRecord[];
}): GroundingPacket {
  const sanitizedSourceMaterials = sanitizeGroundingSourceMaterials(
    args.sourceMaterials,
    args.groundingPacket.forbiddenClaims,
  );

  if (sanitizedSourceMaterials.length === 0) {
    return args.groundingPacket;
  }

  const addedClaims = dedupeList(
    sanitizedSourceMaterials.flatMap((asset) => asset.claims),
  );
  const addedAutobiographicalClaims = addedClaims.filter(looksAutobiographical);
  const addedNumbers = dedupeList(
    addedClaims.flatMap((claim) => claim.match(/\b\d[\d,./%]*\b/g) || []),
  );
  const addedForbiddenClaims = dedupeList(
    sanitizedSourceMaterials.flatMap((asset) => asset.doNotClaim),
  );
  const existingSourceMaterialKeys = new Set(
    args.groundingPacket.sourceMaterials.map((asset) => `${asset.type}:${asset.title}`.toLowerCase()),
  );
  const mergedSourceMaterials = sanitizedSourceMaterials
    .filter((asset) => {
      const key = `${asset.type}:${asset.title}`.toLowerCase();
      if (existingSourceMaterialKeys.has(key)) {
        return false;
      }

      existingSourceMaterialKeys.add(key);
      return true;
    })
    .map((asset) => ({
      type: asset.type,
      title: asset.title,
      claims: asset.claims,
      snippets: asset.snippets,
    }));

  const nextPacket = {
    ...args.groundingPacket,
    durableFacts: dedupeList([
      ...args.groundingPacket.durableFacts,
      ...addedClaims,
    ]),
    allowedFirstPersonClaims: dedupeList([
      ...args.groundingPacket.allowedFirstPersonClaims,
      ...addedAutobiographicalClaims,
    ]),
    allowedNumbers: dedupeList([
      ...args.groundingPacket.allowedNumbers,
      ...addedNumbers,
    ]),
    forbiddenClaims: dedupeList([
      ...args.groundingPacket.forbiddenClaims,
      ...addedForbiddenClaims,
    ]),
    sourceMaterials: [
      ...args.groundingPacket.sourceMaterials,
      ...mergedSourceMaterials,
    ],
  };

  return {
    ...nextPacket,
    factualAuthority: collectGroundingFactualAuthority(nextPacket),
  };
}
