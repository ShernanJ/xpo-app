import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import {
  createSessionToken,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
} from "@/lib/auth/session";

export const dynamic = "force-dynamic";

interface TestSessionBody {
  userId?: unknown;
  email?: unknown;
  name?: unknown;
  handle?: unknown;
  activeXHandle?: unknown;
}

function normalizeHandle(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.replace(/^@/, "").trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function setSessionCookie(response: NextResponse, token: string) {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function POST(request: Request) {
  if (process.env.PLAYWRIGHT_AUTH_BYPASS !== "1") {
    return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
  }

  let body: TestSessionBody = {};
  try {
    body = (await request.json()) as TestSessionBody;
  } catch {
    body = {};
  }

  const userId =
    typeof body.userId === "string" && body.userId.trim().length > 0
      ? body.userId.trim()
      : "playwright-chat-user";
  const email =
    typeof body.email === "string" && body.email.trim().length > 0
      ? body.email.trim().toLowerCase()
      : "playwright-chat@example.com";
  const name =
    typeof body.name === "string" && body.name.trim().length > 0
      ? body.name.trim()
      : "Playwright Chat";
  const handle = normalizeHandle(body.handle);
  const activeXHandle = normalizeHandle(body.activeXHandle);

  const user = await prisma.user.upsert({
    where: { id: userId },
    create: {
      id: userId,
      email,
      name,
      handle,
      activeXHandle,
    },
    update: {
      email,
      name,
      handle,
      activeXHandle,
    },
    select: {
      id: true,
      email: true,
      name: true,
      handle: true,
      activeXHandle: true,
    },
  });

  const sessionToken = await createSessionToken({
    userId: user.id,
    email: user.email,
  });

  const response = NextResponse.json({
    ok: true,
    data: {
      user,
    },
  });
  setSessionCookie(response, sessionToken);
  return response;
}
