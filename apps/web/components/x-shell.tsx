import type { ReactNode } from "react";

const scanlineStyle = {
  backgroundImage:
    "linear-gradient(to bottom, rgba(255,255,255,0.035) 1px, transparent 1px)",
  backgroundSize: "100% 6px",
};

interface XShellProps {
  children: ReactNode;
  footerContent?: ReactNode;
  backgroundOverlay?: ReactNode;
}

export function XShell({ children, footerContent, backgroundOverlay }: XShellProps) {
  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto min-h-screen max-w-7xl px-2 py-2 sm:px-4 sm:py-4">
        <div className="relative flex min-h-[calc(100vh-1rem)] flex-col overflow-hidden rounded-[2rem] border border-white/10 bg-[#050505] sm:min-h-[calc(100vh-2rem)]">
          <div className="pointer-events-none absolute inset-0 opacity-20" style={scanlineStyle} />
          {backgroundOverlay ? (
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
              {backgroundOverlay}
            </div>
          ) : null}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/10" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-white/10" />
          <div className="relative flex-1">{children}</div>
          <footer className="relative border-t border-white/10 px-6 py-4">
            {footerContent ?? (
              <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-center gap-3 text-[10px] font-medium uppercase tracking-[0.28em] text-zinc-500 sm:text-[11px]">
                <span>Dev</span>
                <span className="h-3 w-px bg-white/10" />
                <span>Growth Scan</span>
                <span className="h-3 w-px bg-white/10" />
                <span>Live</span>
                <span className="h-3 w-px bg-white/10" />
                <span>Agent Ready</span>
              </div>
            )}
          </footer>
        </div>
      </div>
    </main>
  );
}
