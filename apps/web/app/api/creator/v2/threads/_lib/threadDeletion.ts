export interface ThreadDeletionDeps {
  deleteDraftCandidates(args: { threadId: string }): Promise<{ count: number }>;
  deleteThread(args: { threadId: string }): Promise<void>;
}

export interface ThreadDeletionResult {
  deletedDraftCandidateCount: number;
}

export async function deleteThreadWithDraftCandidates(
  threadId: string,
  deps: ThreadDeletionDeps,
): Promise<ThreadDeletionResult> {
  const deletedDraftCandidates = await deps.deleteDraftCandidates({ threadId });
  await deps.deleteThread({ threadId });

  return {
    deletedDraftCandidateCount: deletedDraftCandidates.count,
  };
}
