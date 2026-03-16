import { NextRequest, NextResponse } from "next/server";

import { getServerSession } from "@/lib/auth/serverSession";
import { resolveWorkspaceHandleForRequest } from "@/lib/workspaceHandle.server";
import {
  analyzeBannerForGrowth,
  BannerAnalysisError,
} from "@/lib/creator/bannerAnalysis";
import { validateBannerUpload } from "./route.logic";
import {
  enforceSessionMutationRateLimit,
  requireAllowedOrigin,
} from "@/lib/security/requestValidation";

export const runtime = "nodejs";

function isFileLike(value: FormDataEntryValue | null): value is File {
  return (
    typeof File !== "undefined" &&
    value instanceof File &&
    typeof value.arrayBuffer === "function"
  );
}

export async function POST(request: NextRequest) {
  const originError = requireAllowedOrigin(request);
  if (originError) {
    return originError;
  }

  const session = await getServerSession();
  if (!session?.user?.id) {
    return NextResponse.json(
      { ok: false, errors: [{ field: "auth", message: "Unauthorized" }] },
      { status: 401 },
    );
  }

  const workspaceHandle = await resolveWorkspaceHandleForRequest({
    request,
    session,
  });
  if (!workspaceHandle.ok) {
    return workspaceHandle.response;
  }

  const rateLimitError = await enforceSessionMutationRateLimit(request, {
    userId: session.user.id,
    scope: "creator:v2_banner_analysis",
    user: {
      limit: 8,
      windowMs: 10 * 60 * 1000,
      message: "Too many banner analysis requests. Please wait before trying again.",
    },
    ip: {
      limit: 20,
      windowMs: 10 * 60 * 1000,
      message: "Too many banner analysis requests from this network. Please wait before trying again.",
    },
  });
  if (rateLimitError) {
    return rateLimitError;
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      {
        ok: false,
        errors: [
          {
            field: "body",
            message: "Request body must be multipart/form-data with a banner image.",
          },
        ],
      },
      { status: 400 },
    );
  }

  const fileEntry = formData.get("banner") || formData.get("image");
  if (!isFileLike(fileEntry)) {
    return NextResponse.json(
      {
        ok: false,
        errors: [
          {
            field: "banner",
            message: "Upload a banner image using the `banner` form field.",
          },
        ],
      },
      { status: 400 },
    );
  }

  const validatedUpload = validateBannerUpload({
    fileName: fileEntry.name,
    mimeType: fileEntry.type,
    sizeBytes: fileEntry.size,
  });
  if (!validatedUpload.ok) {
    return NextResponse.json(
      {
        ok: false,
        errors: [
          {
            field: validatedUpload.field,
            message: validatedUpload.message,
          },
        ],
      },
      { status: validatedUpload.status },
    );
  }

  try {
    const buffer = Buffer.from(await fileEntry.arrayBuffer());
    const imageDataUrl = `data:${validatedUpload.mimeType};base64,${buffer.toString("base64")}`;
    const result = await analyzeBannerForGrowth({
      imageDataUrl,
    });

    return NextResponse.json({
      ok: true,
      data: {
        xHandle: workspaceHandle.xHandle,
        vision: result.vision,
        feedback: result.feedback,
        meta: result.meta,
      },
    });
  } catch (error) {
    if (error instanceof BannerAnalysisError) {
      return NextResponse.json(
        {
          ok: false,
          code: error.code,
          errors: [{ field: error.stage, message: error.message }],
        },
        { status: error.status },
      );
    }

    console.error("POST /api/creator/v2/banner-analysis failed", error);
    return NextResponse.json(
      {
        ok: false,
        errors: [
          {
            field: "server",
            message: "Failed to analyze the banner.",
          },
        ],
      },
      { status: 500 },
    );
  }
}
