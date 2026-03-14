"use client";

import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type KeyboardEvent } from "react";

import { buildPreferenceConstraintsFromPreferences } from "@/lib/agent-v2/orchestrator/preferenceConstraints";
import type { UserPreferences } from "@/lib/agent-v2/core/styleProfile";
import type { CreatorAgentContext } from "@/lib/onboarding/strategy/agentContext";

import { buildDraftCharacterCounterMeta } from "../draft-editor/chatDraftPreviewState";

interface ValidationError {
  message: string;
}

interface PreferencesSuccess {
  ok: true;
  data: {
    preferences: UserPreferences;
  };
}

interface PreferencesFailure {
  ok: false;
  errors: ValidationError[];
}

type PreferencesResponse = PreferencesSuccess | PreferencesFailure;

interface UsePreferencesStateOptions {
  accountName: string | null;
  context: CreatorAgentContext | null;
  fetchWorkspace: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  isVerifiedAccount: boolean;
  onErrorMessage: (message: string | null) => void;
}

function escapeRegexLiteral(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function applyNormalSentenceCasing(value: string): string {
  return value
    .toLowerCase()
    .replace(/(^|[.!?]\s+|\n)([a-z])/g, (_, prefix: string, character: string) =>
      `${prefix}${character.toUpperCase()}`,
    )
    .replace(
      /(^|\n)(\s*(?:-|>)\s*)([a-z])/g,
      (_, prefix: string, marker: string, character: string) =>
        `${prefix}${marker}${character.toUpperCase()}`,
    );
}

function inferAutoBulletMarker(context: CreatorAgentContext | null): "-" | ">" {
  if (!context) {
    return "-";
  }

  let dashCount = 0;
  let angleCount = 0;
  const samples = [
    ...context.creatorProfile.examples.voiceAnchors,
    ...context.creatorProfile.examples.replyVoiceAnchors,
    ...context.creatorProfile.examples.quoteVoiceAnchors,
    ...context.creatorProfile.examples.bestPerforming,
  ];

  for (const sample of samples) {
    for (const line of sample.text.split("\n")) {
      if (/^\s*-\s+/.test(line)) {
        dashCount += 1;
      }

      if (/^\s*>\s+/.test(line)) {
        angleCount += 1;
      }
    }
  }

  return angleCount > dashCount ? ">" : "-";
}

export function usePreferencesState(options: UsePreferencesStateOptions) {
  const { accountName, context, fetchWorkspace, isVerifiedAccount, onErrorMessage } = options;
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [isPreferencesLoading, setIsPreferencesLoading] = useState(false);
  const [isPreferencesSaving, setIsPreferencesSaving] = useState(false);
  const [preferenceCasing, setPreferenceCasing] = useState<
    "auto" | "normal" | "lowercase" | "uppercase"
  >("auto");
  const [preferenceBulletStyle, setPreferenceBulletStyle] = useState<"auto" | "-" | ">">(
    "auto",
  );
  const [preferenceWritingMode, setPreferenceWritingMode] = useState<
    "voice" | "balanced" | "growth"
  >("balanced");
  const [preferenceUseEmojis, setPreferenceUseEmojis] = useState(false);
  const [preferenceAllowProfanity, setPreferenceAllowProfanity] = useState(false);
  const [preferenceBlacklistedTerms, setPreferenceBlacklistedTerms] = useState<string[]>([]);
  const [preferenceBlacklistInput, setPreferenceBlacklistInput] = useState("");
  const [preferenceMaxCharacters, setPreferenceMaxCharacters] = useState(25000);

  const effectivePreferenceMaxCharacters = isVerifiedAccount
    ? Math.min(Math.max(preferenceMaxCharacters || 250, 250), 25000)
    : 250;
  const autoPreferenceBulletMarker = useMemo(
    () => inferAutoBulletMarker(context),
    [context],
  );

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

  const commitPreferenceBlacklistedTerm = useCallback((rawValue: string) => {
    const normalizedValue = rawValue.trim().replace(/^,+|,+$/g, "").trim();

    if (!normalizedValue) {
      return;
    }

    setPreferenceBlacklistedTerms((current) => {
      if (current.some((term) => term.toLowerCase() === normalizedValue.toLowerCase())) {
        return current;
      }

      return [...current, normalizedValue];
    });
  }, []);

  const removePreferenceBlacklistedTerm = useCallback((termIndex: number) => {
    setPreferenceBlacklistedTerms((current) => current.filter((_, index) => index !== termIndex));
  }, []);

  const handlePreferenceBlacklistInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const nextValue = event.target.value;

      if (!nextValue.includes(",")) {
        setPreferenceBlacklistInput(nextValue);
        return;
      }

      const segments = nextValue.split(",");
      for (const segment of segments.slice(0, -1)) {
        commitPreferenceBlacklistedTerm(segment);
      }

      setPreferenceBlacklistInput(segments.length > 0 ? segments[segments.length - 1] : "");
    },
    [commitPreferenceBlacklistedTerm],
  );

  const handlePreferenceBlacklistInputKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter" || event.key === ",") {
        event.preventDefault();
        commitPreferenceBlacklistedTerm(preferenceBlacklistInput);
        setPreferenceBlacklistInput("");
        return;
      }

      if (
        (event.key === "Backspace" || event.key === "Delete") &&
        preferenceBlacklistInput.length === 0 &&
        preferenceBlacklistedTerms.length > 0
      ) {
        event.preventDefault();
        setPreferenceBlacklistedTerms((current) => {
          if (event.key === "Delete") {
            return current.slice(1);
          }

          return current.slice(0, -1);
        });
      }
    },
    [commitPreferenceBlacklistedTerm, preferenceBlacklistInput, preferenceBlacklistedTerms.length],
  );

  const preferencesPreviewDraft = useMemo(() => {
    const bullet =
      preferenceBulletStyle === "auto" ? autoPreferenceBulletMarker : preferenceBulletStyle;
    const lines =
      preferenceWritingMode === "voice"
        ? [
            "building xpo in public means shipping what feels real, not what sounds polished.",
            preferenceAllowProfanity
              ? "this grind gets fucking real, but the reps are worth it."
              : "this grind gets real, but the reps are worth it.",
            `${bullet} sharing what i'm learning as it happens`,
            `${bullet} keeping the rough edges in instead of over-polishing`,
            `${bullet} shipping again when the next fix is obvious`,
            "if you're building too, keep going.",
          ]
        : preferenceWritingMode === "growth"
          ? [
              "most people wait too long to ship. building xpo in public keeps the loop tight.",
              preferenceAllowProfanity
                ? "this grind gets fucking real, but the reps are worth it."
                : "this grind gets real, but the reps are worth it.",
              `${bullet} ship faster`,
              `${bullet} learn what people actually care about`,
              `${bullet} turn every post into a feedback loop`,
              "if you're building too, post the next rep today.",
            ]
          : [
              "building xpo in public means shipping before it feels perfect.",
              preferenceAllowProfanity
                ? "this grind gets fucking real, but the reps are worth it."
                : "this grind gets real, but the reps are worth it.",
              `${bullet} testing ideas fast`,
              `${bullet} listening to what people actually need`,
              `${bullet} fixing what breaks and shipping again`,
              "if you're building too, keep going.",
            ];

    let nextDraft = lines.join("\n");

    if (preferenceUseEmojis) {
      nextDraft = nextDraft.replace(
        lines[0],
        `${lines[0]} ${preferenceWritingMode === "growth" ? "📈" : "🚀"}`,
      );
      nextDraft = nextDraft.replace(
        lines[lines.length - 1],
        `${lines[lines.length - 1]} ${preferenceWritingMode === "voice" ? "🙂" : "🔥"}`,
      );
    }

    for (const blockedTerm of preferenceBlacklistedTerms) {
      nextDraft = nextDraft.replace(new RegExp(escapeRegexLiteral(blockedTerm), "gi"), "");
    }

    nextDraft = nextDraft
      .replace(/[ \t]{2,}/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/\s+([,.!?;:])/g, "$1")
      .trim();

    if (preferenceCasing === "normal") {
      nextDraft = applyNormalSentenceCasing(nextDraft);
    } else if (preferenceCasing === "lowercase") {
      nextDraft = nextDraft.toLowerCase();
    } else if (preferenceCasing === "uppercase") {
      nextDraft = nextDraft.toUpperCase();
    }

    return nextDraft;
  }, [
    autoPreferenceBulletMarker,
    preferenceAllowProfanity,
    preferenceBlacklistedTerms,
    preferenceBulletStyle,
    preferenceCasing,
    preferenceUseEmojis,
    preferenceWritingMode,
  ]);

  const preferencesPreviewCounter = useMemo(
    () => buildDraftCharacterCounterMeta(preferencesPreviewDraft, effectivePreferenceMaxCharacters),
    [effectivePreferenceMaxCharacters, preferencesPreviewDraft],
  );

  const currentPreferencePayload = useMemo<UserPreferences>(
    () => ({
      casing: preferenceCasing,
      bulletStyle:
        preferenceBulletStyle === "auto"
          ? "auto"
          : preferenceBulletStyle === "-"
            ? "dash"
            : "angle",
      emojiUsage: preferenceUseEmojis ? "on" : "off",
      profanity: preferenceAllowProfanity ? "on" : "off",
      blacklist: preferenceBlacklistedTerms,
      writingGoal:
        preferenceWritingMode === "voice"
          ? "voice_first"
          : preferenceWritingMode === "growth"
            ? "growth_first"
            : "balanced",
      verifiedMaxChars: isVerifiedAccount ? effectivePreferenceMaxCharacters : null,
    }),
    [
      effectivePreferenceMaxCharacters,
      isVerifiedAccount,
      preferenceAllowProfanity,
      preferenceBlacklistedTerms,
      preferenceBulletStyle,
      preferenceCasing,
      preferenceUseEmojis,
      preferenceWritingMode,
    ],
  );

  const preferenceConstraintRules = useMemo(
    () =>
      buildPreferenceConstraintsFromPreferences(currentPreferencePayload, {
        isVerifiedAccount,
      }),
    [currentPreferencePayload, isVerifiedAccount],
  );

  const applyPersistedPreferences = useCallback((preferences: UserPreferences) => {
    setPreferenceCasing(preferences.casing);
    setPreferenceBulletStyle(
      preferences.bulletStyle === "dash"
        ? "-"
        : preferences.bulletStyle === "angle"
          ? ">"
          : "auto",
    );
    setPreferenceWritingMode(
      preferences.writingGoal === "voice_first"
        ? "voice"
        : preferences.writingGoal === "growth_first"
          ? "growth"
          : "balanced",
    );
    setPreferenceUseEmojis(preferences.emojiUsage === "on");
    setPreferenceAllowProfanity(preferences.profanity === "on");
    setPreferenceBlacklistedTerms(preferences.blacklist);
    setPreferenceBlacklistInput("");
    setPreferenceMaxCharacters(preferences.verifiedMaxChars ?? 25000);
  }, []);

  useEffect(() => {
    if (!accountName) {
      return;
    }

    let isMounted = true;
    setIsPreferencesLoading(true);

    fetchWorkspace("/api/creator/v2/preferences")
      .then((res) => res.json())
      .then((data: PreferencesResponse) => {
        if (!isMounted || !data.ok) {
          return;
        }

        applyPersistedPreferences(data.data.preferences);
      })
      .catch((err) => console.error("Failed to load profile preferences:", err))
      .finally(() => {
        if (isMounted) {
          setIsPreferencesLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [accountName, applyPersistedPreferences, fetchWorkspace]);

  const savePreferences = useCallback(async () => {
    setIsPreferencesSaving(true);
    onErrorMessage(null);

    try {
      const response = await fetchWorkspace("/api/creator/v2/preferences", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          preferences: currentPreferencePayload,
        }),
      });

      const data: PreferencesResponse = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(
          data.ok ? "Failed to save preferences." : (data.errors[0]?.message ?? "Failed to save preferences."),
        );
      }

      applyPersistedPreferences(data.data.preferences);
      setPreferencesOpen(false);
    } catch (error) {
      console.error(error);
      onErrorMessage(error instanceof Error ? error.message : "Failed to save preferences.");
    } finally {
      setIsPreferencesSaving(false);
    }
  }, [applyPersistedPreferences, currentPreferencePayload, fetchWorkspace, onErrorMessage]);

  const openPreferences = useCallback(() => {
    setPreferencesOpen(true);
  }, []);

  const togglePreferenceUseEmojis = useCallback(() => {
    setPreferenceUseEmojis((current) => !current);
  }, []);

  const togglePreferenceAllowProfanity = useCallback(() => {
    setPreferenceAllowProfanity((current) => !current);
  }, []);

  return {
    preferencesOpen,
    setPreferencesOpen,
    openPreferences,
    savePreferences,
    isPreferencesLoading,
    isPreferencesSaving,
    preferenceCasing,
    setPreferenceCasing,
    preferenceBulletStyle,
    setPreferenceBulletStyle,
    preferenceWritingMode,
    setPreferenceWritingMode,
    preferenceUseEmojis,
    togglePreferenceUseEmojis,
    preferenceAllowProfanity,
    togglePreferenceAllowProfanity,
    preferenceBlacklistInput,
    handlePreferenceBlacklistInputChange,
    handlePreferenceBlacklistInputKeyDown,
    preferenceBlacklistedTerms,
    removePreferenceBlacklistedTerm,
    effectivePreferenceMaxCharacters,
    setPreferenceMaxCharacters,
    previewDisplayName,
    previewUsername,
    previewAvatarUrl,
    preferencesPreviewDraft,
    preferencesPreviewCounter,
    currentPreferencePayload,
    preferenceConstraintRules,
  };
}
