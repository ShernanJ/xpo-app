import { buildChatSuccessResponse } from "../response/routeResponse.ts";
import { findDuplicateTurnReplay } from "../request/routeIdempotency.ts";

export interface RouteDebitedCharge {
  cost: number;
  idempotencyKey: string;
}

export interface RouteControlPlaneDeps {
  findDuplicateTurnReplay: typeof findDuplicateTurnReplay;
  buildChatSuccessResponse: typeof buildChatSuccessResponse;
  consumeCredits: Awaited<
    typeof import("../../../../../../../lib/billing/credits.ts")
  >["consumeCredits"];
  refundCredits: Awaited<
    typeof import("../../../../../../../lib/billing/credits.ts")
  >["refundCredits"];
}

async function loadBillingCreditDeps(): Promise<
  Pick<RouteControlPlaneDeps, "consumeCredits" | "refundCredits">
> {
  const creditsModule = await import("../../../../../../../lib/billing/credits.ts");
  return {
    consumeCredits: creditsModule.consumeCredits,
    refundCredits: creditsModule.refundCredits,
  };
}

export async function maybeReplayDuplicateTurn(args: {
  threadId: string;
  clientTurnId: string | null;
  loadBilling: () => Promise<unknown>;
  listThreadMessages: (args: {
    threadId: string;
  }) => Promise<
    Array<{
      id: string;
      role: string;
      data: unknown;
      createdAt: Date | string;
    }>
  >;
}): Promise<Response | null> {
  return maybeReplayDuplicateTurnWithDeps(
    args,
    {
      findDuplicateTurnReplay,
      buildChatSuccessResponse,
    },
  );
}

export async function maybeReplayDuplicateTurnWithDeps(
  args: {
    threadId: string;
    clientTurnId: string | null;
    loadBilling: () => Promise<unknown>;
    listThreadMessages: (args: {
      threadId: string;
    }) => Promise<
      Array<{
        id: string;
        role: string;
        data: unknown;
        createdAt: Date | string;
      }>
    >;
  },
  deps: Pick<RouteControlPlaneDeps, "findDuplicateTurnReplay" | "buildChatSuccessResponse">,
): Promise<Response | null> {
  if (!args.clientTurnId) {
    return null;
  }

  const duplicateTurnReplay = await deps.findDuplicateTurnReplay(
    {
      threadId: args.threadId,
      clientTurnId: args.clientTurnId,
    },
    {
      listThreadMessages: args.listThreadMessages,
    },
  );

  if (!duplicateTurnReplay) {
    return null;
  }

  return deps.buildChatSuccessResponse({
    mappedData: duplicateTurnReplay.mappedData,
    createdAssistantMessageId: duplicateTurnReplay.assistantMessageId,
    loadBilling: args.loadBilling,
  });
}

export async function chargeRouteTurn(args: {
  monetizationEnabled: boolean;
  userId: string;
  threadId: string | null;
  turnCreditCost: number;
  explicitIntent: string | null;
}): Promise<{ failureResponse: Response | null; debitedCharge: RouteDebitedCharge | null }> {
  const { consumeCredits } = await loadBillingCreditDeps();
  return chargeRouteTurnWithDeps(args, { consumeCredits });
}

export async function chargeRouteTurnWithDeps(
  args: {
    monetizationEnabled: boolean;
    userId: string;
    threadId: string | null;
    turnCreditCost: number;
    explicitIntent: string | null;
  },
  deps: Pick<RouteControlPlaneDeps, "consumeCredits">,
): Promise<{ failureResponse: Response | null; debitedCharge: RouteDebitedCharge | null }> {
  if (!args.monetizationEnabled) {
    return { failureResponse: null, debitedCharge: null };
  }

  const debitIdempotencyKey = `chat:${args.userId}:${args.threadId || "new"}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
  const creditResult = await deps.consumeCredits({
    userId: args.userId,
    cost: args.turnCreditCost,
    idempotencyKey: debitIdempotencyKey,
    source: "creator_v2_chat",
    metadata: {
      intent: args.explicitIntent || "auto",
      threadId: args.threadId || null,
    },
  });

  if (creditResult.ok) {
    return {
      failureResponse: null,
      debitedCharge: {
        cost: creditResult.cost,
        idempotencyKey: creditResult.idempotencyKey,
      },
    };
  }

  if (creditResult.reason === "RATE_LIMITED") {
    return {
      failureResponse: Response.json(
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
      ),
      debitedCharge: null,
    };
  }

  if (creditResult.reason === "ENTITLEMENT_INACTIVE") {
    return {
      failureResponse: Response.json(
        {
          ok: false,
          code: "PLAN_REQUIRED",
          errors: [{ field: "billing", message: "Billing is not active. Update payment to continue." }],
          data: {
            billing: creditResult.snapshot,
          },
        },
        { status: 403 },
      ),
      debitedCharge: null,
    };
  }

  return {
    failureResponse: Response.json(
      {
        ok: false,
        code: "INSUFFICIENT_CREDITS",
        errors: [{ field: "billing", message: "You've reached your credit limit. Upgrade to continue." }],
        data: {
          billing: creditResult.snapshot,
        },
      },
      { status: 402 },
    ),
    debitedCharge: null,
  };
}

export async function refundRouteTurnCharge(args: {
  userId: string;
  debitedCharge: RouteDebitedCharge | null;
}): Promise<void> {
  const { refundCredits } = await loadBillingCreditDeps();
  return refundRouteTurnChargeWithDeps(args, { refundCredits });
}

export async function refundRouteTurnChargeWithDeps(
  args: {
    userId: string;
    debitedCharge: RouteDebitedCharge | null;
  },
  deps: Pick<RouteControlPlaneDeps, "refundCredits">,
): Promise<void> {
  if (!args.debitedCharge) {
    return;
  }

  await deps.refundCredits({
    userId: args.userId,
    amount: args.debitedCharge.cost,
    idempotencyKey: `refund:${args.debitedCharge.idempotencyKey}`,
    source: "creator_v2_chat_error_refund",
    metadata: {
      reason: "route_error",
    },
  }).catch((refundError) =>
    console.error("Failed to refund chat credits after route error:", refundError),
  );
}

export function buildRouteServerErrorResponse(): Response {
  return Response.json(
    { ok: false, errors: [{ field: "server", message: "Failed to process turn." }] },
    { status: 500 },
  );
}
