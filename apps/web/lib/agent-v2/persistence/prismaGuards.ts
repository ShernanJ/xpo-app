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

export function isMissingSourceMaterialAssetTableError(error: unknown): boolean {
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
    modelName === "SourceMaterialAsset" ||
    table?.includes("SourceMaterialAsset") === true ||
    message.includes("SourceMaterialAsset")
  );
}

export function isMissingProductEventTableError(error: unknown): boolean {
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
    modelName === "ProductEvent" ||
    table?.includes("ProductEvent") === true ||
    message.includes("ProductEvent")
  );
}

export function isMissingChatTurnControlTableError(error: unknown): boolean {
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
    modelName === "ChatTurnControl" ||
    table?.includes("ChatTurnControl") === true ||
    message.includes("ChatTurnControl")
  );
}

export function isMissingRequestRateLimitBucketTableError(error: unknown): boolean {
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
    modelName === "RequestRateLimitBucket" ||
    table?.includes("RequestRateLimitBucket") === true ||
    message.includes("RequestRateLimitBucket")
  );
}
