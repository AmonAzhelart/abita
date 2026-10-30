import { NextResponse } from "next/server";
import { commentoCliente, daLink, Errore, meshModelli } from "@/lib/progetti";

// Il link del cliente: solo la versione pubblicata e i suoi commenti. Niente bozze, niente appunti tuoi o di Claude.
export async function GET(req: Request, ctx: RouteContext<"/api/v/[s]">) {
  const p = await daLink((await ctx.params).s);
  if (!p?.pubblicato) return NextResponse.json({ errore: "Progetto non trovato" }, { status: 404 });
  if (new URL(req.url).searchParams.has("modelli")) return NextResponse.json(await meshModelli(p));
  return NextResponse.json({ nome: p.nome, cliente: p.cliente, ...p.pubblicato, modelli: p.modelli ?? {}, commenti: p.appunti.filter(a => a.da === "cliente").map(({ id, piano, a, testo, stato }) => ({ id, piano, a, testo, stato })) });
}

export async function POST(req: Request, ctx: RouteContext<"/api/v/[s]">) {
  try {
    const b = await req.json();
    await commentoCliente((await ctx.params).s, b);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Errore) return NextResponse.json({ errore: e.message }, { status: e.stato });
    return NextResponse.json({ errore: "Richiesta non valida" }, { status: 400 });
  }
}
