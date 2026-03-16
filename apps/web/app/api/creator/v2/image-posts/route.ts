import { NextRequest, NextResponse } from "next/server";

import { getServerSession } from "@/lib/auth/serverSession";
import {
  generateImageToPostOptions,
  ImageToPostGenerationError,
} from "@/lib/creator/imagePostGeneration";
import { resolveWorkspaceHandleForRequest } from "@/lib/workspaceHandle.server";
import {
  enforceSessionMutationRateLimit,
  requireAllowedOrigin,
} from "@/lib/security/requestValidation";

import { fileToDataUrl, parseImageToPostFormData } from "./route.logic";

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
    scope: "creator:v2_image_posts",
    user: {
      limit: 8,
      windowMs: 10 * 60 * 1000,
      message: "Too many image-to-post requests. Please wait before trying again.",
    },
    ip: {
      limit: 20,
      windowMs: 10 * 60 * 1000,
      message: "Too many image-to-post requests from this network. Please wait before trying again.",
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
        errors: [{ field: "body", message: "Request body must be valid multipart form data." }],
      },
      { status: 400 },
    );
  }

  const parsedInput = parseImageToPostFormData(formData);
  if (!parsedInput.ok) {
    return NextResponse.json(
      {
        ok: false,
        errors: parsedInput.errors,
      },
      { status: 400 },
    );
  }

  try {
    const result = await generateImageToPostOptions({
      imageDataUrl: await fileToDataUrl(parsedInput.data.imageFile),
      idea: parsedInput.data.idea,
    });

    return NextResponse.json({
      ok: true,
      data: {
        xHandle: workspaceHandle.xHandle,
        ...result,
      },
    });
  } catch (error) {
    if (error instanceof ImageToPostGenerationError) {
      return NextResponse.json(
        {
          ok: false,
          errors: [{ field: "generation", message: error.message }],
        },
        { status: 502 },
      );
    }

    throw error;
  }
}
