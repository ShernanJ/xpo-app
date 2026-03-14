"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  buildEmptySourceMaterialDraft,
  buildSourceMaterialDraftFromAsset,
  deriveSourceMaterialTitle,
  hasAdvancedSourceMaterialDraftFields,
  normalizeSourceMaterialLookupValue,
  parseCommaSeparatedList,
  parseLineSeparatedList,
  sortSourceMaterials,
  type SourceMaterialAsset,
  type SourceMaterialDraftState,
  type SourceMaterialSeedOptions,
} from "./sourceMaterialsState";

interface ValidationError {
  message: string;
}

interface SourceMaterialsSuccess {
  ok: true;
  data: {
    assets: SourceMaterialAsset[];
  };
}

interface SourceMaterialMutationSuccess {
  ok: true;
  data: {
    asset?: SourceMaterialAsset;
    deletedId?: string;
  };
}

interface SourceMaterialsFailure {
  ok: false;
  errors: ValidationError[];
}

type SourceMaterialsResponse =
  | SourceMaterialsSuccess
  | SourceMaterialMutationSuccess
  | SourceMaterialsFailure;

interface UseSourceMaterialsStateOptions {
  fetchWorkspace: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  sourceMaterialsBootstrapKey: string;
}

export function useSourceMaterialsState(options: UseSourceMaterialsStateOptions) {
  const { fetchWorkspace, sourceMaterialsBootstrapKey } = options;
  const [sourceMaterialsOpen, setSourceMaterialsOpen] = useState(false);
  const [sourceMaterials, setSourceMaterials] = useState<SourceMaterialAsset[]>([]);
  const [isSourceMaterialsLoading, setIsSourceMaterialsLoading] = useState(false);
  const [isSourceMaterialsSaving, setIsSourceMaterialsSaving] = useState(false);
  const [sourceMaterialsNotice, setSourceMaterialsNotice] = useState<string | null>(null);
  const [sourceMaterialDraft, setSourceMaterialDraft] = useState<SourceMaterialDraftState>(() =>
    buildEmptySourceMaterialDraft(),
  );
  const [sourceMaterialAdvancedOpen, setSourceMaterialAdvancedOpen] = useState(false);
  const [sourceMaterialsLibraryOpen, setSourceMaterialsLibraryOpen] = useState(false);

  const sourceMaterialsBootstrapAttemptedRef = useRef<Set<string>>(new Set());

  const clearSourceMaterialsNotice = useCallback(() => {
    setSourceMaterialsNotice(null);
  }, []);

  const resetSourceMaterialDraft = useCallback(() => {
    setSourceMaterialDraft(buildEmptySourceMaterialDraft());
    setSourceMaterialAdvancedOpen(false);
    setSourceMaterialsLibraryOpen(false);
  }, []);

  const openSourceMaterials = useCallback(() => {
    setSourceMaterialsOpen(true);
    setSourceMaterialsNotice(null);
  }, []);

  const selectSourceMaterial = useCallback((asset: SourceMaterialAsset) => {
    const nextDraft = buildSourceMaterialDraftFromAsset(asset);
    setSourceMaterialDraft(nextDraft);
    setSourceMaterialAdvancedOpen(hasAdvancedSourceMaterialDraftFields(nextDraft));
    setSourceMaterialsLibraryOpen(true);
    setSourceMaterialsNotice(null);
  }, []);

  const loadSourceMaterials = useCallback(async (): Promise<SourceMaterialAsset[]> => {
    setIsSourceMaterialsLoading(true);

    try {
      const response = await fetchWorkspace("/api/creator/v2/source-materials");
      const result: SourceMaterialsResponse = await response.json();
      if (!response.ok || !result.ok) {
        const fallbackMessage = result.ok
          ? "Failed to load source materials."
          : result.errors[0]?.message;
        throw new Error(fallbackMessage || "Failed to load source materials.");
      }
      if (!("assets" in result.data)) {
        throw new Error("Failed to load source materials.");
      }

      const nextAssets = sortSourceMaterials(result.data.assets);
      setSourceMaterials(nextAssets);
      setSourceMaterialDraft((current) => {
        if (current.id) {
          const activeAsset = nextAssets.find((asset) => asset.id === current.id);
          if (activeAsset) {
            return buildSourceMaterialDraftFromAsset(activeAsset);
          }

          return buildEmptySourceMaterialDraft();
        }

        return current;
      });
      return nextAssets;
    } catch (error) {
      setSourceMaterials([]);
      setSourceMaterialsNotice(
        error instanceof Error ? error.message : "Failed to load source materials.",
      );
      return [];
    } finally {
      setIsSourceMaterialsLoading(false);
    }
  }, [fetchWorkspace]);

  const openSourceMaterialEditor = useCallback(
    async (params: {
      assetId?: string | null;
      title?: string | null;
      fallbackNotice?: string;
    }) => {
      setSourceMaterialsOpen(true);
      setSourceMaterialsNotice(null);

      const normalizedTitle = normalizeSourceMaterialLookupValue(params.title);
      let assets = sourceMaterials;
      const needsRefresh =
        assets.length === 0 ||
        (params.assetId && !assets.some((asset) => asset.id === params.assetId)) ||
        (normalizedTitle &&
          !assets.some(
            (asset) => normalizeSourceMaterialLookupValue(asset.title) === normalizedTitle,
          ));

      if (needsRefresh) {
        assets = await loadSourceMaterials();
      }

      const matchedAsset =
        (params.assetId ? assets.find((asset) => asset.id === params.assetId) : null) ||
        (normalizedTitle
          ? assets.find(
              (asset) => normalizeSourceMaterialLookupValue(asset.title) === normalizedTitle,
            )
          : null);

      if (matchedAsset) {
        selectSourceMaterial(matchedAsset);
        return;
      }

      resetSourceMaterialDraft();
      setSourceMaterialsLibraryOpen(true);
      setSourceMaterialsNotice(
        params.fallbackNotice ||
          "Couldn't find that saved source, but you can review or add it here.",
      );
    },
    [loadSourceMaterials, resetSourceMaterialDraft, selectSourceMaterial, sourceMaterials],
  );

  const saveSourceMaterial = useCallback(async () => {
    const claims = parseLineSeparatedList(sourceMaterialDraft.claimsInput);
    const snippets = parseLineSeparatedList(sourceMaterialDraft.snippetsInput);
    if (claims.length === 0 && snippets.length === 0) {
      setSourceMaterialsNotice("Add one real story, lesson, or proof point first.");
      return;
    }

    const title = deriveSourceMaterialTitle(sourceMaterialDraft);

    setIsSourceMaterialsSaving(true);
    setSourceMaterialsNotice(null);

    try {
      const payload = {
        asset: {
          type: sourceMaterialDraft.type,
          title,
          verified: sourceMaterialDraft.verified,
          tags: parseCommaSeparatedList(sourceMaterialDraft.tagsInput),
          claims,
          snippets,
          doNotClaim: parseLineSeparatedList(sourceMaterialDraft.doNotClaimInput),
        },
      };
      const isEditing = Boolean(sourceMaterialDraft.id);
      const endpoint = isEditing
        ? `/api/creator/v2/source-materials/${sourceMaterialDraft.id}`
        : "/api/creator/v2/source-materials";
      const method = isEditing ? "PATCH" : "POST";
      const response = await fetchWorkspace(endpoint, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const result: SourceMaterialsResponse = await response.json();
      if (!response.ok || !result.ok) {
        const fallbackMessage = result.ok
          ? "Failed to save source material."
          : result.errors[0]?.message;
        throw new Error(fallbackMessage || "Failed to save source material.");
      }
      if (!("asset" in result.data) || !result.data.asset) {
        throw new Error("Failed to save source material.");
      }

      const savedAsset = result.data.asset;
      setSourceMaterials((current) =>
        sortSourceMaterials([savedAsset, ...current.filter((asset) => asset.id !== savedAsset.id)]),
      );
      setSourceMaterialDraft(buildEmptySourceMaterialDraft());
      setSourceMaterialAdvancedOpen(false);
      setSourceMaterialsLibraryOpen(true);
      setSourceMaterialsNotice(
        isEditing
          ? "Updated. Xpo will reuse the latest version."
          : "Saved. Xpo can now reuse that without asking again.",
      );
    } catch (error) {
      setSourceMaterialsNotice(
        error instanceof Error ? error.message : "Failed to save source material.",
      );
    } finally {
      setIsSourceMaterialsSaving(false);
    }
  }, [fetchWorkspace, sourceMaterialDraft]);

  const seedSourceMaterials = useCallback(
    async (options: SourceMaterialSeedOptions = {}): Promise<SourceMaterialAsset[]> => {
      setIsSourceMaterialsSaving(true);
      if (!options.silentIfEmpty) {
        setSourceMaterialsNotice(null);
      }

      try {
        const response = await fetchWorkspace("/api/creator/v2/source-materials/seed", {
          method: "POST",
        });
        const result: SourceMaterialsResponse = await response.json();
        if (!response.ok || !result.ok) {
          const fallbackMessage = result.ok
            ? "Failed to import source materials."
            : result.errors[0]?.message;
          throw new Error(fallbackMessage || "Failed to import source materials.");
        }
        if (!("assets" in result.data)) {
          throw new Error("Failed to import source materials.");
        }

        await loadSourceMaterials();
        if (result.data.assets.length > 0) {
          setSourceMaterialsNotice(
            options.successNotice ??
              `Imported ${result.data.assets.length} source material${result.data.assets.length === 1 ? "" : "s"} from onboarding and grounded drafts.`,
          );
        } else if (!options.silentIfEmpty) {
          setSourceMaterialsNotice("No new source materials were found to import.");
        }
        return result.data.assets;
      } catch (error) {
        setSourceMaterialsNotice(
          error instanceof Error ? error.message : "Failed to import source materials.",
        );
        return [];
      } finally {
        setIsSourceMaterialsSaving(false);
      }
    },
    [fetchWorkspace, loadSourceMaterials],
  );

  const deleteSourceMaterial = useCallback(async () => {
    if (!sourceMaterialDraft.id) {
      return;
    }

    const draftId = sourceMaterialDraft.id;
    const draftTitle = sourceMaterialDraft.title.trim() || "this source";
    if (!window.confirm(`Delete "${draftTitle}" from the source vault?`)) {
      return;
    }

    setIsSourceMaterialsSaving(true);
    setSourceMaterialsNotice(null);

    try {
      const response = await fetchWorkspace(`/api/creator/v2/source-materials/${draftId}`, {
        method: "DELETE",
      });
      const result: SourceMaterialsResponse = await response.json();
      if (!response.ok || !result.ok) {
        const fallbackMessage = result.ok
          ? "Failed to delete source material."
          : result.errors[0]?.message;
        throw new Error(fallbackMessage || "Failed to delete source material.");
      }
      if (!("deletedId" in result.data)) {
        throw new Error("Failed to delete source material.");
      }

      setSourceMaterials((current) => {
        const nextAssets = current.filter((asset) => asset.id !== draftId);
        setSourceMaterialDraft(buildEmptySourceMaterialDraft());
        setSourceMaterialAdvancedOpen(false);
        return nextAssets;
      });
      setSourceMaterialsNotice("Source material deleted.");
    } catch (error) {
      setSourceMaterialsNotice(
        error instanceof Error ? error.message : "Failed to delete source material.",
      );
    } finally {
      setIsSourceMaterialsSaving(false);
    }
  }, [fetchWorkspace, sourceMaterialDraft.id, sourceMaterialDraft.title]);

  const removeSourceMaterialsByIds = useCallback((deletedIds: string[]) => {
    if (deletedIds.length === 0) {
      return;
    }

    setSourceMaterials((current) => {
      const nextAssets = current.filter((asset) => !deletedIds.includes(asset.id));
      setSourceMaterialDraft((draft) => {
        if (!draft.id || !deletedIds.includes(draft.id)) {
          return draft;
        }

        return nextAssets[0]
          ? buildSourceMaterialDraftFromAsset(nextAssets[0])
          : buildEmptySourceMaterialDraft();
      });
      return nextAssets;
    });
  }, []);

  const mergeSourceMaterials = useCallback((assets: SourceMaterialAsset[]) => {
    if (assets.length === 0) {
      return;
    }

    setSourceMaterials((current) =>
      sortSourceMaterials([
        ...assets,
        ...current.filter((asset) => !assets.some((promoted) => promoted.id === asset.id)),
      ]),
    );
  }, []);

  const applyClaimExample = useCallback((example: string) => {
    setSourceMaterialDraft((current) => ({
      ...current,
      claimsInput: example,
    }));
  }, []);

  const updateSourceMaterialTitle = useCallback((value: string) => {
    setSourceMaterialDraft((current) => ({
      ...current,
      title: value,
    }));
  }, []);

  const updateSourceMaterialType = useCallback(
    (type: SourceMaterialDraftState["type"]) => {
      setSourceMaterialDraft((current) => ({
        ...current,
        type,
      }));
    },
    [],
  );

  const toggleSourceMaterialVerified = useCallback(() => {
    setSourceMaterialDraft((current) => ({
      ...current,
      verified: !current.verified,
    }));
  }, []);

  const updateSourceMaterialClaims = useCallback((value: string) => {
    setSourceMaterialDraft((current) => ({
      ...current,
      claimsInput: value,
    }));
  }, []);

  const toggleSourceMaterialAdvancedOpen = useCallback(() => {
    setSourceMaterialAdvancedOpen((current) => !current);
  }, []);

  const updateSourceMaterialTags = useCallback((value: string) => {
    setSourceMaterialDraft((current) => ({
      ...current,
      tagsInput: value,
    }));
  }, []);

  const updateSourceMaterialSnippets = useCallback((value: string) => {
    setSourceMaterialDraft((current) => ({
      ...current,
      snippetsInput: value,
    }));
  }, []);

  const updateSourceMaterialDoNotClaim = useCallback((value: string) => {
    setSourceMaterialDraft((current) => ({
      ...current,
      doNotClaimInput: value,
    }));
  }, []);

  const toggleSourceMaterialsLibraryOpen = useCallback(() => {
    setSourceMaterialsLibraryOpen((current) => !current);
  }, []);

  useEffect(() => {
    if (!sourceMaterialsOpen) {
      return;
    }

    let cancelled = false;

    async function bootstrapSourceMaterials() {
      const existingAssets = await loadSourceMaterials();
      if (cancelled || existingAssets.length > 0) {
        return;
      }

      const bootstrapKey = sourceMaterialsBootstrapKey;
      let alreadyAttempted = sourceMaterialsBootstrapAttemptedRef.current.has(bootstrapKey);
      if (!alreadyAttempted) {
        try {
          alreadyAttempted = window.localStorage.getItem(bootstrapKey) === "1";
        } catch {
          alreadyAttempted = false;
        }
      }

      if (alreadyAttempted) {
        return;
      }

      sourceMaterialsBootstrapAttemptedRef.current.add(bootstrapKey);
      try {
        window.localStorage.setItem(bootstrapKey, "1");
      } catch {
        // Ignore storage failures and keep the in-memory guard.
      }

      await seedSourceMaterials({
        silentIfEmpty: true,
        successNotice:
          "Pulled in a few stories from onboarding and grounded drafts to get you started.",
      });
    }

    void bootstrapSourceMaterials();
    return () => {
      cancelled = true;
    };
  }, [loadSourceMaterials, seedSourceMaterials, sourceMaterialsBootstrapKey, sourceMaterialsOpen]);

  return {
    sourceMaterialsOpen,
    setSourceMaterialsOpen,
    openSourceMaterials,
    sourceMaterials,
    mergeSourceMaterials,
    removeSourceMaterialsByIds,
    isSourceMaterialsLoading,
    isSourceMaterialsSaving,
    sourceMaterialsNotice,
    clearSourceMaterialsNotice,
    sourceMaterialDraft,
    resetSourceMaterialDraft,
    applyClaimExample,
    updateSourceMaterialTitle,
    updateSourceMaterialType,
    toggleSourceMaterialVerified,
    updateSourceMaterialClaims,
    sourceMaterialAdvancedOpen,
    toggleSourceMaterialAdvancedOpen,
    updateSourceMaterialTags,
    updateSourceMaterialSnippets,
    updateSourceMaterialDoNotClaim,
    sourceMaterialsLibraryOpen,
    toggleSourceMaterialsLibraryOpen,
    selectSourceMaterial,
    loadSourceMaterials,
    openSourceMaterialEditor,
    saveSourceMaterial,
    seedSourceMaterials,
    deleteSourceMaterial,
  };
}
