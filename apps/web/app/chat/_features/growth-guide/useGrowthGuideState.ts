"use client";

import { useCallback, useEffect, useMemo, useState, type RefObject } from "react";

import {
  PLAYBOOK_LIBRARY,
  buildPlaybookTemplateGroups,
  inferCurrentPlaybookStage,
  type PlaybookDefinition,
  type PlaybookStageKey,
  type PlaybookTemplate,
  type PlaybookTemplateTab,
} from "@/lib/creator/playbooks";
import type { CreatorAgentContext } from "@/lib/onboarding/agentContext";
import {
  computeXWeightedCharacterCount,
  getXCharacterLimitForAccount,
} from "@/lib/onboarding/draftArtifacts";

export interface PersonalizedPlaybookTemplate extends PlaybookTemplate {
  text: string;
}

interface UseGrowthGuideStateOptions {
  accountName: string | null;
  context: CreatorAgentContext | null;
  isVerifiedAccount: boolean;
  selectedPlaybookRef: RefObject<HTMLElement | null>;
  personalizePlaybookTemplateText: (params: {
    text: string;
    tab: PlaybookTemplateTab;
    playbook: PlaybookDefinition;
    context: CreatorAgentContext | null;
  }) => string;
}

export function useGrowthGuideState(options: UseGrowthGuideStateOptions) {
  const {
    accountName,
    context,
    isVerifiedAccount,
    selectedPlaybookRef,
    personalizePlaybookTemplateText,
  } = options;
  const [playbookModalOpen, setPlaybookModalOpen] = useState(false);
  const [playbookStage, setPlaybookStage] = useState<PlaybookStageKey>("0-1k");
  const [activePlaybookId, setActivePlaybookId] = useState<string | null>(null);
  const [pendingGrowthGuidePlaybookId, setPendingGrowthGuidePlaybookId] = useState<string | null>(
    null,
  );
  const [playbookTemplateTab, setPlaybookTemplateTab] = useState<PlaybookTemplateTab>("hook");
  const [activePlaybookTemplateId, setActivePlaybookTemplateId] = useState<string | null>(null);
  const [copiedPlaybookTemplateId, setCopiedPlaybookTemplateId] = useState<string | null>(null);

  const currentPlaybookStage = useMemo(
    () => inferCurrentPlaybookStage(context),
    [context],
  );
  const filteredStagePlaybooks = useMemo(
    () => PLAYBOOK_LIBRARY[playbookStage],
    [playbookStage],
  );
  const selectedPlaybook = useMemo(() => {
    const withinFiltered =
      filteredStagePlaybooks.find((playbook) => playbook.id === activePlaybookId) ??
      PLAYBOOK_LIBRARY[playbookStage].find((playbook) => playbook.id === activePlaybookId);

    return withinFiltered ?? filteredStagePlaybooks[0] ?? PLAYBOOK_LIBRARY[playbookStage][0] ?? null;
  }, [activePlaybookId, filteredStagePlaybooks, playbookStage]);
  const selectedPlaybookTemplateGroups = useMemo(
    () => (selectedPlaybook ? buildPlaybookTemplateGroups(selectedPlaybook) : null),
    [selectedPlaybook],
  );
  const selectedPlaybookTemplates = useMemo(
    () => selectedPlaybookTemplateGroups?.[playbookTemplateTab] ?? [],
    [playbookTemplateTab, selectedPlaybookTemplateGroups],
  );
  const personalizedPlaybookTemplates = useMemo(
    () =>
      selectedPlaybookTemplates.map((template) => ({
        ...template,
        text: personalizePlaybookTemplateText({
          text: template.text,
          tab: playbookTemplateTab,
          playbook: selectedPlaybook as PlaybookDefinition,
          context,
        }),
      })),
    [context, personalizePlaybookTemplateText, playbookTemplateTab, selectedPlaybook, selectedPlaybookTemplates],
  );
  const activePlaybookTemplate = useMemo(() => {
    if (personalizedPlaybookTemplates.length === 0) {
      return null;
    }

    return (
      personalizedPlaybookTemplates.find((template) => template.id === activePlaybookTemplateId) ??
      personalizedPlaybookTemplates[0]
    );
  }, [activePlaybookTemplateId, personalizedPlaybookTemplates]);
  const playbookTemplatePreviewCounter = useMemo(() => {
    const previewText = activePlaybookTemplate?.text ?? "";
    const weightedCharacterCount = computeXWeightedCharacterCount(previewText);
    const characterLimit = getXCharacterLimitForAccount(isVerifiedAccount);

    return `${weightedCharacterCount}/${characterLimit} chars`;
  }, [activePlaybookTemplate?.text, isVerifiedAccount]);

  const previewDisplayName = useMemo(
    () =>
      context?.creatorProfile.identity.displayName ||
      context?.creatorProfile.identity.username ||
      "X",
    [context],
  );
  const previewUsername = useMemo(
    () => context?.creatorProfile.identity.username || accountName || "user",
    [accountName, context],
  );
  const previewAvatarUrl = context?.avatarUrl ?? null;

  const handleGrowthGuideOpenChange = useCallback((open: boolean) => {
    setPlaybookModalOpen(open);
    if (!open) {
      setPendingGrowthGuidePlaybookId(null);
    }
  }, []);

  const openGrowthGuide = useCallback(() => {
    setPlaybookStage(currentPlaybookStage);
    setPendingGrowthGuidePlaybookId(null);
    setPlaybookModalOpen(true);
  }, [currentPlaybookStage]);

  const openGrowthGuideForRecommendation = useCallback(
    (stage: PlaybookStageKey, playbookId: string) => {
      setPlaybookStage(stage);
      setActivePlaybookId(playbookId);
      setPendingGrowthGuidePlaybookId(playbookId);
      setPlaybookModalOpen(true);
    },
    [],
  );

  const handleCopyPlaybookTemplate = useCallback(async (template: PlaybookTemplate) => {
    try {
      await navigator.clipboard.writeText(template.text);
      setCopiedPlaybookTemplateId(template.id);
      window.setTimeout(() => {
        setCopiedPlaybookTemplateId((current) => (current === template.id ? null : current));
      }, 1800);
    } catch (error) {
      console.error("Failed to copy playbook template", error);
    }
  }, []);

  const handleApplyPlaybook = useCallback((playbookId: string) => {
    setActivePlaybookId(playbookId);
  }, []);

  useEffect(() => {
    setPlaybookStage(currentPlaybookStage);
  }, [currentPlaybookStage]);

  useEffect(() => {
    const nextPlaybookId = filteredStagePlaybooks[0]?.id ?? null;

    setActivePlaybookId((current) => {
      if (current && filteredStagePlaybooks.some((playbook) => playbook.id === current)) {
        return current;
      }

      return nextPlaybookId;
    });
  }, [filteredStagePlaybooks]);

  useEffect(() => {
    setPlaybookTemplateTab("hook");
  }, [selectedPlaybook?.id]);

  useEffect(() => {
    setActivePlaybookTemplateId(personalizedPlaybookTemplates[0]?.id ?? null);
  }, [personalizedPlaybookTemplates]);

  useEffect(() => {
    if (
      !playbookModalOpen ||
      !pendingGrowthGuidePlaybookId ||
      activePlaybookId !== pendingGrowthGuidePlaybookId
    ) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      selectedPlaybookRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
      setPendingGrowthGuidePlaybookId(null);
    }, 180);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [activePlaybookId, pendingGrowthGuidePlaybookId, playbookModalOpen, selectedPlaybookRef]);

  return {
    playbookModalOpen,
    handleGrowthGuideOpenChange,
    openGrowthGuide,
    openGrowthGuideForRecommendation,
    playbookStage,
    setPlaybookStage,
    currentPlaybookStage,
    filteredStagePlaybooks,
    selectedPlaybook,
    handleApplyPlaybook,
    playbookTemplateTab,
    setPlaybookTemplateTab,
    personalizedPlaybookTemplates,
    activePlaybookTemplate,
    setActivePlaybookTemplateId,
    playbookTemplatePreviewCounter,
    copiedPlaybookTemplateId,
    handleCopyPlaybookTemplate,
    previewDisplayName,
    previewUsername,
    previewAvatarUrl,
  };
}
