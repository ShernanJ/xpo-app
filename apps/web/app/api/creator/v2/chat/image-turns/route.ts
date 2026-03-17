import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getServerSession } from "@/lib/auth/serverSession";
import {
  resolveOwnedThreadForWorkspace,
  resolveWorkspaceHandleForRequest,
} from "@/lib/workspaceHandle.server";
import {
  buildImageAssistantDescription,
  buildImageIdeationQuickReplies,
  buildImagePostConfirmationQuickReplies,
  buildImagePostSupportAsset,
} from "@/lib/chat/imageTurnShared";
import { buildDirectionHandoffCopy } from "@/lib/agent-v2/responses/ideationShellCopy";
import {
  analyzeImageVisualContext,
  generateImagePostAngles,
  ImageToPostGenerationError,
} from "@/lib/creator/imagePostGeneration";
import {
  buildErrorResponse,
  parseJsonBody,
  requireAllowedOrigin,
} from "@/lib/security/requestValidation";
import {
  enforceSessionMutationRateLimit,
} from "@/lib/security/requestValidation";

import {
  buildAssistantImageTurnMessageData,
  buildAttachmentRefsFromAsset,
  buildImageTurnContext,
  buildUserImageMessageData,
  createChatMediaAssetRecord,
  fileToBytes,
  parseImageTurnConfirmationBody,
  parseImageTurnContext,
  parseInitialImageTurnFormData,
  parsePreviewDataUrl,
  serializeStoredChatMessage,
} from "./route.logic";

async function loadOwnedThread(args: {
  request: NextRequest;
  session: { user: { id: string } };
  threadId: string;
}) {
  const workspaceHandle = await resolveWorkspaceHandleForRequest({
    request: args.request,
    session: args.session,
  });
  if (!workspaceHandle.ok) {
    return workspaceHandle;
  }

  const ownedThread = await resolveOwnedThreadForWorkspace({
    threadId: args.threadId,
    userId: args.session.user.id,
    xHandle: workspaceHandle.xHandle,
  });
  if (!ownedThread.ok) {
    return ownedThread;
  }

  return {
    ok: true as const,
    workspaceHandle,
    thread: ownedThread.thread,
  };
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

  const rateLimitError = await enforceSessionMutationRateLimit(request, {
    userId: session.user.id,
    scope: "creator:v2_chat_image_turns",
    user: {
      limit: 12,
      windowMs: 10 * 60 * 1000,
      message: "Too many image chat requests. Please wait before trying again.",
    },
    ip: {
      limit: 24,
      windowMs: 10 * 60 * 1000,
      message: "Too many image chat requests from this network. Please wait before trying again.",
    },
  });
  if (rateLimitError) {
    return rateLimitError;
  }

  try {
    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data")) {
      return await handleInitialImageTurn({ request, session });
    }

    return await handleImageTurnConfirmation({ request, session });
  } catch (error) {
    if (error instanceof ImageToPostGenerationError) {
      return buildErrorResponse({
        status: 502,
        field: "generation",
        message: error.message,
      });
    }

    console.error("POST image-turns error:", error);
    return buildErrorResponse({
      status: 500,
      field: "server",
      message: "Failed to handle the image turn.",
    });
  }
}

async function handleInitialImageTurn(args: {
  request: NextRequest;
  session: { user: { id: string } };
}) {
  let formData: FormData;
  try {
    formData = await args.request.formData();
  } catch {
    return buildErrorResponse({
      status: 400,
      field: "body",
      message: "Request body must be valid multipart form data.",
    });
  }

  const parsedInput = parseInitialImageTurnFormData(formData);
  if (!parsedInput.ok) {
    return NextResponse.json(
      { ok: false, errors: parsedInput.errors },
      { status: 400 },
    );
  }

  const ownedThread = await loadOwnedThread({
    request: args.request,
    session: args.session,
    threadId: parsedInput.data.threadId,
  });
  if (!ownedThread.ok) {
    return ownedThread.response;
  }

  const imageBytes = await fileToBytes(parsedInput.data.imageFile);
  const previewPayload = parsePreviewDataUrl(parsedInput.data.previewDataUrl);
  const visualResult = await analyzeImageVisualContext({
    imageDataUrl: `data:${parsedInput.data.imageFile.type};base64,${imageBytes.toString("base64")}`,
  });
  const supportAsset = buildImagePostSupportAsset(visualResult.visualContext);
  const mediaAssetSeed = createChatMediaAssetRecord({
    mimeType: parsedInput.data.imageFile.type || "application/octet-stream",
    width: parsedInput.data.width,
    height: parsedInput.data.height,
    originalName: parsedInput.data.imageFile.name || null,
  });
  const mediaAttachments = buildAttachmentRefsFromAsset(mediaAssetSeed);

  const isImageOnlyTurn = !parsedInput.data.idea;
  const assistantReply = isImageOnlyTurn
    ? buildImageAssistantDescription(visualResult.visualContext)
    : buildDirectionHandoffCopy({
        source: "image_ideation",
        artifact: "post",
        seed: parsedInput.data.idea || visualResult.visualContext.primary_subject || "image",
      });
  const quickReplies = isImageOnlyTurn
    ? buildImagePostConfirmationQuickReplies({
        imageAssetId: mediaAssetSeed.id,
      })
    : buildImageIdeationQuickReplies({
        angles:
          (
            await generateImagePostAngles({
              visualContext: visualResult.visualContext,
              idea: parsedInput.data.idea,
            })
          ).angles,
        supportAsset,
        imageAssetId: mediaAssetSeed.id,
      });
  const angles = quickReplies
    .filter((quickReply) => quickReply.kind === "ideation_angle")
    .map((quickReply) => ({
      title: quickReply.angle || quickReply.label,
    }));
  const imageTurnContext = buildImageTurnContext({
    imageAssetId: mediaAssetSeed.id,
    visualContext: visualResult.visualContext,
    supportAsset,
    mediaAttachments,
    awaitingConfirmation: isImageOnlyTurn,
  });

  const { userMessage, assistantMessage } = await prisma.$transaction(async (tx) => {
    await tx.chatMediaAsset.create({
      data: {
        id: mediaAssetSeed.id,
        userId: args.session.user.id,
        threadId: ownedThread.thread.id,
        kind: "image",
        originalName: mediaAssetSeed.originalName ?? null,
        mimeType: mediaAssetSeed.mimeType,
        previewMimeType: previewPayload?.mimeType ?? null,
        sizeBytes: parsedInput.data.imageFile.size,
        width: mediaAssetSeed.width ?? null,
        height: mediaAssetSeed.height ?? null,
        bytes: Uint8Array.from(imageBytes),
        previewBytes: previewPayload?.bytes
          ? Uint8Array.from(previewPayload.bytes)
          : null,
      },
    });

    const nextUserMessage = await tx.chatMessage.create({
      data: {
        threadId: ownedThread.thread.id,
        role: "user",
        content: parsedInput.data.idea ?? "",
        data: buildUserImageMessageData({
          mediaAttachments,
        }) as never,
      },
    });

    await tx.chatMediaAsset.update({
      where: { id: mediaAssetSeed.id },
      data: {
        messageId: nextUserMessage.id,
      },
    });

    const nextAssistantMessage = await tx.chatMessage.create({
      data: {
        threadId: ownedThread.thread.id,
        role: "assistant",
        content: assistantReply,
        data: buildAssistantImageTurnMessageData({
          reply: assistantReply,
          outputShape: isImageOnlyTurn ? "coach_question" : "ideation_angles",
          surfaceMode: isImageOnlyTurn ? "ask_one_question" : "offer_options",
          quickReplies,
          angles,
          ideationFormatHint: isImageOnlyTurn ? undefined : "post",
          supportAsset,
          imageTurnContext,
        }) as never,
      },
    });

    await tx.chatThread.update({
      where: { id: ownedThread.thread.id },
      data: {
        updatedAt: new Date(),
      },
    });

    return {
      userMessage: nextUserMessage,
      assistantMessage: nextAssistantMessage,
    };
  });

  return NextResponse.json({
    ok: true,
    data: {
      threadId: ownedThread.thread.id,
      userMessage: serializeStoredChatMessage({
        message: userMessage,
      }),
      assistantMessage: serializeStoredChatMessage({
        message: assistantMessage,
      }),
    },
  });
}

async function handleImageTurnConfirmation(args: {
  request: NextRequest;
  session: { user: { id: string } };
}) {
  const bodyResult = await parseJsonBody<Record<string, unknown>>(args.request, {
    maxBytes: 64 * 1024,
  });
  if (!bodyResult.ok) {
    return bodyResult.response;
  }

  const parsedBody = parseImageTurnConfirmationBody(bodyResult.value);
  if (!parsedBody.ok) {
    return NextResponse.json(
      { ok: false, errors: parsedBody.errors },
      { status: 400 },
    );
  }

  const ownedThread = await loadOwnedThread({
    request: args.request,
    session: args.session,
    threadId: parsedBody.data.threadId,
  });
  if (!ownedThread.ok) {
    return ownedThread.response;
  }

  const sourceAssistantMessage = await prisma.chatMessage.findFirst({
    where: {
      id: parsedBody.data.assistantMessageId,
      threadId: ownedThread.thread.id,
      role: "assistant",
    },
  });
  if (!sourceAssistantMessage) {
    return buildErrorResponse({
      status: 404,
      field: "assistantMessageId",
      message: "Image confirmation prompt not found.",
    });
  }

  const sourceRecord =
    sourceAssistantMessage.data &&
    typeof sourceAssistantMessage.data === "object" &&
    !Array.isArray(sourceAssistantMessage.data)
      ? (sourceAssistantMessage.data as Record<string, unknown>)
      : null;
  const imageTurnContext = parseImageTurnContext(sourceRecord?.imageTurnContext);
  if (!imageTurnContext?.awaitingConfirmation) {
    return buildErrorResponse({
      status: 409,
      field: "assistantMessageId",
      message: "That image prompt is no longer waiting on confirmation.",
    });
  }

  const userMessageContent =
    parsedBody.data.displayUserMessage ??
    (parsedBody.data.decision === "confirm" ? "yes, write a post" : "not now");

  if (parsedBody.data.decision === "decline") {
    const declineReply =
      "No problem. If you want, I can still turn that image into post directions later.";
    const nextImageTurnContext = {
      ...imageTurnContext,
      awaitingConfirmation: false,
    };
    const { userMessage, assistantMessage } = await prisma.$transaction(async (tx) => {
      const nextUserMessage = await tx.chatMessage.create({
        data: {
          threadId: ownedThread.thread.id,
          role: "user",
          content: userMessageContent,
          data: {} as never,
        },
      });
      const nextAssistantMessage = await tx.chatMessage.create({
        data: {
          threadId: ownedThread.thread.id,
          role: "assistant",
          content: declineReply,
          data: buildAssistantImageTurnMessageData({
            reply: declineReply,
            outputShape: "coach_question",
            surfaceMode: "ask_one_question",
            quickReplies: [],
            supportAsset: imageTurnContext.supportAsset,
            imageTurnContext: nextImageTurnContext,
          }) as never,
        },
      });
      await tx.chatThread.update({
        where: { id: ownedThread.thread.id },
        data: {
          updatedAt: new Date(),
        },
      });
      return {
        userMessage: nextUserMessage,
        assistantMessage: nextAssistantMessage,
      };
    });

    return NextResponse.json({
      ok: true,
      data: {
        threadId: ownedThread.thread.id,
        userMessage: serializeStoredChatMessage({ message: userMessage }),
        assistantMessage: serializeStoredChatMessage({ message: assistantMessage }),
      },
    });
  }

  const imageAsset = await prisma.chatMediaAsset.findFirst({
    where: {
      id: imageTurnContext.imageAssetId,
      userId: args.session.user.id,
      threadId: ownedThread.thread.id,
    },
  });
  if (!imageAsset) {
    return buildErrorResponse({
      status: 404,
      field: "imageAssetId",
      message: "Stored image for this prompt was not found.",
    });
  }

  const angleResult = await generateImagePostAngles({
    visualContext: imageTurnContext.visualContext,
    idea: null,
  });
  const quickReplies = buildImageIdeationQuickReplies({
    angles: angleResult.angles,
    supportAsset: imageTurnContext.supportAsset,
    imageAssetId: imageTurnContext.imageAssetId,
  });
  const angles = quickReplies.map((quickReply) => ({
    title: quickReply.angle || quickReply.label,
  }));
  const reply = buildDirectionHandoffCopy({
    source: "image_ideation",
    artifact: "post",
    seed:
      imageTurnContext.visualContext.primary_subject ||
      imageTurnContext.visualContext.setting ||
      imageTurnContext.imageAssetId,
  });
  const ideationContext = {
    ...imageTurnContext,
    awaitingConfirmation: false,
  };

  const { userMessage, assistantMessage } = await prisma.$transaction(async (tx) => {
    const nextUserMessage = await tx.chatMessage.create({
      data: {
        threadId: ownedThread.thread.id,
        role: "user",
        content: userMessageContent,
        data: {} as never,
      },
    });
    const nextAssistantMessage = await tx.chatMessage.create({
      data: {
        threadId: ownedThread.thread.id,
        role: "assistant",
        content: reply,
        data: buildAssistantImageTurnMessageData({
          reply,
          outputShape: "ideation_angles",
          surfaceMode: "offer_options",
          quickReplies,
          angles,
          ideationFormatHint: "post",
          supportAsset: imageTurnContext.supportAsset,
          imageTurnContext: ideationContext,
        }) as never,
      },
    });
    await tx.chatThread.update({
      where: { id: ownedThread.thread.id },
      data: {
        updatedAt: new Date(),
      },
    });
    return {
      userMessage: nextUserMessage,
      assistantMessage: nextAssistantMessage,
    };
  });

  return NextResponse.json({
    ok: true,
    data: {
      threadId: ownedThread.thread.id,
      userMessage: serializeStoredChatMessage({ message: userMessage }),
      assistantMessage: serializeStoredChatMessage({ message: assistantMessage }),
    },
  });
}
