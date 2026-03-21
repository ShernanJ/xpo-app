interface ValidationErrorLike {
  message: string;
}

interface WorkspaceLoadFailureLike {
  ok: false;
  code?: "MISSING_ONBOARDING_RUN" | "ONBOARDING_SOURCE_INVALID" | "SETUP_PENDING";
  retryable?: boolean;
  pollAfterMs?: number;
  errors: ValidationErrorLike[];
}

interface WorkspaceLoadSuccessLike<TData> {
  ok: true;
  data: TData;
}

type WorkspaceLoadResponseLike<TData> =
  | WorkspaceLoadSuccessLike<TData>
  | WorkspaceLoadFailureLike;

export interface WorkspaceBootstrapSuccessLike<TContextData, TContractData> {
  ok: true;
  data: {
    context: TContextData;
    contract: TContractData;
    backgroundSync?: {
      jobId: string;
      phase: "primer" | "archive";
    } | null;
  };
}

export type WorkspaceBootstrapResponseLike<TContextData, TContractData> =
  | WorkspaceBootstrapSuccessLike<TContextData, TContractData>
  | WorkspaceLoadFailureLike;

export interface WorkspaceLoadSuccess<TContextData, TContractData> {
  status: "success";
  contextData: TContextData;
  contractData: TContractData;
}

export interface WorkspaceLoadPending {
  status: "setup_pending";
  pollAfterMs: number;
}

export interface WorkspaceLoadError {
  status: "error";
  errorMessage: string;
}

export type WorkspaceLoadResolution<TContextData, TContractData> =
  | WorkspaceLoadSuccess<TContextData, TContractData>
  | WorkspaceLoadPending
  | WorkspaceLoadError;

export type ChatWorkspaceStartupStatus =
  | "shell_loading"
  | "setup_pending"
  | "workspace_ready"
  | "setup_timeout"
  | "error";

export interface ChatWorkspaceStartupState {
  status: ChatWorkspaceStartupStatus;
  pollAfterMs?: number;
}

function isMissingOnboardingFailure<TData>(
  responseOk: boolean,
  data: WorkspaceLoadResponseLike<TData>,
  expectedStatus: number,
): boolean {
  return (
    !data.ok &&
    (data.code === "MISSING_ONBOARDING_RUN" ||
      (!responseOk &&
        expectedStatus === 404 &&
        data.errors.some((error) =>
          error.message.toLowerCase().includes("no onboarding run"),
        )))
  );
}

function isInvalidOnboardingSourceFailure<TData>(
  responseOk: boolean,
  data: WorkspaceLoadResponseLike<TData>,
  expectedStatus: number,
): boolean {
  return (
    !data.ok &&
    (data.code === "ONBOARDING_SOURCE_INVALID" ||
      (!responseOk &&
        expectedStatus === 409 &&
        data.errors.some((error) =>
          error.message.toLowerCase().includes("fallback data"),
        )))
  );
}

function resolvePollAfterMs<TData>(
  data: WorkspaceLoadResponseLike<TData>,
  fallbackMs = 1200,
): number {
  if (!data.ok && typeof data.pollAfterMs === "number" && Number.isFinite(data.pollAfterMs)) {
    return Math.max(400, Math.min(5000, Math.floor(data.pollAfterMs)));
  }

  return fallbackMs;
}

function isSetupPendingFailure<TData>(
  responseOk: boolean,
  data: WorkspaceLoadResponseLike<TData>,
  expectedStatus: number,
): boolean {
  return (
    !data.ok &&
    (data.code === "SETUP_PENDING" ||
      (!responseOk && expectedStatus === 202 && data.retryable === true))
  );
}

export function resolveWorkspaceLoadState<TContextData, TContractData>(args: {
  contextResponseOk: boolean;
  contextStatus: number;
  contextData: WorkspaceLoadResponseLike<TContextData>;
  contractResponseOk: boolean;
  contractStatus: number;
  contractData: WorkspaceLoadResponseLike<TContractData>;
}): WorkspaceLoadResolution<TContextData, TContractData> {
  const shouldWaitForSetup =
    isSetupPendingFailure(
      args.contextResponseOk,
      args.contextData,
      args.contextStatus,
    ) ||
    isMissingOnboardingFailure(
      args.contextResponseOk,
      args.contextData,
      args.contextStatus,
    ) ||
    isMissingOnboardingFailure(
      args.contractResponseOk,
      args.contractData,
      args.contractStatus,
    );

  if (shouldWaitForSetup) {
    return {
      status: "setup_pending",
      pollAfterMs: resolvePollAfterMs(args.contextData),
    };
  }

  if (!args.contextResponseOk || !args.contextData.ok) {
    return {
      status: "error",
      errorMessage: args.contextData.ok
        ? "Failed to load the creator context."
        : args.contextData.errors[0]?.message ?? "Failed to load the creator context.",
    };
  }

  if (!args.contractResponseOk || !args.contractData.ok) {
    return {
      status: "error",
      errorMessage: args.contractData.ok
        ? "Failed to load the generation contract."
        : args.contractData.errors[0]?.message ??
          "Failed to load the generation contract.",
    };
  }

  return {
    status: "success",
    contextData: args.contextData.data,
    contractData: args.contractData.data,
  };
}

export function resolveWorkspaceBootstrapLoadState<TContextData, TContractData>(args: {
  responseOk: boolean;
  status: number;
  data: WorkspaceBootstrapResponseLike<TContextData, TContractData>;
}): WorkspaceLoadResolution<TContextData, TContractData> {
  const shouldWaitForSetup =
    isSetupPendingFailure(args.responseOk, args.data, args.status) ||
    isMissingOnboardingFailure(args.responseOk, args.data, args.status);

  if (shouldWaitForSetup) {
    return {
      status: "setup_pending",
      pollAfterMs: resolvePollAfterMs(args.data),
    };
  }

  if (isInvalidOnboardingSourceFailure(args.responseOk, args.data, args.status)) {
    return {
      status: "error",
      errorMessage: args.data.ok
        ? "Failed to load the chat workspace."
        : args.data.errors[0]?.message ?? "Failed to load the chat workspace.",
    };
  }

  if (!args.responseOk || !args.data.ok) {
    return {
      status: "error",
      errorMessage: args.data.ok
        ? "Failed to load the chat workspace."
        : args.data.errors[0]?.message ?? "Failed to load the chat workspace.",
    };
  }

  return {
    status: "success",
    contextData: args.data.data.context,
    contractData: args.data.data.contract,
  };
}
