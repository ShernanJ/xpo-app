"use client";

import { useRef } from "react";
import { ChevronDown, ChevronUp, Lightbulb, Trash2, X } from "lucide-react";

import { SplitDialog } from "@/components/ui/split-dialog";

import {
  formatSourceMaterialTypeLabel,
  type SourceMaterialAsset,
  type SourceMaterialDraftState,
  type SourceMaterialType,
} from "./sourceMaterialsState";

interface SourceMaterialsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSeedSourceMaterials: () => void;
  isSourceMaterialsLoading: boolean;
  isSourceMaterialsSaving: boolean;
  sourceMaterialsNotice: string | null;
  sourceMaterialDraft: SourceMaterialDraftState;
  onClearDraft: () => void;
  onApplyClaimExample: (example: string) => void;
  onDraftTitleChange: (value: string) => void;
  onDraftTypeChange: (type: SourceMaterialType) => void;
  onToggleDraftVerified: () => void;
  onDraftClaimsChange: (value: string) => void;
  sourceMaterialAdvancedOpen: boolean;
  onToggleSourceMaterialAdvancedOpen: () => void;
  onDraftTagsChange: (value: string) => void;
  onDraftSnippetsChange: (value: string) => void;
  onDraftDoNotClaimChange: (value: string) => void;
  onDeleteSourceMaterial: () => void;
  onSaveSourceMaterial: () => void;
  sourceMaterialsLibraryOpen: boolean;
  onToggleSourceMaterialsLibraryOpen: () => void;
  sourceMaterials: SourceMaterialAsset[];
  onSelectSourceMaterial: (asset: SourceMaterialAsset) => void;
}

interface SourceMaterialsLibraryPaneProps {
  isSourceMaterialsLoading: boolean;
  sourceMaterials: SourceMaterialAsset[];
  sourceMaterialDraftId: string | null;
  onSelectSourceMaterial: (asset: SourceMaterialAsset) => void;
  className?: string;
}

const FIELD_CLASS_NAME =
  "w-full rounded-lg border border-white/10 bg-[#101010] px-3 py-2.5 text-sm text-white outline-none transition focus:border-white/20 placeholder:text-zinc-600";

const CHIP_CLASS_NAME =
  "rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-zinc-400 transition hover:bg-white/[0.05] hover:text-white";

const SOURCE_MATERIAL_EXAMPLES = [
  "We cut onboarding friction by removing the product tour.",
  "Our hiring playbook is publish the work, ask for a demo, skip resume theater.",
  "The lesson: most activation problems are really clarity problems.",
] as const;

const SOURCE_MATERIAL_TYPES: SourceMaterialType[] = [
  "story",
  "playbook",
  "framework",
  "case_study",
];

function SourceMaterialsLibraryPane(props: SourceMaterialsLibraryPaneProps) {
  const {
    isSourceMaterialsLoading,
    sourceMaterials,
    sourceMaterialDraftId,
    onSelectSourceMaterial,
    className,
  } = props;

  return (
    <section
      className={[
        "rounded-[1.25rem] border border-white/10 bg-white/[0.02] p-4 sm:p-5",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">Saved stories and proof</p>
          <p className="mt-1 text-xs text-zinc-500">
            Pick an item to edit it, or start a new one on the right.
          </p>
        </div>
        <span className="rounded-full border border-white/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
          {sourceMaterials.length} total
        </span>
      </div>

      <div className="mt-5 space-y-2">
        {isSourceMaterialsLoading ? (
          <div className="rounded-[1.15rem] border border-white/10 bg-[#101010] px-4 py-5 text-sm text-zinc-400">
            Loading saved stories...
          </div>
        ) : sourceMaterials.length > 0 ? (
          sourceMaterials.map((asset) => {
            const isSelected = sourceMaterialDraftId === asset.id;

            return (
              <button
                key={asset.id}
                type="button"
                onClick={() => onSelectSourceMaterial(asset)}
                className={`w-full rounded-[1.15rem] border px-4 py-4 text-left transition ${
                  isSelected
                    ? "border-white/20 bg-white/[0.08] text-white"
                    : "border-white/10 bg-[#101010] text-zinc-300 hover:bg-white/[0.04]"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">{asset.title}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <span className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
                        {formatSourceMaterialTypeLabel(asset.type)}
                      </span>
                      {asset.verified ? (
                        <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-200">
                          Reusable
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-zinc-600" />
                </div>

                {asset.tags.length > 0 ? (
                  <p className="mt-3 text-xs leading-6 text-zinc-400">
                    {asset.tags.slice(0, 4).join(" · ")}
                  </p>
                ) : null}
              </button>
            );
          })
        ) : (
          <div className="rounded-[1.15rem] border border-dashed border-white/10 bg-[#101010] px-4 py-6 text-sm leading-7 text-zinc-400">
            Nothing saved yet. Add one real story or playbook on the right and Xpo will start
            reusing it.
          </div>
        )}
      </div>
    </section>
  );
}

export function SourceMaterialsDialog(props: SourceMaterialsDialogProps) {
  const {
    open,
    onOpenChange,
    onSeedSourceMaterials,
    isSourceMaterialsLoading,
    isSourceMaterialsSaving,
    sourceMaterialsNotice,
    sourceMaterialDraft,
    onClearDraft,
    onApplyClaimExample,
    onDraftTitleChange,
    onDraftTypeChange,
    onToggleDraftVerified,
    onDraftClaimsChange,
    sourceMaterialAdvancedOpen,
    onToggleSourceMaterialAdvancedOpen,
    onDraftTagsChange,
    onDraftSnippetsChange,
    onDraftDoNotClaimChange,
    onDeleteSourceMaterial,
    onSaveSourceMaterial,
    sourceMaterials,
    onSelectSourceMaterial,
  } = props;
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const areActionsDisabled = isSourceMaterialsLoading || isSourceMaterialsSaving;

  if (!open) {
    return null;
  }

  const libraryPane = (
    <SourceMaterialsLibraryPane
      isSourceMaterialsLoading={isSourceMaterialsLoading}
      sourceMaterials={sourceMaterials}
      sourceMaterialDraftId={sourceMaterialDraft.id}
      onSelectSourceMaterial={onSelectSourceMaterial}
    />
  );

  const editorPane = (
    <div className="space-y-4 pb-6">
      {sourceMaterialsNotice ? (
        <div className="rounded-[1.15rem] border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-zinc-200">
          {sourceMaterialsNotice}
        </div>
      ) : null}

      <section className="rounded-[1.25rem] border border-white/10 bg-white/[0.02] p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-white">
              {sourceMaterialDraft.id ? "Edit this saved item" : "Add something true"}
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              Keep it simple. One story, one lesson, or one repeatable playbook is enough.
            </p>
          </div>
          <button
            type="button"
            onClick={onClearDraft}
            className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:bg-white/[0.05] hover:text-white"
          >
            {sourceMaterialDraft.id ? "Add new" : "Clear"}
          </button>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {SOURCE_MATERIAL_EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => onApplyClaimExample(example)}
              className={CHIP_CLASS_NAME}
            >
              {example}
            </button>
          ))}
        </div>

        <div className="mt-5 space-y-5">
          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-300">Optional title</label>
            <input
              type="text"
              value={sourceMaterialDraft.title}
              onChange={(event) => onDraftTitleChange(event.target.value)}
              placeholder="Leave blank and Xpo will name it from the story"
              className={FIELD_CLASS_NAME}
            />
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-zinc-300">What kind of thing is this?</p>
            <div className="flex flex-wrap gap-2">
              {SOURCE_MATERIAL_TYPES.map((type) => {
                const isSelected = sourceMaterialDraft.type === type;

                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => onDraftTypeChange(type)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                      isSelected
                        ? "border-white bg-white text-black"
                        : "border-white/10 bg-white/[0.03] text-zinc-400 hover:bg-white/[0.05] hover:text-white"
                    }`}
                  >
                    {formatSourceMaterialTypeLabel(type)}
                  </button>
                );
              })}
            </div>
          </div>

          <button
            type="button"
            aria-pressed={sourceMaterialDraft.verified}
            onClick={onToggleDraftVerified}
            className={`flex items-center justify-between rounded-[1.15rem] border px-4 py-3 text-left transition ${
              sourceMaterialDraft.verified
                ? "border-white/20 bg-white/[0.06]"
                : "border-white/10 bg-[#101010] hover:bg-white/[0.04]"
            }`}
          >
            <div>
              <p className="text-sm font-medium text-zinc-200">
                Safe to reuse in first-person drafts
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                Leave this on when this is genuinely true and safe for Xpo to say as your
                story, lesson, or proof.
              </p>
            </div>
            <span
              className={`relative flex h-6 w-11 items-center rounded-full px-1 transition ${
                sourceMaterialDraft.verified ? "bg-emerald-500/70" : "bg-zinc-800"
              }`}
            >
              <span
                className={`h-4 w-4 rounded-full bg-white transition-transform ${
                  sourceMaterialDraft.verified ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </span>
          </button>

          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-300">
              What should Xpo remember?
            </label>
            <textarea
              value={sourceMaterialDraft.claimsInput}
              onChange={(event) => onDraftClaimsChange(event.target.value)}
              rows={6}
              placeholder={
                "Write it the way you'd say it.\nWe cut onboarding friction by removing the tour.\nI interviewed 30 users before shipping v1."
              }
              className={`${FIELD_CLASS_NAME} min-h-[9rem] leading-6`}
            />
            <p className="text-xs text-zinc-500">One or two lines is usually enough.</p>
          </div>

          <div className="rounded-[1.15rem] border border-white/10 bg-[#101010] p-4">
            <button
              type="button"
              onClick={onToggleSourceMaterialAdvancedOpen}
              className="flex w-full items-center justify-between gap-3 text-left"
            >
              <div>
                <p className="text-sm font-medium text-zinc-200">Advanced options</p>
                <p className="mt-1 text-xs text-zinc-500">
                  Add retrieval topics, proof snippets, or private guardrails only if you
                  need them.
                </p>
              </div>
              {sourceMaterialAdvancedOpen ? (
                <ChevronUp className="h-4 w-4 text-zinc-500" />
              ) : (
                <ChevronDown className="h-4 w-4 text-zinc-500" />
              )}
            </button>

            {sourceMaterialAdvancedOpen ? (
              <div className="mt-4 space-y-4 border-t border-white/10 pt-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-300">Topics</label>
                  <input
                    type="text"
                    value={sourceMaterialDraft.tagsInput}
                    onChange={(event) => onDraftTagsChange(event.target.value)}
                    placeholder="onboarding, activation, growth"
                    className={FIELD_CLASS_NAME}
                  />
                  <p className="text-xs text-zinc-500">
                    Comma-separated. Helps Xpo find the right story later.
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-300">
                    Helpful wording
                  </label>
                  <textarea
                    value={sourceMaterialDraft.snippetsInput}
                    onChange={(event) => onDraftSnippetsChange(event.target.value)}
                    rows={6}
                    placeholder={
                      "One line per snippet\nWe cut setup friction by simplifying the first-run path"
                    }
                    className={`${FIELD_CLASS_NAME} min-h-[9rem] leading-6`}
                  />
                  <p className="text-xs text-zinc-500">
                    Raw lines, proof, or phrasing worth remembering.
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-300">
                    Keep private / don&apos;t say
                  </label>
                  <textarea
                    value={sourceMaterialDraft.doNotClaimInput}
                    onChange={(event) => onDraftDoNotClaimChange(event.target.value)}
                    rows={5}
                    placeholder={
                      "One warning per line\nDo not claim exact revenue numbers\nDo not mention customer names"
                    }
                    className={`${FIELD_CLASS_NAME} min-h-[8rem] leading-6`}
                  />
                  <p className="text-xs text-zinc-500">
                    Use this for private details, unsupported numbers, or wording that
                    should never show up in a draft.
                  </p>
                </div>
              </div>
            ) : null}
          </div>

          {sourceMaterialDraft.id ? (
            <div className="flex items-center justify-between gap-4 rounded-[1.15rem] border border-red-500/20 bg-red-500/[0.05] px-4 py-3">
              <div>
                <p className="text-sm font-medium text-red-100">Delete this asset</p>
                <p className="mt-1 text-xs text-red-200/70">
                  This removes it from future grounding retrieval.
                </p>
              </div>
              <button
                type="button"
                onClick={onDeleteSourceMaterial}
                disabled={isSourceMaterialsSaving}
                className="inline-flex items-center gap-2 rounded-full border border-red-500/30 px-3 py-1.5 text-xs font-medium text-red-200 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </button>
            </div>
          ) : null}

          <div className="flex items-center justify-between gap-3 border-t border-white/10 pt-4">
            <p className="text-xs text-zinc-500">
              {sourceMaterialDraft.id
                ? "Update this if the wording changed."
                : "You only need one good entry to reduce guessing."}
            </p>
            <button
              type="button"
              onClick={onSaveSourceMaterial}
              disabled={areActionsDisabled}
              className="rounded-full border border-white/10 bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-zinc-700 disabled:text-zinc-400"
            >
              {isSourceMaterialsSaving
                ? "Saving"
                : sourceMaterialDraft.id
                  ? "Update"
                  : "Save for later"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );

  const headerSlot = (
    <div className="py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white">Saved Context</p>
          <p className="mt-1 text-[11px] text-zinc-500">
            Add one true story, lesson, or repeatable playbook so Xpo can reuse it without
            guessing.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onSeedSourceMaterials}
            disabled={areActionsDisabled}
            className="rounded-full border border-white/10 px-4 py-2 text-sm font-medium text-zinc-200 transition hover:bg-white/[0.05] hover:text-white disabled:cursor-not-allowed disabled:border-white/5 disabled:text-zinc-500"
          >
            Auto-fill what Xpo already knows
          </button>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={() => onOpenChange(false)}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-zinc-400 transition hover:bg-white/[0.05] hover:text-white"
            aria-label="Close saved context"
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
      title="Saved Context"
      description="Add one true story, lesson, or repeatable playbook so Xpo can reuse it without guessing."
      headerSlot={headerSlot}
      mobilePane="left"
      initialFocusRef={closeButtonRef}
      leftPane={
        <div className="flex h-full min-h-0 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
            <div className="space-y-4 pb-6">
              {libraryPane}
              <div className="md:hidden">{editorPane}</div>
            </div>
          </div>
        </div>
      }
      rightPane={
        <div className="hidden h-full min-h-0 flex-col md:flex">
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
            {editorPane}
          </div>
        </div>
      }
    />
  );
}
