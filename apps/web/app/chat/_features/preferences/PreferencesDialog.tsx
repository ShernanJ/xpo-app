"use client";

import {
  type ChangeEventHandler,
  type KeyboardEventHandler,
  type ReactNode,
  useRef,
} from "react";
import Image from "next/image";
import {
  Ban,
  BarChart3,
  List,
  Settings2,
  Smile,
  Type,
  X,
  type LucideIcon,
} from "lucide-react";

import { SplitDialog } from "@/components/ui/split-dialog";

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

interface PreferencesOptionChipGroupProps<TValue extends string> {
  label: string;
  icon: LucideIcon;
  value: TValue;
  options: Array<{ label: string; value: TValue }>;
  onChange: (value: TValue) => void;
}

interface PreferencesSectionProps {
  title: string;
  description: string;
  icon: ReactNode;
  children: ReactNode;
}

interface PreferencesToggleCardProps {
  title: string;
  icon: LucideIcon;
  pressed: boolean;
  onClick: () => void;
}

interface PreferencesPreviewCardProps {
  previewDisplayName: string;
  previewUsername: string;
  previewAvatarUrl: string | null;
  preferencesPreviewDraft: string;
  preferencesPreviewCounter: DraftCounterMeta;
  isVerifiedAccount: boolean;
}

const FIELD_CLASS_NAME =
  "w-full rounded-lg border border-white/10 bg-[#101010] px-3 py-2.5 text-sm text-white outline-none transition focus:border-white/20 disabled:cursor-not-allowed disabled:text-zinc-600";

const CHIP_BASE_CLASS_NAME =
  "rounded-full border px-3 py-1.5 text-xs font-medium transition";

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

function renderPreviewAvatar(displayName: string, username: string, avatarUrl: string | null) {
  if (avatarUrl) {
    return (
      <div
        className="h-full w-full bg-cover bg-center"
        style={{ backgroundImage: `url(${avatarUrl})` }}
        role="img"
        aria-label={`${displayName || username} profile photo`}
      />
    );
  }

  return (displayName || username || "X").charAt(0).toUpperCase();
}

function PreferencesSection(props: PreferencesSectionProps) {
  const { title, description, icon, children } = props;

  return (
    <section className="rounded-[1.25rem] border border-white/10 bg-white/[0.02] p-4 sm:p-5">
      <div className="flex items-center gap-3">
        {icon}
        <div>
          <p className="text-sm font-semibold text-white">{title}</p>
          <p className="text-xs text-zinc-500">{description}</p>
        </div>
      </div>

      <div className="mt-5 space-y-5">{children}</div>
    </section>
  );
}

function PreferencesOptionChipGroup<TValue extends string>(
  props: PreferencesOptionChipGroupProps<TValue>,
) {
  const { label, icon: Icon, value, options, onChange } = props;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium text-zinc-300">
        <Icon className="h-4 w-4 text-zinc-500" />
        <span>{label}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const isSelected = value === option.value;

          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={isSelected}
              onClick={() => onChange(option.value)}
              className={`${CHIP_BASE_CLASS_NAME} ${
                isSelected
                  ? "border-white bg-white text-black"
                  : "border-white/10 bg-white/[0.03] text-zinc-400 hover:bg-white/[0.05] hover:text-white"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PreferencesToggleCard(props: PreferencesToggleCardProps) {
  const { title, icon: Icon, pressed, onClick } = props;

  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`flex items-center justify-between rounded-[1.15rem] border px-4 py-3 text-left transition ${
        pressed
          ? "border-white/20 bg-white/[0.06]"
          : "border-white/10 bg-[#101010] hover:bg-white/[0.04]"
      }`}
    >
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-zinc-500" />
        <span className="text-sm text-zinc-300">{title}</span>
      </div>
      <span
        className={`relative flex h-6 w-11 items-center rounded-full px-1 transition ${
          pressed ? "bg-emerald-500/70" : "bg-zinc-800"
        }`}
      >
        <span
          className={`h-4 w-4 rounded-full bg-white transition-transform ${
            pressed ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </span>
    </button>
  );
}

function PreferencesPreviewCard(props: PreferencesPreviewCardProps) {
  const {
    previewDisplayName,
    previewUsername,
    previewAvatarUrl,
    preferencesPreviewDraft,
    preferencesPreviewCounter,
    isVerifiedAccount,
  } = props;

  return (
    <article className="rounded-[1.5rem] border border-white/10 bg-black/40 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-zinc-600 to-zinc-800 text-sm font-bold uppercase text-white">
          {renderPreviewAvatar(previewDisplayName, previewUsername, previewAvatarUrl)}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-sm font-semibold text-white">{previewDisplayName}</span>
            {isVerifiedAccount ? (
              <Image
                src="/x-verified.svg"
                alt="Verified account"
                width={16}
                height={16}
                className="h-4 w-4 shrink-0"
              />
            ) : null}
            <span className="truncate text-xs text-zinc-500">@{previewUsername}</span>
            <span className="text-xs text-zinc-600">·</span>
            <span className="text-xs text-zinc-500">Just now</span>
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
    </article>
  );
}

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
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const isSaveDisabled = isPreferencesLoading || isPreferencesSaving;

  if (!open) {
    return null;
  }

  const previewCard = (
    <PreferencesPreviewCard
      previewDisplayName={previewDisplayName}
      previewUsername={previewUsername}
      previewAvatarUrl={previewAvatarUrl}
      preferencesPreviewDraft={preferencesPreviewDraft}
      preferencesPreviewCounter={preferencesPreviewCounter}
      isVerifiedAccount={isVerifiedAccount}
    />
  );

  const headerSlot = (
    <div className="py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white">Preferences</p>
          <p className="mt-1 text-[11px] text-zinc-500">
            Set defaults for formatting, tone, and verified-only character controls.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onSave}
            disabled={isSaveDisabled}
            className="rounded-full border border-white/10 bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-zinc-700 disabled:text-zinc-400"
          >
            {isPreferencesSaving ? "Saving" : "Save"}
          </button>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={() => onOpenChange(false)}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-zinc-400 transition hover:bg-white/[0.05] hover:text-white"
            aria-label="Close preferences"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <SplitDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Preferences"
      description="Set defaults for formatting, tone, and verified-only character controls. The preview updates instantly and does not need the model."
      headerSlot={headerSlot}
      mobilePane="left"
      initialFocusRef={closeButtonRef}
      panelClassName="fixed inset-x-2 bottom-2 top-2 flex flex-col overflow-hidden rounded-[1.5rem] border border-white/10 bg-[#0B0B0B] shadow-[0_32px_120px_rgba(0,0,0,0.58)] focus:outline-none sm:inset-x-4 sm:bottom-4 sm:top-4 sm:rounded-[1.75rem] md:inset-x-auto md:bottom-4 md:left-1/2 md:top-4 md:w-[calc(100dvw-32px)] md:max-w-[1320px] md:-translate-x-1/2 md:translate-y-0 lg:w-5/6"
      leftPane={
        <div className="flex h-full min-h-0 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
            <div className="space-y-4 pb-6">
              <PreferencesSection
                title="Core Settings"
                description="Quick defaults for formatting and tone."
                icon={<Settings2 className="h-4 w-4 text-zinc-500" />}
              >
                <PreferencesOptionChipGroup
                  label="Default casing"
                  icon={Type}
                  value={preferenceCasing}
                  options={CASING_OPTIONS}
                  onChange={onPreferenceCasingChange}
                />

                <PreferencesOptionChipGroup
                  label="Bullet style"
                  icon={List}
                  value={preferenceBulletStyle}
                  options={BULLET_STYLE_OPTIONS}
                  onChange={onPreferenceBulletStyleChange}
                />

                <PreferencesOptionChipGroup
                  label="Writing goal"
                  icon={BarChart3}
                  value={preferenceWritingMode}
                  options={WRITING_MODE_OPTIONS}
                  onChange={onPreferenceWritingModeChange}
                />

                <div className="grid gap-3 sm:grid-cols-2">
                  <PreferencesToggleCard
                    title="Use emojis"
                    icon={Smile}
                    pressed={preferenceUseEmojis}
                    onClick={onTogglePreferenceUseEmojis}
                  />
                  <PreferencesToggleCard
                    title="Allow profanity"
                    icon={Ban}
                    pressed={preferenceAllowProfanity}
                    onClick={onTogglePreferenceAllowProfanity}
                  />
                </div>

                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm font-medium text-zinc-300">
                    <Ban className="h-4 w-4 text-zinc-500" />
                    <span>Blacklist words or emojis</span>
                  </label>
                  <div className="rounded-[1.15rem] border border-white/10 bg-[#101010] px-3 py-3">
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
              </PreferencesSection>

              <PreferencesSection
                title="Verified Settings"
                description="Custom max length only applies to verified accounts. Unverified users are capped to 250 characters."
                icon={
                  isVerifiedAccount ? (
                    <Image
                      src="/x-verified.svg"
                      alt="Verified settings"
                      width={16}
                      height={16}
                      className="h-4 w-4"
                    />
                  ) : (
                    <BarChart3 className="h-4 w-4 text-zinc-500" />
                  )
                }
              >
                <div className="space-y-4">
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
                      className={`${FIELD_CLASS_NAME} w-28 text-right`}
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
              </PreferencesSection>

              <section className="space-y-3 md:hidden">
                <div>
                  <p className="text-sm font-semibold text-white">Preview</p>
                  <p className="mt-1 text-[11px] text-zinc-500">
                    The preview updates as you change settings.
                  </p>
                </div>
                {previewCard}
              </section>
            </div>
          </div>
        </div>
      }
      rightPane={
        <div className="hidden h-full min-h-0 flex-col md:flex">
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
            <div className="space-y-3">
              <div>
                <p className="text-sm font-semibold text-white">Preview</p>
                <p className="mt-1 text-[11px] text-zinc-500">
                  The preview updates as you change settings.
                </p>
              </div>
              <div className="md:block">{previewCard}</div>
            </div>
          </div>
        </div>
      }
    />
  );
}
