import { buildErrorResponse } from "./requestValidation";

const WORKER_SECRET_HEADER = "x-worker-secret";

export function requireWorkerAuth(request: Request): Response | null {
  const configuredSecret = process.env.INTERNAL_WORKER_SECRET?.trim();
  if (!configuredSecret) {
    return buildErrorResponse({
      status: 503,
      field: "worker",
      message: "Worker secret is not configured.",
    });
  }

  const providedSecret =
    request.headers.get(WORKER_SECRET_HEADER)?.trim() ||
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ||
    "";
  if (providedSecret !== configuredSecret) {
    return buildErrorResponse({
      status: 401,
      field: "worker",
      message: "Worker authorization failed.",
    });
  }

  return null;
}
