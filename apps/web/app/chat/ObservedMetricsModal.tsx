"use client";

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
  onClose: () => void;
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
  if (!props.open) {
    return null;
  }

  return (
    <div
      className="absolute inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/80 px-4 py-4 sm:items-center sm:py-8"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          props.onClose();
        }
      }}
    >
      <div className="relative my-auto flex w-full max-w-lg flex-col rounded-[1.75rem] border border-white/10 bg-[#0F0F0F] shadow-2xl">
        <div className="border-b border-white/10 px-6 py-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
            Observed Metrics
          </p>
          <h2 className="mt-3 text-2xl font-semibold text-white">
            Capture what happened after posting
          </h2>
          <p className="mt-3 text-sm leading-7 text-zinc-400">
            {props.candidateTitle
              ? `Log outcomes for "${props.candidateTitle}".`
              : "Log outcomes for the selected draft."}
          </p>
        </div>

        <div className="space-y-4 px-6 py-6">
          {props.errorMessage ? (
            <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
              {props.errorMessage}
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            {FIELDS.map((field) => (
              <label key={field.key} className="space-y-2">
                <span className="text-xs font-medium uppercase tracking-[0.14em] text-zinc-500">
                  {field.label}
                </span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={field.key === "followerDelta" ? undefined : 0}
                  value={props.value[field.key]}
                  onChange={(event) => props.onChange(field.key, event.target.value)}
                  placeholder={field.placeholder}
                  className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-600"
                />
                {field.required ? (
                  <p className="text-[11px] text-zinc-500">Required</p>
                ) : (
                  <p className="text-[11px] text-zinc-600">Optional</p>
                )}
              </label>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-white/10 px-6 py-5">
          <button
            type="button"
            onClick={props.onClose}
            className="rounded-full border border-white/10 px-4 py-2 text-sm text-zinc-300 transition hover:bg-white/[0.04] hover:text-white"
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
            className="rounded-full bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
          >
            {props.isSubmitting ? "Saving" : "Save Metrics"}
          </button>
        </div>
      </div>
    </div>
  );
}
