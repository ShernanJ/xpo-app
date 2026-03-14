"use client";

import { useRef } from "react";
import { Dialog } from "@/components/ui/dialog";

export interface ObservedMetricsFormState {
  likeCount: string;
  replyCount: string;
  profileClicks: string;
  followerDelta: string;
}

interface ObservedMetricsModalProps {
  open: boolean;
  candidateTitle: string | null;
  value: ObservedMetricsFormState;
  isSubmitting: boolean;
  errorMessage?: string | null;
  onChange: (field: keyof ObservedMetricsFormState, nextValue: string) => void;
  onOpenChange: (open: boolean) => void;
  onSubmit: () => void;
}

const FIELDS: Array<{
  key: keyof ObservedMetricsFormState;
  label: string;
  placeholder: string;
  required?: boolean;
}> = [
  { key: "likeCount", label: "Likes", placeholder: "0", required: true },
  { key: "replyCount", label: "Replies", placeholder: "0", required: true },
  { key: "profileClicks", label: "Profile Clicks", placeholder: "Optional" },
  { key: "followerDelta", label: "Follower Delta", placeholder: "Optional" },
];

export function ObservedMetricsModal(props: ObservedMetricsModalProps) {
  const firstInputRef = useRef<HTMLInputElement>(null);

  if (!props.open) {
    return null;
  }

  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      eyebrow="Observed Metrics"
      title="Capture what happened after posting"
      description={
        props.candidateTitle
          ? `Log outcomes for "${props.candidateTitle}".`
          : "Log outcomes for the selected draft."
      }
      initialFocusRef={firstInputRef}
      panelClassName="relative my-auto flex w-full max-w-lg flex-col rounded-[1.75rem] border border-white/10 bg-[#0F0F0F] shadow-2xl focus:outline-none"
      contentClassName="border-b border-white/10 px-6 py-5"
    >
      <div className="space-y-4 px-6 py-6">
        {props.errorMessage ? (
          <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
            {props.errorMessage}
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          {FIELDS.map((field, index) => {
            const inputId = `observed-metrics-${field.key}`;

            return (
              <label key={field.key} className="space-y-2" htmlFor={inputId}>
                <span className="text-xs font-medium uppercase tracking-[0.14em] text-zinc-500">
                  {field.label}
                </span>
                <input
                  id={inputId}
                  ref={index === 0 ? firstInputRef : undefined}
                  type="number"
                  inputMode="numeric"
                  min={field.key === "followerDelta" ? undefined : 0}
                  value={props.value[field.key]}
                  onChange={(event) => props.onChange(field.key, event.target.value)}
                  placeholder={field.placeholder}
                  aria-required={field.required === true}
                  className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-600 transition focus-visible:border-white/30 focus-visible:ring-2 focus-visible:ring-white/20"
                />
                {field.required ? (
                  <p className="text-[11px] text-zinc-500">Required</p>
                ) : (
                  <p className="text-[11px] text-zinc-600">Optional</p>
                )}
              </label>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-white/10 px-6 py-5">
        <button
          type="button"
          onClick={() => props.onOpenChange(false)}
          className="rounded-full border border-white/10 px-4 py-2 text-sm text-zinc-300 transition hover:bg-white/[0.04] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={props.onSubmit}
          disabled={
            props.isSubmitting ||
            !props.value.likeCount.trim() ||
            !props.value.replyCount.trim()
          }
          className="rounded-full bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
        >
          {props.isSubmitting ? "Saving" : "Save Metrics"}
        </button>
      </div>
    </Dialog>
  );
}
