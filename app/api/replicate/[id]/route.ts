import { NextRequest } from "next/server";
import { NextResponse } from "next/server";

type Context = {
  params: {
    id: string;
  };
};

export async function GET(_req: NextRequest, context: Context) {
  const id = context.params.id;

  const res = await fetch(`https://api.replicate.com/v1/predictions/${id}`, {
    headers: {
      Authorization: `Token ${process.env.REPLICATE_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  const data = await res.json();

  return NextResponse.json(data, { status: res.status });
}
