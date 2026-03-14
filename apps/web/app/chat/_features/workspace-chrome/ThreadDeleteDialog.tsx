"use client";

interface ThreadDeleteDialogProps {
  open: boolean;
  threadTitle: string | null;
  onOpenChange: (open: boolean) => void;
  onConfirmDelete: () => void;
}

export function ThreadDeleteDialog(props: ThreadDeleteDialogProps) {
  const { open, threadTitle, onOpenChange, onConfirmDelete } = props;

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-zinc-900 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        <div className="p-6">
          <h3 className="mb-2 text-lg font-semibold text-white">Delete chat?</h3>
          <p className="text-sm text-zinc-400">
            This will delete <strong className="text-zinc-200">&quot;{threadTitle}&quot;</strong>.
          </p>
        </div>
        <div className="flex justify-end gap-2 border-t border-white/10 bg-zinc-900/50 p-4">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirmDelete}
            className="flex items-center gap-2 rounded-lg bg-red-500/10 px-4 py-2 text-sm font-medium text-red-500 transition hover:bg-red-500 hover:text-white"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
