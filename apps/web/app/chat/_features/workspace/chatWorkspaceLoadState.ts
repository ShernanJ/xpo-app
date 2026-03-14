interface ValidationErrorLike {
  message: string;
}

interface WorkspaceLoadFailureLike {
  ok: false;
  code?: "MISSING_ONBOARDING_RUN" | "ONBOARDING_SOURCE_INVALID";
  errors: ValidationErrorLike[];
}

interface WorkspaceLoadSuccessLike<TData> {
  ok: true;
  data: TData;
}

type WorkspaceLoadResponseLike<TData> =
  | WorkspaceLoadSuccessLike<TData>
  | WorkspaceLoadFailureLike;

export interface WorkspaceLoadSuccess<TContextData, TContractData> {
  status: "success";
  contextData: TContextData;
  contractData: TContractData;
}

export interface WorkspaceLoadRetry {
  status: "retry_after_onboarding";
}

export interface WorkspaceLoadError {
  status: "error";
  errorMessage: string;
}

export type WorkspaceLoadResolution<TContextData, TContractData> =
  | WorkspaceLoadSuccess<TContextData, TContractData>
  | WorkspaceLoadRetry
  | WorkspaceLoadError;

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

export function resolveWorkspaceLoadState<TContextData, TContractData>(args: {
  contextResponseOk: boolean;
  contextStatus: number;
  contextData: WorkspaceLoadResponseLike<TContextData>;
  contractResponseOk: boolean;
  contractStatus: number;
  contractData: WorkspaceLoadResponseLike<TContractData>;
}): WorkspaceLoadResolution<TContextData, TContractData> {
  const shouldRetryOnboarding =
    isMissingOnboardingFailure(
      args.contextResponseOk,
      args.contextData,
      args.contextStatus,
    ) ||
    isMissingOnboardingFailure(
      args.contractResponseOk,
      args.contractData,
      args.contractStatus,
    ) ||
    isInvalidOnboardingSourceFailure(
      args.contextResponseOk,
      args.contextData,
      args.contextStatus,
    ) ||
    isInvalidOnboardingSourceFailure(
      args.contractResponseOk,
      args.contractData,
      args.contractStatus,
    );

  if (shouldRetryOnboarding) {
    return {
      status: "retry_after_onboarding",
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
