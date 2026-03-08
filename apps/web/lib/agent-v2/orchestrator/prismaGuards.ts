type PrismaErrorMeta = {
  modelName?: unknown;
  table?: unknown;
};

export function isMissingDraftCandidateTableError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as {
    code?: unknown;
    message?: unknown;
    meta?: PrismaErrorMeta | null;
  };

  if (candidate.code !== "P2021") {
    return false;
  }

  const modelName =
    candidate.meta && typeof candidate.meta.modelName === "string"
      ? candidate.meta.modelName
      : null;
  const table =
    candidate.meta && typeof candidate.meta.table === "string"
      ? candidate.meta.table
      : null;
  const message = typeof candidate.message === "string" ? candidate.message : "";

  return (
    modelName === "DraftCandidate" ||
    table?.includes("DraftCandidate") === true ||
    message.includes("DraftCandidate")
  );
}
