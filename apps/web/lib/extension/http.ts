import { NextResponse } from "next/server.js";

export function buildExtensionUnauthorizedResponse() {
  return NextResponse.json(
    { ok: false, errors: [{ field: "auth", message: "Unauthorized" }] },
    { status: 401 },
  );
}

export function buildExtensionBadRequestResponse(field: string, message: string) {
  return NextResponse.json(
    { ok: false, errors: [{ field, message }] },
    { status: 400 },
  );
}

export function logExtensionRouteFailure(args: {
  route: string;
  error: unknown;
  userId?: string | null;
  details?: Record<string, unknown>;
}) {
  const errorDetails =
    args.error instanceof Error
      ? {
          name: args.error.name,
          message: args.error.message,
          stack: args.error.stack,
        }
      : args.error;

  console.error(`[extension:${args.route}] failure`, {
    userId: args.userId ?? null,
    ...(args.details || {}),
    error: errorDetails,
  });
}
