import { NextResponse } from "next/server";
import * as P from "@/lib/progetti";

// API dell'editor (protetta dal proxy). GET = controllo modifiche, POST = un'azione.
export async function GET(req: Request) {
  const u = new URL(req.url), p = await P.carica(u.searchParams.get("id") ?? "");
  if (!p) return NextResponse.json({ errore: "Progetto non trovato" }, { status: 404 });
  if (u.searchParams.has("modelli")) return NextResponse.json(await P.meshModelli(p));
  const h = { "x-versione": process.env.VERSIONE ?? "" };
  if (String(p.rev) === u.searchParams.get("rev")) return new Response(null, { status: 204, headers: h });
  return NextResponse.json(p, { headers: h });
}

export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const id = String(b.id ?? "");
  try {
    switch (b.azione) {
      case "crea": return NextResponse.json(await P.crea(String(b.nome ?? ""), String(b.cliente ?? ""), String(b.testo ?? "")));
      case "modello": return NextResponse.json(await P.salvaModello(id, b.nome, b.info, b.mesh));
      case "salva": return NextResponse.json((await P.salvaTesto(id, String(b.testo ?? ""), "io", "", b.baseRev)).p);
      case "pubblica": return NextResponse.json(await P.pubblica(id, "io", b.nota));
      case "appunto": await P.nuovoAppunto(id, b, "io"); break;
      case "cambiaAppunto": return NextResponse.json(await P.cambiaAppunto(id, String(b.aid), b, "io"));
      case "togliAppunto": return NextResponse.json(await P.togliAppunto(id, String(b.aid)));
      case "foto": await P.nuovaFoto(id, b); break;
      case "cambiaFoto": return NextResponse.json(await P.cambiaFoto(id, String(b.fid), b));
      case "togliFoto": return NextResponse.json(await P.togliFoto(id, String(b.fid)));
      case "rinomina": return NextResponse.json(await P.rinomina(id, b));
      case "nuovoLink": return NextResponse.json(await P.nuovoLink(id));
      case "storia": return NextResponse.json(await P.storia(id));
      case "ripristina": return NextResponse.json(await P.ripristina(id, Number(b.rev)));
      default: return NextResponse.json({ errore: "Azione sconosciuta" }, { status: 400 });
    }
    return NextResponse.json(await P.carica(id));
  } catch (e) {
    if (e instanceof P.Errore) return NextResponse.json({ errore: e.message }, { status: e.stato });
    throw e;
  }
}
