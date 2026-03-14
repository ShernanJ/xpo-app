"use client";

import { ChevronDown, ChevronUp, Lightbulb, Trash2 } from "lucide-react";

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
    sourceMaterialsLibraryOpen,
    onToggleSourceMaterialsLibraryOpen,
    sourceMaterials,
    onSelectSourceMaterial,
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
      <div className="relative my-auto flex w-full max-w-6xl flex-col rounded-[1.75rem] border border-white/10 bg-[#0F0F0F] shadow-2xl max-sm:max-h-[calc(100vh-2rem)] sm:max-h-[calc(100vh-4rem)]">
        <div className="flex items-start justify-between gap-4 border-b border-white/10 px-6 py-5">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
              Saved Context
            </p>
            <h2 className="mt-3 text-2xl font-semibold text-white">
              Review the stories and proof Xpo can reuse
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-zinc-400">
              Add one real story, lesson, or repeatable playbook. Xpo will reuse it in drafts so
              it stops guessing and stops asking again.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onSeedSourceMaterials}
              disabled={isSourceMaterialsLoading || isSourceMaterialsSaving}
              className="rounded-full border border-white/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-white transition hover:bg-white/[0.04] disabled:cursor-not-allowed disabled:border-white/5 disabled:text-zinc-500"
            >
              Auto-fill what Xpo already knows
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
          <div className="mb-4 rounded-3xl border border-white/10 bg-white/[0.03] p-5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
              Why this exists
            </p>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-zinc-300">
              Add a few things that are true about you or your work, and Xpo can reuse them in
              drafts without guessing.
            </p>
            <div className="mt-4 flex flex-wrap gap-2 text-xs text-zinc-400">
              <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5">
                a launch story
              </span>
              <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5">
                a repeatable playbook
              </span>
              <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5">
                a lesson you keep coming back to
              </span>
            </div>
          </div>

          {sourceMaterialsNotice ? (
            <div className="mb-4 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-zinc-200">
              {sourceMaterialsNotice}
            </div>
          ) : null}

          <div className="space-y-6">
            <div className="space-y-5 rounded-3xl border border-white/10 bg-white/[0.02] p-5">
              <div className="flex items-center justify-between gap-3">
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
                  className="rounded-full border border-white/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-300 transition hover:bg-white/[0.04]"
                >
                  {sourceMaterialDraft.id ? "Add new" : "Clear"}
                </button>
              </div>

              <div className="flex flex-wrap gap-2">
                {SOURCE_MATERIAL_EXAMPLES.map((example) => (
                  <button
                    key={example}
                    type="button"
                    onClick={() => onApplyClaimExample(example)}
                    className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-xs text-zinc-400 transition hover:bg-white/[0.04] hover:text-white"
                  >
                    {example}
                  </button>
                ))}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-300">Optional title</label>
                <input
                  type="text"
                  value={sourceMaterialDraft.title}
                  onChange={(event) => onDraftTitleChange(event.target.value)}
                  placeholder="Leave blank and Xpo will name it from the story"
                  className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-600"
                />
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium text-zinc-300">What kind of thing is this?</p>
                <div className="flex flex-wrap gap-2">
                  {SOURCE_MATERIAL_TYPES.map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => onDraftTypeChange(type)}
                      className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                        sourceMaterialDraft.type === type
                          ? "bg-white text-black"
                          : "border border-white/10 text-zinc-400 hover:bg-white/[0.04] hover:text-white"
                      }`}
                    >
                      {formatSourceMaterialTypeLabel(type)}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={onToggleDraftVerified}
                className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-left transition ${
                  sourceMaterialDraft.verified
                    ? "border-emerald-500/30 bg-emerald-500/10"
                    : "border-white/10 bg-black/20"
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
                <label className="text-sm font-medium text-zinc-300">What should Xpo remember?</label>
                <textarea
                  value={sourceMaterialDraft.claimsInput}
                  onChange={(event) => onDraftClaimsChange(event.target.value)}
                  rows={6}
                  placeholder={
                    "Write it the way you'd say it.\nWe cut onboarding friction by removing the tour.\nI interviewed 30 users before shipping v1."
                  }
                  className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm leading-6 text-white outline-none placeholder:text-zinc-600"
                />
                <p className="text-xs text-zinc-500">One or two lines is usually enough.</p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <button
                  type="button"
                  onClick={onToggleSourceMaterialAdvancedOpen}
                  className="flex w-full items-center justify-between gap-3 text-left"
                >
                  <div>
                    <p className="text-sm font-medium text-zinc-200">Advanced options</p>
                    <p className="mt-1 text-xs text-zinc-500">
                      Add retrieval topics, proof snippets, or private guardrails only if you need
                      them.
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
                        className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-600"
                      />
                      <p className="text-xs text-zinc-500">
                        Comma-separated. Helps Xpo find the right story later.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-zinc-300">Helpful wording</label>
                      <textarea
                        value={sourceMaterialDraft.snippetsInput}
                        onChange={(event) => onDraftSnippetsChange(event.target.value)}
                        rows={6}
                        placeholder={"One line per snippet\nWe cut setup friction by simplifying the first-run path"}
                        className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm leading-6 text-white outline-none placeholder:text-zinc-600"
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
                        className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm leading-6 text-white outline-none placeholder:text-zinc-600"
                      />
                      <p className="text-xs text-zinc-500">
                        Use this for private details, unsupported numbers, or wording that should
                        never show up in a draft.
                      </p>
                    </div>
                  </div>
                ) : null}
              </div>

              {sourceMaterialDraft.id ? (
                <div className="flex items-center justify-between gap-4 rounded-2xl border border-red-500/20 bg-red-500/[0.05] px-4 py-3">
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
                    className="inline-flex items-center gap-2 rounded-full border border-red-500/30 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-red-200 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-60"
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
                  disabled={isSourceMaterialsLoading || isSourceMaterialsSaving}
                  className="rounded-full bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
                >
                  {isSourceMaterialsSaving
                    ? "Saving"
                    : sourceMaterialDraft.id
                      ? "Update"
                      : "Save for later"}
                </button>
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-5">
              <button
                type="button"
                onClick={onToggleSourceMaterialsLibraryOpen}
                className="flex w-full items-center justify-between gap-3 text-left"
              >
                <div>
                  <p className="text-sm font-semibold text-white">Saved stories and proof</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    Open this only if you want to review, edit, or delete what Xpo already knows.
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="rounded-full border border-white/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
                    {sourceMaterials.length} total
                  </span>
                  {sourceMaterialsLibraryOpen ? (
                    <ChevronUp className="h-4 w-4 text-zinc-500" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-zinc-500" />
                  )}
                </div>
              </button>

              {!sourceMaterialsLibraryOpen && sourceMaterials.length > 0 ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {sourceMaterials.slice(0, 3).map((asset) => (
                    <button
                      key={asset.id}
                      type="button"
                      onClick={() => onSelectSourceMaterial(asset)}
                      className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-xs text-zinc-300 transition hover:bg-white/[0.04] hover:text-white"
                    >
                      {asset.title}
                    </button>
                  ))}
                </div>
              ) : null}

              {sourceMaterialsLibraryOpen ? (
                <div className="mt-5 space-y-2">
                  {isSourceMaterialsLoading ? (
                    <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-5 text-sm text-zinc-400">
                      Loading saved stories...
                    </div>
                  ) : sourceMaterials.length > 0 ? (
                    sourceMaterials.map((asset) => {
                      const isSelected = sourceMaterialDraft.id === asset.id;

                      return (
                        <button
                          key={asset.id}
                          type="button"
                          onClick={() => onSelectSourceMaterial(asset)}
                          className={`w-full rounded-2xl border px-4 py-4 text-left transition ${
                            isSelected
                              ? "border-white/20 bg-white/[0.08] text-white"
                              : "border-white/10 bg-black/20 text-zinc-300 hover:bg-white/[0.04]"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-white">
                                {asset.title}
                              </p>
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
                    <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 px-4 py-6 text-sm leading-7 text-zinc-400">
                      Nothing saved yet. Add one real story or playbook above and Xpo will start
                      reusing it.
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
