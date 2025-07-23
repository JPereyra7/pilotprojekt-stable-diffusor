// app/api/replicate/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _req: NextRequest,
  // NB: anonym inline‑typ – ingen egen alias!
  { params }: { params: { id: string } }
) {
  const { id } = params;

  const res = await fetch(
    `https://api.replicate.com/v1/predictions/${id}`,
    {
      headers: {
        Authorization: `Token ${process.env.REPLICATE_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    }
  );

  const data = await res.json();

  return NextResponse.json(data, { status: res.status });
}
