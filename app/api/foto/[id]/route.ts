import { datiFoto } from "@/lib/progetti";

export async function GET(_: Request, ctx: RouteContext<"/api/foto/[id]">) {
  const d = await datiFoto((await ctx.params).id);
  if (!d) return new Response("Foto non trovata", { status: 404 });
  const [testa, b64] = d.split(",");
  return new Response(Buffer.from(b64, "base64"), { headers: { "content-type": testa.slice(5, testa.indexOf(";")), "cache-control": "private, max-age=31536000, immutable" } });
}
