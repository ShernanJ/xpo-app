"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { ObservedMetricsFormState } from "../../_dialogs/ObservedMetricsModal";
import type {
  DraftQueueCandidate,
  DraftQueueMutationPayload,
} from "./draftQueueViewState";

interface ValidationError {
  message: string;
}

interface DraftQueueSuccess {
  ok: true;
  data: {
    candidates: DraftQueueCandidate[];
  };
}

interface DraftQueueFailure {
  ok: false;
  errors: ValidationError[];
}

type DraftQueueResponse = DraftQueueSuccess | DraftQueueFailure;

interface DraftQueueCandidateMutationSuccess {
  ok: true;
  data: {
    candidate: DraftQueueCandidate;
  };
}

type DraftQueueCandidateMutationResponse =
  | DraftQueueCandidateMutationSuccess
  | DraftQueueFailure;

interface UseDraftQueueStateOptions {
  activeThreadId: string | null;
  fetchWorkspace: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  monetizationEnabled: boolean;
  sessionUserId: string | null | undefined;
}

function createEmptyObservedMetricsForm(): ObservedMetricsFormState {
  return {
    likeCount: "",
    replyCount: "",
    profileClicks: "",
    followerDelta: "",
  };
}

function normalizeObservedMetricValue(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function buildObservedMetricsPayload(
  value: ObservedMetricsFormState,
): Record<string, number> | null {
  const likeCount = normalizeObservedMetricValue(value.likeCount);
  const replyCount = normalizeObservedMetricValue(value.replyCount);
  if (likeCount === undefined || replyCount === undefined) {
    return null;
  }

  const profileClicks = normalizeObservedMetricValue(value.profileClicks);
  const followerDelta = normalizeObservedMetricValue(value.followerDelta);

  return {
    likeCount,
    replyCount,
    ...(profileClicks !== undefined ? { profileClicks } : {}),
    ...(followerDelta !== undefined ? { followerDelta } : {}),
  };
}

export function useDraftQueueState(options: UseDraftQueueStateOptions) {
  const { activeThreadId, fetchWorkspace, monetizationEnabled, sessionUserId } = options;

  const [draftQueueOpen, setDraftQueueOpen] = useState(false);
  const [draftQueueItems, setDraftQueueItems] = useState<DraftQueueCandidate[]>([]);
  const [isDraftQueueLoading, setIsDraftQueueLoading] = useState(false);
  const [draftQueueActionById, setDraftQueueActionById] = useState<Record<string, string>>({});
  const [draftQueueError, setDraftQueueError] = useState<string | null>(null);
  const [editingDraftCandidateId, setEditingDraftCandidateId] = useState<string | null>(null);
  const [editingDraftCandidateText, setEditingDraftCandidateText] = useState("");
  const [observedMetricsCandidateId, setObservedMetricsCandidateId] = useState<string | null>(
    null,
  );
  const [observedMetricsForm, setObservedMetricsForm] = useState<ObservedMetricsFormState>(
    createEmptyObservedMetricsForm(),
  );

  const loadDraftQueue = useCallback(async () => {
    if (!monetizationEnabled || !sessionUserId) {
      return;
    }

    setIsDraftQueueLoading(true);
    setDraftQueueError(null);

    try {
      const query = activeThreadId ? `?threadId=${encodeURIComponent(activeThreadId)}` : "";
      const response = await fetchWorkspace(`/api/creator/v2/draft-candidates${query}`, {
        method: "GET",
      });
      const data = (await response.json()) as DraftQueueResponse;

      if (!response.ok || !data.ok) {
        const failure = data as DraftQueueFailure;
        throw new Error(failure.errors?.[0]?.message || "Failed to load the draft queue.");
      }

      setDraftQueueItems(data.data.candidates);
    } catch (error) {
      setDraftQueueItems([]);
      setDraftQueueError(
        error instanceof Error ? error.message : "Failed to load the draft queue.",
      );
    } finally {
      setIsDraftQueueLoading(false);
    }
  }, [activeThreadId, fetchWorkspace, monetizationEnabled, sessionUserId]);

  const mutateDraftQueueCandidate = useCallback(
    async (candidateId: string, payload: DraftQueueMutationPayload) => {
      setDraftQueueActionById((current) => ({
        ...current,
        [candidateId]: payload.action,
      }));
      setDraftQueueError(null);

      try {
        const response = await fetchWorkspace(
          `/api/creator/v2/draft-candidates/${encodeURIComponent(candidateId)}`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
          },
        );
        const data = (await response.json()) as DraftQueueCandidateMutationResponse;

        if (!response.ok || !data.ok) {
          const failure = data as DraftQueueFailure;
          throw new Error(failure.errors?.[0]?.message || "Failed to update the candidate.");
        }

        setDraftQueueItems((current) =>
          current.map((candidate) =>
            candidate.id === candidateId ? data.data.candidate : candidate,
          ),
        );

        if (payload.action === "edit") {
          setEditingDraftCandidateId(null);
          setEditingDraftCandidateText("");
        }
        return true;
      } catch (error) {
        setDraftQueueError(
          error instanceof Error ? error.message : "Failed to update the candidate.",
        );
        return false;
      } finally {
        setDraftQueueActionById((current) => {
          const next = { ...current };
          delete next[candidateId];
          return next;
        });
      }
    },
    [fetchWorkspace],
  );

  const observedMetricsCandidate = useMemo(
    () =>
      observedMetricsCandidateId
        ? draftQueueItems.find((candidate) => candidate.id === observedMetricsCandidateId) ?? null
        : null,
    [draftQueueItems, observedMetricsCandidateId],
  );

  const closeObservedMetricsModal = useCallback(() => {
    setObservedMetricsCandidateId(null);
    setObservedMetricsForm(createEmptyObservedMetricsForm());
  }, []);

  const openObservedMetricsModal = useCallback(
    (candidate: Pick<DraftQueueCandidate, "id" | "observedMetrics">) => {
      const metrics = (candidate.observedMetrics ?? {}) as Record<string, unknown>;
      setObservedMetricsCandidateId(candidate.id);
      setObservedMetricsForm({
        likeCount:
          typeof metrics.likeCount === "number" || typeof metrics.likeCount === "string"
            ? String(metrics.likeCount)
            : "",
        replyCount:
          typeof metrics.replyCount === "number" || typeof metrics.replyCount === "string"
            ? String(metrics.replyCount)
            : "",
        profileClicks:
          typeof metrics.profileClicks === "number" || typeof metrics.profileClicks === "string"
            ? String(metrics.profileClicks)
            : "",
        followerDelta:
          typeof metrics.followerDelta === "number" || typeof metrics.followerDelta === "string"
            ? String(metrics.followerDelta)
            : "",
      });
    },
    [],
  );

  const submitObservedMetrics = useCallback(async () => {
    if (!observedMetricsCandidateId) {
      return;
    }

    const observedMetrics = buildObservedMetricsPayload(observedMetricsForm);
    if (!observedMetrics) {
      setDraftQueueError("Likes and replies are required before saving observed metrics.");
      return;
    }

    const didSave = await mutateDraftQueueCandidate(observedMetricsCandidateId, {
      action: "observed",
      observedMetrics,
    });
    if (didSave) {
      closeObservedMetricsModal();
    }
  }, [
    closeObservedMetricsModal,
    mutateDraftQueueCandidate,
    observedMetricsCandidateId,
    observedMetricsForm,
  ]);

  const openDraftQueue = useCallback(() => {
    setDraftQueueError(null);
    setDraftQueueOpen(true);
  }, []);

  const handleDraftQueueOpenChange = useCallback((open: boolean) => {
    setDraftQueueOpen(open);
    if (!open) {
      setEditingDraftCandidateId(null);
      setEditingDraftCandidateText("");
    }
  }, []);

  const startEditingDraftCandidate = useCallback((candidateId: string, content: string) => {
    setEditingDraftCandidateId(candidateId);
    setEditingDraftCandidateText(content);
  }, []);

  const cancelEditingDraftCandidate = useCallback(() => {
    setEditingDraftCandidateId(null);
    setEditingDraftCandidateText("");
  }, []);

  const updateObservedMetricsField = useCallback(
    (field: keyof ObservedMetricsFormState, nextValue: string) => {
      setObservedMetricsForm((current) => ({
        ...current,
        [field]: nextValue,
      }));
    },
    [],
  );

  useEffect(() => {
    if (!draftQueueOpen) {
      return;
    }

    void loadDraftQueue();
  }, [draftQueueOpen, loadDraftQueue]);

  return {
    draftQueueOpen,
    draftQueueItems,
    isDraftQueueLoading,
    draftQueueActionById,
    draftQueueError,
    editingDraftCandidateId,
    editingDraftCandidateText,
    observedMetricsCandidate,
    observedMetricsCandidateId,
    observedMetricsForm,
    setDraftQueueItems,
    setDraftQueueError,
    setEditingDraftCandidateId,
    setEditingDraftCandidateText,
    openDraftQueue,
    handleDraftQueueOpenChange,
    startEditingDraftCandidate,
    cancelEditingDraftCandidate,
    mutateDraftQueueCandidate,
    openObservedMetricsModal,
    closeObservedMetricsModal,
    submitObservedMetrics,
    updateObservedMetricsField,
  };
}
