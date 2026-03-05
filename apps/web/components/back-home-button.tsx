import Link from "next/link";
import { ArrowLeft } from "lucide-react";

interface BackHomeButtonProps {
  className?: string;
}

export function BackHomeButton({ className }: BackHomeButtonProps) {
  return (
    <Link
      href="/"
      className={[
        "inline-flex items-center gap-2 rounded-full border border-white/15 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-300 transition hover:bg-white/[0.05] hover:text-white",
        className ?? "",
      ].join(" ")}
    >
      <ArrowLeft className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>Back</span>
    </Link>
  );
}
