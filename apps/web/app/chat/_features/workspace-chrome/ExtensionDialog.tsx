"use client";

import { Dialog } from "@/components/ui/dialog";

interface ExtensionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ExtensionDialog(props: ExtensionDialogProps) {
  const { open, onOpenChange } = props;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      eyebrow="Companion App"
      title="Coming soon!"
      description="Companion App is in progress and will be available soon."
      panelClassName="relative my-auto w-full max-w-xl rounded-[1.75rem] border border-white/10 bg-[#0F0F0F] shadow-2xl focus:outline-none"
      contentClassName="px-6 pb-0 pt-6"
    >
      <div className="px-6 pb-6 pt-6">
        <span className="inline-flex items-center justify-center rounded-full border border-white/10 px-5 py-2.5 text-sm font-medium text-zinc-300">
          Coming soon!
        </span>
      </div>
    </Dialog>
  );
}
