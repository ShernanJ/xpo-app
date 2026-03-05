import { NextResponse } from "next/server";

import { getServerSession, updateAppSessionUser } from "@/lib/auth/serverSession";

interface SessionPatchBody {
  activeXHandle?: unknown;
  handle?: unknown;
}

function normalizeHandle(value: string): string | null {
  const normalized = value.replace(/^@/, "").trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

export async function GET() {
  const session = await getServerSession();
  return NextResponse.json({ ok: true, session });
}

export async function PATCH(request: Request) {
  const session = await getServerSession();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  let body: SessionPatchBody;
  try {
    body = (await request.json()) as SessionPatchBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const activeXHandle =
    typeof body.activeXHandle === "string"
      ? normalizeHandle(body.activeXHandle)
      : body.activeXHandle === null
        ? null
        : undefined;
  const handle =
    typeof body.handle === "string"
      ? normalizeHandle(body.handle)
      : body.handle === null
        ? null
        : undefined;

  const nextSession = await updateAppSessionUser(session.user.id, {
    activeXHandle,
    handle,
  });

  return NextResponse.json({
    ok: true,
    session: nextSession,
  });
}
