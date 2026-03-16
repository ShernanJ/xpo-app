import { NextResponse } from "next/server";

const DEFAULT_JSON_BODY_LIMIT_BYTES = 128 * 1024;

function parseAllowedOrigins(raw: string | undefined): string[] {
  return (raw || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export function resolveAllowedOrigins(request: Request): string[] {
  const requestOrigin = new URL(request.url).origin;
  const configuredOrigins = [
    process.env.NEXT_PUBLIC_APP_URL?.trim(),
    process.env.APP_URL?.trim(),
    ...parseAllowedOrigins(process.env.ALLOWED_ORIGINS),
  ].filter((value): value is string => Boolean(value));

  return Array.from(new Set([requestOrigin, ...configuredOrigins]));
}

export function buildErrorResponse(args: {
  status: number;
  field: string;
  message: string;
  extras?: Record<string, unknown>;
}): Response {
  return NextResponse.json(
    {
      ok: false,
      errors: [{ field: args.field, message: args.message }],
      ...(args.extras ? args.extras : {}),
    },
    { status: args.status },
  );
}

export function requireAllowedOrigin(
  request: Request,
  options?: {
    field?: string;
    message?: string;
  },
): Response | null {
  const origin = request.headers.get("origin")?.trim();
  if (!origin) {
    return buildErrorResponse({
      status: 403,
      field: options?.field ?? "origin",
      message: options?.message ?? "Origin header is required.",
    });
  }

  const allowedOrigins = resolveAllowedOrigins(request);
  if (!allowedOrigins.includes(origin)) {
    return buildErrorResponse({
      status: 403,
      field: options?.field ?? "origin",
      message: options?.message ?? "Request origin is not allowed.",
    });
  }

  return null;
}

export async function parseJsonBody<T>(
  request: Request,
  options?: {
    maxBytes?: number;
    field?: string;
    allowEmpty?: boolean;
  },
): Promise<{ ok: true; value: T; rawText: string } | { ok: false; response: Response }> {
  const maxBytes = Math.max(1, options?.maxBytes ?? DEFAULT_JSON_BODY_LIMIT_BYTES);
  const contentLengthHeader = request.headers.get("content-length");
  const declaredLength = contentLengthHeader ? Number(contentLengthHeader) : Number.NaN;
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    return {
      ok: false,
      response: buildErrorResponse({
        status: 413,
        field: options?.field ?? "body",
        message: "Request body is too large.",
      }),
    };
  }

  let rawText: string;
  try {
    rawText = await request.text();
  } catch {
    return {
      ok: false,
      response: buildErrorResponse({
        status: 400,
        field: options?.field ?? "body",
        message: "Request body must be valid JSON.",
      }),
    };
  }

  if (Buffer.byteLength(rawText, "utf8") > maxBytes) {
    return {
      ok: false,
      response: buildErrorResponse({
        status: 413,
        field: options?.field ?? "body",
        message: "Request body is too large.",
      }),
    };
  }

  if (options?.allowEmpty && rawText.trim().length === 0) {
    return {
      ok: true,
      value: null as T,
      rawText,
    };
  }

  try {
    return {
      ok: true,
      value: JSON.parse(rawText) as T,
      rawText,
    };
  } catch {
    return {
      ok: false,
      response: buildErrorResponse({
        status: 400,
        field: options?.field ?? "body",
        message: "Request body must be valid JSON.",
      }),
    };
  }
}

export function getRequestIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for")?.trim();
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || "unknown";
  }

  return request.headers.get("x-real-ip")?.trim() || "unknown";
}
