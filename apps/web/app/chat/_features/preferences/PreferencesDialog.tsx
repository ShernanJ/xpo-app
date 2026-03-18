"use client";

import type { ChangeEventHandler, KeyboardEventHandler } from "react";
import Image from "next/image";
import { Ban, BarChart3, List, Settings2, Smile, Type } from "lucide-react";

import type { DraftCounterMeta } from "../draft-editor/chatDraftPreviewState";

type PreferenceCasing = "auto" | "normal" | "lowercase" | "uppercase";
type PreferenceBulletStyle = "auto" | "-" | ">";
type PreferenceWritingMode = "voice" | "balanced" | "growth";

interface PreferencesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: () => void;
  isPreferencesLoading: boolean;
  isPreferencesSaving: boolean;
  preferenceCasing: PreferenceCasing;
  onPreferenceCasingChange: (value: PreferenceCasing) => void;
  preferenceBulletStyle: PreferenceBulletStyle;
  onPreferenceBulletStyleChange: (value: PreferenceBulletStyle) => void;
  preferenceWritingMode: PreferenceWritingMode;
  onPreferenceWritingModeChange: (value: PreferenceWritingMode) => void;
  preferenceUseEmojis: boolean;
  onTogglePreferenceUseEmojis: () => void;
  preferenceAllowProfanity: boolean;
  onTogglePreferenceAllowProfanity: () => void;
  preferenceBlacklistInput: string;
  onPreferenceBlacklistInputChange: ChangeEventHandler<HTMLInputElement>;
  onPreferenceBlacklistInputKeyDown: KeyboardEventHandler<HTMLInputElement>;
  preferenceBlacklistedTerms: string[];
  onRemovePreferenceBlacklistedTerm: (index: number) => void;
  isVerifiedAccount: boolean;
  effectivePreferenceMaxCharacters: number;
  onPreferenceMaxCharactersChange: (value: number) => void;
  previewDisplayName: string;
  previewUsername: string;
  previewAvatarUrl: string | null;
  preferencesPreviewDraft: string;
  preferencesPreviewCounter: DraftCounterMeta;
}

const CASING_OPTIONS: Array<{ label: string; value: PreferenceCasing }> = [
  { label: "Auto", value: "auto" },
  { label: "Normal", value: "normal" },
  { label: "Lowercase", value: "lowercase" },
  { label: "Uppercase", value: "uppercase" },
];

const BULLET_STYLE_OPTIONS: Array<{ label: string; value: PreferenceBulletStyle }> = [
  { label: "Auto", value: "auto" },
  { label: "Dash (-)", value: "-" },
  { label: "Angle (>)", value: ">" },
];

const WRITING_MODE_OPTIONS: Array<{ label: string; value: PreferenceWritingMode }> = [
  { label: "Closer to my voice", value: "voice" },
  { label: "Balanced", value: "balanced" },
  { label: "Optimize for growth", value: "growth" },
];

export function PreferencesDialog(props: PreferencesDialogProps) {
  const {
    open,
    onOpenChange,
    onSave,
    isPreferencesLoading,
    isPreferencesSaving,
    preferenceCasing,
    onPreferenceCasingChange,
    preferenceBulletStyle,
    onPreferenceBulletStyleChange,
    preferenceWritingMode,
    onPreferenceWritingModeChange,
    preferenceUseEmojis,
    onTogglePreferenceUseEmojis,
    preferenceAllowProfanity,
    onTogglePreferenceAllowProfanity,
    preferenceBlacklistInput,
    onPreferenceBlacklistInputChange,
    onPreferenceBlacklistInputKeyDown,
    preferenceBlacklistedTerms,
    onRemovePreferenceBlacklistedTerm,
    isVerifiedAccount,
    effectivePreferenceMaxCharacters,
    onPreferenceMaxCharactersChange,
    previewDisplayName,
    previewUsername,
    previewAvatarUrl,
    preferencesPreviewDraft,
    preferencesPreviewCounter,
  } = props;

  if (!open) {
    return null;
  }

  return (
    <div
      className="absolute inset-0 z-30 flex items-start justify-center overflow-y-auto bg-black/80 px-4 py-4 sm:items-center sm:py-8"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onOpenChange(false);
        }
      }}
    >
      <div className="relative my-auto flex w-full max-w-5xl flex-col rounded-[1.75rem] border border-white/10 bg-[#0F0F0F] shadow-2xl max-sm:max-h-[calc(100dvh-2rem)] sm:max-h-[calc(100dvh-4rem)]">
        <div className="flex items-start justify-between gap-4 border-b border-white/10 px-6 py-5">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
              Preferences
            </p>
            <h2 className="mt-3 text-2xl font-semibold text-white">
              Tune how Xpo writes for this profile
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-zinc-400">
              Set defaults for formatting, tone, and verified-only character controls. The preview
              updates instantly and does not need the model.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onSave}
              disabled={isPreferencesLoading || isPreferencesSaving}
              className="rounded-full bg-white px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
            >
              {isPreferencesSaving ? "Saving" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded-full border border-white/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-white transition hover:bg-white/[0.04]"
            >
              Close
            </button>
          </div>
        </div>

        <div className="overflow-y-auto px-6 py-6">
          <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="space-y-6">
              <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-5">
                <div className="flex items-center gap-3">
                  <Settings2 className="h-4 w-4 text-zinc-500" />
                  <div>
                    <p className="text-sm font-semibold text-white">Core Settings</p>
                    <p className="text-xs text-zinc-500">Quick defaults for formatting and tone.</p>
                  </div>
                </div>

                <div className="mt-5 space-y-5">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm font-medium text-zinc-300">
                      <Type className="h-4 w-4 text-zinc-500" />
                      <span>Default casing</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {CASING_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => onPreferenceCasingChange(option.value)}
                          className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                            preferenceCasing === option.value
                              ? "bg-white text-black"
                              : "border border-white/10 text-zinc-400 hover:bg-white/[0.04] hover:text-white"
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm font-medium text-zinc-300">
                      <List className="h-4 w-4 text-zinc-500" />
                      <span>Bullet style</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {BULLET_STYLE_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => onPreferenceBulletStyleChange(option.value)}
                          className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                            preferenceBulletStyle === option.value
                              ? "bg-white text-black"
                              : "border border-white/10 text-zinc-400 hover:bg-white/[0.04] hover:text-white"
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm font-medium text-zinc-300">
                      <BarChart3 className="h-4 w-4 text-zinc-500" />
                      <span>Writing goal</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {WRITING_MODE_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => onPreferenceWritingModeChange(option.value)}
                          className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                            preferenceWritingMode === option.value
                              ? "bg-white text-black"
                              : "border border-white/10 text-zinc-400 hover:bg-white/[0.04] hover:text-white"
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={onTogglePreferenceUseEmojis}
                      className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-left transition ${
                        preferenceUseEmojis
                          ? "border-white/20 bg-white/[0.06]"
                          : "border-white/10 bg-black/20"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Smile className="h-4 w-4 text-zinc-500" />
                        <span className="text-sm text-zinc-300">Use emojis</span>
                      </div>
                      <span
                        className={`relative flex h-6 w-11 items-center rounded-full px-1 transition ${
                          preferenceUseEmojis ? "bg-emerald-500/70" : "bg-zinc-800"
                        }`}
                      >
                        <span
                          className={`h-4 w-4 rounded-full bg-white transition-transform ${
                            preferenceUseEmojis ? "translate-x-5" : "translate-x-0"
                          }`}
                        />
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={onTogglePreferenceAllowProfanity}
                      className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-left transition ${
                        preferenceAllowProfanity
                          ? "border-white/20 bg-white/[0.06]"
                          : "border-white/10 bg-black/20"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Ban className="h-4 w-4 text-zinc-500" />
                        <span className="text-sm text-zinc-300">Allow profanity</span>
                      </div>
                      <span
                        className={`relative flex h-6 w-11 items-center rounded-full px-1 transition ${
                          preferenceAllowProfanity ? "bg-emerald-500/70" : "bg-zinc-800"
                        }`}
                      >
                        <span
                          className={`h-4 w-4 rounded-full bg-white transition-transform ${
                            preferenceAllowProfanity ? "translate-x-5" : "translate-x-0"
                          }`}
                        />
                      </span>
                    </button>
                  </div>

                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm font-medium text-zinc-300">
                      <Ban className="h-4 w-4 text-zinc-500" />
                      <span>Blacklist words or emojis</span>
                    </label>
                    <div className="rounded-2xl border border-white/10 bg-black/20 px-3 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="text"
                          value={preferenceBlacklistInput}
                          onChange={onPreferenceBlacklistInputChange}
                          onKeyDown={onPreferenceBlacklistInputKeyDown}
                          placeholder="type a word, then press enter or comma"
                          className="min-w-[12rem] flex-1 bg-transparent text-sm text-white outline-none placeholder:text-zinc-600"
                        />
                        {preferenceBlacklistedTerms.map((term, index) => (
                          <span
                            key={`${term}-${index}`}
                            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-zinc-300"
                          >
                            <span>{term}</span>
                            <button
                              type="button"
                              onClick={() => onRemovePreferenceBlacklistedTerm(index)}
                              className="text-zinc-500 transition hover:text-white"
                              aria-label={`Remove ${term} from blacklist`}
                            >
                              x
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-5">
                <div className="flex items-center gap-3">
                  {isVerifiedAccount ? (
                    <Image
                      src="/x-verified.svg"
                      alt="Verified settings"
                      width={16}
                      height={16}
                      className="h-4 w-4"
                    />
                  ) : (
                    <BarChart3 className="h-4 w-4 text-zinc-500" />
                  )}
                  <div>
                    <p className="text-sm font-semibold text-white">Verified Settings</p>
                    <p className="text-xs text-zinc-500">
                      Custom max length only applies to verified accounts. Unverified users are
                      capped to 250 characters.
                    </p>
                  </div>
                </div>

                <div className="mt-5 space-y-4">
                  <div className="flex items-center justify-between gap-4">
                    <label className="text-sm font-medium text-zinc-300">
                      Maximum character count
                    </label>
                    <input
                      type="number"
                      min={250}
                      max={25000}
                      step={10}
                      value={effectivePreferenceMaxCharacters}
                      disabled={!isVerifiedAccount}
                      onChange={(event) =>
                        onPreferenceMaxCharactersChange(
                          Number.parseInt(event.target.value || "250", 10) || 250,
                        )
                      }
                      className="w-28 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-right text-sm text-white outline-none disabled:cursor-not-allowed disabled:text-zinc-600"
                    />
                  </div>
                  <input
                    type="range"
                    min={250}
                    max={25000}
                    step={50}
                    value={effectivePreferenceMaxCharacters}
                    disabled={!isVerifiedAccount}
                    onChange={(event) =>
                      onPreferenceMaxCharactersChange(
                        Number.parseInt(event.target.value || "250", 10) || 250,
                      )
                    }
                    className="w-full accent-white disabled:cursor-not-allowed"
                  />
                  <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.16em] text-zinc-600">
                    <span>250</span>
                    <span>25,000</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
                  Preview Tweet
                </p>
                <p className="mt-2 text-sm text-zinc-400">
                  The preview updates as you change settings.
                </p>
              </div>

              <div className="rounded-3xl border border-white/10 bg-[#0F0F0F] p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-zinc-600 to-zinc-800 text-sm font-bold uppercase text-white">
                    {previewAvatarUrl ? (
                      <div
                        className="h-full w-full bg-cover bg-center"
                        style={{ backgroundImage: `url(${previewAvatarUrl})` }}
                        role="img"
                        aria-label={`${previewDisplayName || previewUsername} profile photo`}
                      />
                    ) : (
                      (previewDisplayName || previewUsername || "X").charAt(0)
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1">
                      <span className="truncate text-sm font-bold text-white">
                        {previewDisplayName}
                      </span>
                      {isVerifiedAccount ? (
                        <Image
                          src="/x-verified.svg"
                          alt="Verified account"
                          width={16}
                          height={16}
                          className="h-4 w-4 shrink-0"
                        />
                      ) : null}
                    </div>
                    <span className="text-xs text-zinc-500">@{previewUsername}</span>
                  </div>
                </div>

                <p className="mt-4 whitespace-pre-wrap text-[15px] leading-7 text-zinc-100">
                  {preferencesPreviewDraft}
                </p>

                <div className="mt-4 flex items-center gap-1.5 text-xs text-zinc-500">
                  <span>Just now</span>
                  <span>·</span>
                  <span className={preferencesPreviewCounter.toneClassName}>
                    {preferencesPreviewCounter.label}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
