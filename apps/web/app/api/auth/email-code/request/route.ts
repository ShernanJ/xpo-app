import { NextResponse } from "next/server";

import { requestSupabaseEmailCode } from "@/lib/auth/supabase";

interface EmailCodeRequestBody {
  email?: unknown;
}

export async function POST(request: Request) {
  let body: EmailCodeRequestBody;

  try {
    body = (await request.json()) as EmailCodeRequestBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email) {
    return NextResponse.json({ ok: false, error: "Email is required." }, { status: 400 });
  }

  const result = await requestSupabaseEmailCode(email, { createUser: true });
  if (!result.ok) {
    const status =
      result.error.code === "missing_configuration"
        ? 500
        : result.error.code === "rate_limited"
          ? 429
          : 400;
    return NextResponse.json({ ok: false, error: result.error.message }, { status });
  }

  return NextResponse.json({ ok: true });
}
