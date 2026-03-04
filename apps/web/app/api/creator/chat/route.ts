import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      errors: [
        {
          field: "route",
          message: "This route is deprecated. Use /api/creator/v2/chat instead.",
        },
      ],
    },
    { status: 410 },
  );
}
