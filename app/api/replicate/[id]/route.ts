export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  const res = await fetch(`https://api.replicate.com/v1/predictions/${params.id}`, {
    headers: {
      Authorization: `Token ${process.env.REPLICATE_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  const data = await res.json();

  return new Response(JSON.stringify(data), {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
}