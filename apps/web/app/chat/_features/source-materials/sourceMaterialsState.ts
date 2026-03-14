export type SourceMaterialType = "story" | "playbook" | "framework" | "case_study";

export interface SourceMaterialAsset {
  id: string;
  userId: string;
  xHandle: string | null;
  type: SourceMaterialType;
  title: string;
  tags: string[];
  verified: boolean;
  claims: string[];
  snippets: string[];
  doNotClaim: string[];
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SourceMaterialDraftState {
  id: string | null;
  title: string;
  type: SourceMaterialType;
  verified: boolean;
  tagsInput: string;
  claimsInput: string;
  snippetsInput: string;
  doNotClaimInput: string;
}

export interface SourceMaterialSeedOptions {
  silentIfEmpty?: boolean;
  successNotice?: string | null;
}

export function buildEmptySourceMaterialDraft(): SourceMaterialDraftState {
  return {
    id: null,
    title: "",
    type: "story",
    verified: true,
    tagsInput: "",
    claimsInput: "",
    snippetsInput: "",
    doNotClaimInput: "",
  };
}

export function buildSourceMaterialDraftFromAsset(
  asset: SourceMaterialAsset,
): SourceMaterialDraftState {
  return {
    id: asset.id,
    title: asset.title,
    type: asset.type,
    verified: asset.verified,
    tagsInput: asset.tags.join(", "),
    claimsInput: asset.claims.join("\n"),
    snippetsInput: asset.snippets.join("\n"),
    doNotClaimInput: asset.doNotClaim.join("\n"),
  };
}

export function isEmptySourceMaterialDraft(draft: SourceMaterialDraftState): boolean {
  return (
    draft.id === null &&
    draft.title.trim().length === 0 &&
    draft.tagsInput.trim().length === 0 &&
    draft.claimsInput.trim().length === 0 &&
    draft.snippetsInput.trim().length === 0 &&
    draft.doNotClaimInput.trim().length === 0
  );
}

export function hasAdvancedSourceMaterialDraftFields(
  draft: SourceMaterialDraftState,
): boolean {
  return (
    draft.tagsInput.trim().length > 0 ||
    draft.snippetsInput.trim().length > 0 ||
    draft.doNotClaimInput.trim().length > 0
  );
}

function dedupePreserveOrder(values: string[]): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const value of values) {
    const normalized = value.trim();
    if (!normalized) {
      continue;
    }

    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(normalized);
  }

  return deduped;
}

export function parseCommaSeparatedList(value: string): string[] {
  return dedupePreserveOrder(
    value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean),
  );
}

export function parseLineSeparatedList(value: string): string[] {
  return dedupePreserveOrder(
    value
      .split(/\r?\n/)
      .map((entry) => entry.trim())
      .filter(Boolean),
  );
}

export function formatSourceMaterialTypeLabel(type: SourceMaterialType): string {
  return type
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function normalizeSourceMaterialLookupValue(
  value: string | null | undefined,
): string {
  return (value || "").trim().toLowerCase();
}

export function deriveSourceMaterialTitle(draft: SourceMaterialDraftState): string {
  const explicitTitle = draft.title.trim();
  if (explicitTitle.length >= 3) {
    return explicitTitle;
  }

  const firstClaim = parseLineSeparatedList(draft.claimsInput)[0];
  if (firstClaim) {
    return firstClaim.slice(0, 72);
  }

  const firstSnippet = parseLineSeparatedList(draft.snippetsInput)[0];
  if (firstSnippet) {
    return firstSnippet.slice(0, 72);
  }

  return `Saved ${formatSourceMaterialTypeLabel(draft.type).toLowerCase()}`;
}

export function sortSourceMaterials(assets: SourceMaterialAsset[]): SourceMaterialAsset[] {
  return [...assets].sort((left, right) => {
    if (left.verified !== right.verified) {
      return left.verified ? -1 : 1;
    }

    const leftLastUsed = left.lastUsedAt ? Date.parse(left.lastUsedAt) : 0;
    const rightLastUsed = right.lastUsedAt ? Date.parse(right.lastUsedAt) : 0;
    if (leftLastUsed !== rightLastUsed) {
      return rightLastUsed - leftLastUsed;
    }

    return Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
  });
}

export function formatFileSize(sizeBytes: number): string {
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }

  const kb = sizeBytes / 1024;
  if (kb < 1024) {
    return `${kb.toFixed(1)} KB`;
  }

  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}
