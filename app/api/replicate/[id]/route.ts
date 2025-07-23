// app/api/replicate/[id]/route.ts
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

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

  // pass the replicate JSON straight through
  return new Response(await res.text(), {
    status: res.status,
    headers: { "Content-type": "application/json" },
  });
}