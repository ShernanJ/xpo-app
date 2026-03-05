import { prisma } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";

import {
  LIFETIME_RESERVATION_TTL_MINUTES,
  LIFETIME_SLOT_LIMIT,
} from "@/lib/billing/config";

function reservationExpiresAt(from: Date = new Date()): Date {
  return new Date(from.getTime() + LIFETIME_RESERVATION_TTL_MINUTES * 60_000);
}

async function expireStaleReservationsTx(tx: Prisma.TransactionClient) {
  const now = new Date();
  await tx.lifetimeSlotReservation.updateMany({
    where: {
      status: "pending",
      expiresAt: {
        lt: now,
      },
    },
    data: {
      status: "expired",
      canceledAt: now,
    },
  });
}

export async function getLifetimeSlotsSummary(): Promise<{
  total: number;
  sold: number;
  reserved: number;
  remaining: number;
}> {
  const now = new Date();

  await prisma.lifetimeSlotReservation.updateMany({
    where: {
      status: "pending",
      expiresAt: {
        lt: now,
      },
    },
    data: {
      status: "expired",
      canceledAt: now,
    },
  });

  const [sold, reserved] = await Promise.all([
    prisma.billingEntitlement.count({
      where: {
        plan: "lifetime",
      },
    }),
    prisma.lifetimeSlotReservation.count({
      where: {
        status: "pending",
        expiresAt: {
          gte: now,
        },
      },
    }),
  ]);

  const remaining = Math.max(0, LIFETIME_SLOT_LIMIT - sold - reserved);

  return {
    total: LIFETIME_SLOT_LIMIT,
    sold,
    reserved,
    remaining,
  };
}

export async function reserveLifetimeSlot(userId: string): Promise<{
  ok: true;
  reservationId: string;
  expiresAt: string;
} | {
  ok: false;
  reason: "SOLD_OUT";
}> {
  return prisma.$transaction(async (tx) => {
    await expireStaleReservationsTx(tx);

    const now = new Date();
    const existingPending = await tx.lifetimeSlotReservation.findFirst({
      where: {
        userId,
        status: "pending",
        expiresAt: {
          gte: now,
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    if (existingPending) {
      return {
        ok: true as const,
        reservationId: existingPending.id,
        expiresAt: existingPending.expiresAt.toISOString(),
      };
    }

    const [sold, reserved] = await Promise.all([
      tx.billingEntitlement.count({
        where: {
          plan: "lifetime",
        },
      }),
      tx.lifetimeSlotReservation.count({
        where: {
          status: "pending",
          expiresAt: {
            gte: now,
          },
        },
      }),
    ]);

    if (sold + reserved >= LIFETIME_SLOT_LIMIT) {
      return {
        ok: false as const,
        reason: "SOLD_OUT" as const,
      };
    }

    const reservation = await tx.lifetimeSlotReservation.create({
      data: {
        userId,
        status: "pending",
        expiresAt: reservationExpiresAt(now),
      },
    });

    return {
      ok: true as const,
      reservationId: reservation.id,
      expiresAt: reservation.expiresAt.toISOString(),
    };
  });
}

export async function attachCheckoutSessionToReservation(args: {
  reservationId: string;
  sessionId: string;
}): Promise<void> {
  await prisma.lifetimeSlotReservation.update({
    where: {
      id: args.reservationId,
    },
    data: {
      stripeCheckoutSessionId: args.sessionId,
    },
  });
}

export async function markLifetimeReservationCompletedById(reservationId: string): Promise<void> {
  await prisma.lifetimeSlotReservation.updateMany({
    where: {
      id: reservationId,
      status: "pending",
    },
    data: {
      status: "completed",
      completedAt: new Date(),
    },
  });
}

export async function releaseLifetimeReservationBySessionId(sessionId: string): Promise<void> {
  await prisma.lifetimeSlotReservation.updateMany({
    where: {
      stripeCheckoutSessionId: sessionId,
      status: "pending",
    },
    data: {
      status: "expired",
      canceledAt: new Date(),
    },
  });
}

export async function releaseLifetimeReservationById(reservationId: string): Promise<void> {
  await prisma.lifetimeSlotReservation.updateMany({
    where: {
      id: reservationId,
      status: "pending",
    },
    data: {
      status: "canceled",
      canceledAt: new Date(),
    },
  });
}
