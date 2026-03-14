"use client";

import { type KeyboardEvent, useId } from "react";

export type BillingCadence = "monthly" | "annual";

interface BillingCadenceToggleProps {
  selectedCadence: BillingCadence;
  onChange: (cadence: BillingCadence) => void;
}

const CADENCE_OPTIONS: Array<{
  value: BillingCadence;
  label: string;
}> = [
  { value: "monthly", label: "Monthly" },
  { value: "annual", label: "Annual" },
];

export function BillingCadenceToggle(props: BillingCadenceToggleProps) {
  const labelId = useId();

  const selectedIndex = CADENCE_OPTIONS.findIndex(
    (option) => option.value === props.selectedCadence,
  );

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return;
    }

    event.preventDefault();

    const offset = event.key === "ArrowRight" ? 1 : -1;
    const nextIndex =
      (selectedIndex + offset + CADENCE_OPTIONS.length) % CADENCE_OPTIONS.length;
    props.onChange(CADENCE_OPTIONS[nextIndex].value);
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <span id={labelId} className="sr-only">
        Billing cadence
      </span>
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        onKeyDown={handleKeyDown}
        className="relative inline-flex w-full max-w-[172px] rounded-full border border-white/20 bg-black/35 p-0.5"
      >
        <span
          className={`pointer-events-none absolute inset-y-0.5 left-0.5 w-[calc(50%-0.125rem)] rounded-full bg-white transition-transform duration-200 ${
            props.selectedCadence === "annual"
              ? "translate-x-full"
              : "translate-x-0"
          }`}
        />
        {CADENCE_OPTIONS.map((option) => {
          const isSelected = option.value === props.selectedCadence;

          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={isSelected}
              tabIndex={isSelected ? 0 : -1}
              onClick={() => props.onChange(option.value)}
              className={`relative z-10 flex-1 rounded-full px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.08em] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 ${
                isSelected
                  ? "text-black"
                  : "text-zinc-300 hover:text-white"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      <span className="pointer-events-none w-max whitespace-nowrap rounded-full border border-emerald-300/35 bg-emerald-400/10 px-1.5 py-[3px] text-[7px] font-semibold uppercase leading-none tracking-[0.1em] text-emerald-200 shadow-[0_0_14px_rgba(52,211,153,0.25)]">
        2 months free
      </span>
    </div>
  );
}
