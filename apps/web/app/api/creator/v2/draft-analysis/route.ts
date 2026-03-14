import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/serverSession";
import { inspectDraft, type DraftInspectorMode } from "@/lib/agent-v2/agents/draftInspector";
import { buildDraftReviewPrompt } from "@/lib/agent-v2/responses/assistantReplyStyle";
import { prisma } from "@/lib/db";
import { ACTION_CREDIT_COST } from "@/lib/billing/config";
import { consumeCredits, refundCredits } from "@/lib/billing/credits";
import {
  canAccessDraftAnalysis,
  getDraftAnalysisUpgradeMessage,
} from "@/lib/billing/rules";
import { isMonetizationEnabled } from "@/lib/billing/monetization";
import {
  ensureBillingEntitlement,
  getBillingStateForUser,
} from "@/lib/billing/entitlements";
import {
  resolveOwnedThreadForWorkspace,
  resolveWorkspaceHandleForRequest,
} from "@/lib/workspaceHandle.server";

interface DraftAnalysisRequest extends Record<string, unknown> {
  mode?: unknown;
  draft?: unknown;
  currentDraft?: unknown;
  threadId?: unknown;
}

function parseMode(value: unknown): DraftInspectorMode | null {
  return value === "analyze" || value === "compare" ? value : null;
}

export async function POST(request: NextRequest) {
  const monetizationEnabled = isMonetizationEnabled();
  const session = await getServerSession();
  if (!session?.user?.id) {
    return NextResponse.json(
      { ok: false, errors: [{ field: "auth", message: "Unauthorized" }] },
      { status: 401 },
    );
  }

  let body: DraftAnalysisRequest;

  try {
    body = (await request.json()) as DraftAnalysisRequest;
  } catch {
    return NextResponse.json(
      { ok: false, errors: [{ field: "body", message: "Request body must be valid JSON." }] },
      { status: 400 },
    );
  }

  const mode = parseMode(body.mode);
  const draft = typeof body.draft === "string" ? body.draft.trim() : "";
  const currentDraft =
    typeof body.currentDraft === "string" ? body.currentDraft.trim() : "";
  const threadId =
    typeof body.threadId === "string" && body.threadId.trim()
      ? body.threadId.trim()
      : "";

  if (!mode || !draft || !threadId) {
    return NextResponse.json(
      {
        ok: false,
        errors: [{ field: "payload", message: "A valid mode, draft, and thread are required." }],
      },
      { status: 400 },
    );
  }

  if (mode === "compare" && !currentDraft) {
    return NextResponse.json(
      {
        ok: false,
        errors: [{ field: "currentDraft", message: "Current draft is required for compare mode." }],
      },
      { status: 400 },
    );
  }

  if (monetizationEnabled) {
    const entitlement = await ensureBillingEntitlement(session.user.id);
    if (!canAccessDraftAnalysis(entitlement.plan, mode)) {
      const billingState = await getBillingStateForUser(session.user.id);
      return NextResponse.json(
        {
          ok: false,
          code: "PLAN_REQUIRED",
          errors: [
            {
              field: "billing",
              message: getDraftAnalysisUpgradeMessage(mode),
            },
          ],
          data: { billing: billingState.billing },
        },
        { status: 403 },
      );
    }
  }

  const creditCost =
    mode === "compare"
      ? ACTION_CREDIT_COST.draft_analysis_compare
      : ACTION_CREDIT_COST.draft_analysis_analyze;
  let debitedCharge: { cost: number; idempotencyKey: string } | null = null;

  try {
    const workspaceHandle = await resolveWorkspaceHandleForRequest({
      request,
      session,
    });
    if (!workspaceHandle.ok) {
      return workspaceHandle.response;
    }

    if (monetizationEnabled) {
      const debitIdempotencyKey = `draft-analysis:${session.user.id}:${threadId}:${mode}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
      const creditResult = await consumeCredits({
        userId: session.user.id,
        cost: creditCost,
        idempotencyKey: debitIdempotencyKey,
        source: "creator_v2_draft_analysis",
        metadata: {
          mode,
          threadId,
        },
      });

      if (!creditResult.ok) {
        if (creditResult.reason === "RATE_LIMITED") {
          return NextResponse.json(
            {
              ok: false,
              code: "RATE_LIMITED",
              errors: [{ field: "rate", message: "Too many requests. Please wait a minute." }],
              data: {
                billing: creditResult.snapshot,
              },
            },
            {
              status: 429,
              headers: creditResult.retryAfterSeconds
                ? { "Retry-After": String(creditResult.retryAfterSeconds) }
                : undefined,
            },
          );
        }

        if (creditResult.reason === "ENTITLEMENT_INACTIVE") {
          return NextResponse.json(
            {
              ok: false,
              code: "PLAN_REQUIRED",
              errors: [{ field: "billing", message: "Billing is not active. Update payment to continue." }],
              data: {
                billing: creditResult.snapshot,
              },
            },
            { status: 403 },
          );
        }

        return NextResponse.json(
          {
            ok: false,
            code: "INSUFFICIENT_CREDITS",
            errors: [{ field: "billing", message: "You've reached your credit limit. Upgrade to continue." }],
            data: {
              billing: creditResult.snapshot,
            },
          },
          { status: 402 },
        );
      }

      debitedCharge = {
        cost: creditResult.cost,
        idempotencyKey: creditResult.idempotencyKey,
      };
    }

    const ownedThread = await resolveOwnedThreadForWorkspace({
      threadId,
      userId: session.user.id,
      xHandle: workspaceHandle.xHandle,
    });
    if (!ownedThread.ok) {
      return ownedThread.response;
    }
    const thread = ownedThread.thread;

    const summary = await inspectDraft({
      mode,
      draft,
      currentDraft: currentDraft || null,
    });

    const prompt = buildDraftReviewPrompt(mode);

    const [userMessage, assistantMessage] = await prisma.$transaction([
      prisma.chatMessage.create({
        data: {
          threadId: thread.id,
          role: "user",
          content: prompt,
        },
      }),
      prisma.chatMessage.create({
        data: {
          threadId: thread.id,
          role: "assistant",
          content: summary,
        },
      }),
    ]);

    await prisma.chatThread.update({
      where: { id: thread.id },
      data: {
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({
      ok: true,
      data: {
        summary,
        prompt,
        userMessageId: userMessage.id,
        assistantMessageId: assistantMessage.id,
        billing: monetizationEnabled
          ? await getBillingStateForUser(session.user.id)
          : null,
      },
    });
  } catch (error) {
    if (debitedCharge) {
      await refundCredits({
        userId: session.user.id,
        amount: debitedCharge.cost,
        idempotencyKey: `refund:${debitedCharge.idempotencyKey}`,
        source: "creator_v2_draft_analysis_error_refund",
        metadata: {
          reason: "route_error",
        },
      }).catch((refundError) =>
        console.error("Failed to refund draft-analysis credits after route error:", refundError),
      );
    }

    console.error("POST /api/creator/v2/draft-analysis failed", error);
    return NextResponse.json(
      { ok: false, errors: [{ field: "server", message: "Failed to analyze the draft." }] },
      { status: 500 },
    );
  }
}
